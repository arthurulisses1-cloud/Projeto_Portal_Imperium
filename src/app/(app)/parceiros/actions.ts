"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { podeEditarOperacao } from "@/lib/forecast";

// Mesma checagem de src/app/(app)/forecast/actions.ts (não reaproveita
// dali porque é privada por arquivo, mesmo padrão de cada rota ter seu
// próprio guard) — não confia no "podeEditar" calculado pra tela.
async function exigirPermissaoOperacao(admin: SupabaseClient, userId: string, operacaoId: string) {
  const { data: meProfile } = await admin.from("profiles").select("role").eq("id", userId).single();
  if (!meProfile) throw new Error("Perfil não encontrado.");

  const { data: op } = await admin
    .from("weekly_operacoes")
    .select("id, sdr_profile_id, closer_profile_id")
    .eq("id", operacaoId)
    .single();
  if (!op) throw new Error("Operação não encontrada.");

  let exercitoLideradoId: string | null = null;
  if (meProfile.role === "lider") {
    const { data: ex } = await admin.from("exercitos").select("id").eq("legado_id", userId).maybeSingle();
    exercitoLideradoId = ex?.id ?? null;
  }

  const idsEnvolvidos = [op.sdr_profile_id, op.closer_profile_id].filter((x): x is string => !!x);
  const [{ data: envolvidos }, { data: exercitosPorLegado }] = await Promise.all([
    idsEnvolvidos.length > 0
      ? admin.from("profiles").select("id, tribo:tribos!profiles_tribo_id_fkey(exercito_id)").in("id", idsEnvolvidos)
      : Promise.resolve({ data: [] }),
    admin.from("exercitos").select("id, legado_id").in("legado_id", idsEnvolvidos),
  ]);
  const exercitoIdPorLegadoId = new Map((exercitosPorLegado ?? []).map((e) => [e.legado_id, e.id]));
  const exercitoPorProfileId = new Map(
    (envolvidos ?? []).map((p) => [
      p.id,
      (p.tribo as unknown as { exercito_id: string } | null)?.exercito_id ?? exercitoIdPorLegadoId.get(p.id) ?? null,
    ])
  );

  const permitido = podeEditarOperacao(
    { id: userId, role: meProfile.role, exercitoLideradoId },
    {
      closerProfileId: op.closer_profile_id,
      sdrExercitoId: op.sdr_profile_id ? exercitoPorProfileId.get(op.sdr_profile_id) ?? null : null,
      closerExercitoId: op.closer_profile_id ? exercitoPorProfileId.get(op.closer_profile_id) ?? null : null,
    }
  );
  if (!permitido) throw new Error("Você não tem permissão pra cadastrar parceiro nesta venda.");
}

// Closer/Líder registram, por venda paga, se existe repasse a um parceiro —
// padrão é 1% (dre_configuracoes.pct_receita_parceiro), acima disso a
// linha entra como "pendente_aprovacao" até o Diretor aprovar em
// /fechamento. Qualquer edição recalcula o status do zero — mexer numa
// comissão já aprovada pede aprovação de novo.
export async function salvarComissaoParceiro(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const operacaoId = String(formData.get("operacao_id"));
  const nomeParceiro = String(formData.get("nome_parceiro") ?? "").trim();
  const percentual = Number(formData.get("percentual"));
  const chavePix = String(formData.get("chave_pix") ?? "").trim();
  if (!nomeParceiro || !chavePix || !percentual || percentual <= 0) {
    throw new Error("Preencha nome do parceiro, % e chave Pix.");
  }

  const admin = createAdminClient();
  await exigirPermissaoOperacao(admin, user.id, operacaoId);

  const { data: config } = await admin.from("dre_configuracoes").select("pct_receita_parceiro").eq("id", true).single();
  const pctPadrao = Number(config?.pct_receita_parceiro ?? 0.01) * 100;
  const status = percentual > pctPadrao ? "pendente_aprovacao" : "ok";

  const { error } = await admin.from("comissoes_parceiro").upsert(
    {
      weekly_operacao_id: operacaoId,
      nome_parceiro: nomeParceiro,
      percentual,
      chave_pix: chavePix,
      status,
      criado_por: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "weekly_operacao_id" }
  );
  if (error) throw new Error(error.message);

  revalidatePath("/parceiros");
  revalidatePath("/fechamento");
}
