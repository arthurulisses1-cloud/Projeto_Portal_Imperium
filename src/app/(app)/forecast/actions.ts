"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { podeEditarOperacao, MOTIVO_QUEDA_PEDE_OBS, type StatusManual, type MotivoQueda } from "@/lib/forecast";

// Não confia no "podeEditar" que já veio calculado pra tela — reconfere aqui
// com dados frescos do banco antes de gravar. Usado tanto pro status manual
// (Resolvendo Pendência/Aguardando Pagamento) quanto pro motivo de queda.
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
    // Legado do Exército não tem tribo_id — sem esse fallback, uma operação
    // fechada por ele "perde" o time (mesma regra de forecast/page.tsx).
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
  if (!permitido) throw new Error("Você não tem permissão pra editar esta operação.");
}

export async function salvarStatusForecast(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const operacaoId = String(formData.get("operacao_id"));
  const statusManualRaw = String(formData.get("status_manual") ?? "");
  const STATUS_MANUAL_VALIDOS = new Set<StatusManual>([
    "resolvendo_pendencia",
    "aguardando_pagamento",
    "analise_juridico",
    "esfriou",
  ]);
  const statusManual: StatusManual | null = STATUS_MANUAL_VALIDOS.has(statusManualRaw as StatusManual)
    ? (statusManualRaw as StatusManual)
    : null;
  const observacao = String(formData.get("observacao") ?? "").trim();

  const admin = createAdminClient();
  await exigirPermissaoOperacao(admin, user.id, operacaoId);

  const { error } = await admin
    .from("weekly_operacoes")
    .update({
      status_manual: statusManual,
      observacao: observacao || null,
      status_manual_por: user.id,
      status_manual_em: new Date().toISOString(),
    })
    .eq("id", operacaoId);
  if (error) throw new Error(error.message);

  revalidatePath("/forecast");
  revalidatePath("/weekly");
}

const MOTIVOS_VALIDOS = new Set<MotivoQueda>([
  "desistencia",
  "divida",
  "vendido",
  "curatelado",
  "criminal",
  "processual",
  "honorarios",
  "outro",
]);

export async function salvarMotivoQueda(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const operacaoId = String(formData.get("operacao_id"));
  const motivoRaw = String(formData.get("motivo_queda") ?? "");
  const motivo: MotivoQueda | null = MOTIVOS_VALIDOS.has(motivoRaw as MotivoQueda) ? (motivoRaw as MotivoQueda) : null;
  if (!motivo) throw new Error("Selecione um motivo.");
  const obs = String(formData.get("motivo_queda_obs") ?? "").trim();
  if (MOTIVO_QUEDA_PEDE_OBS.has(motivo) && !obs) {
    throw new Error("Esse motivo precisa de uma observação.");
  }

  const admin = createAdminClient();
  await exigirPermissaoOperacao(admin, user.id, operacaoId);

  const { error } = await admin
    .from("weekly_operacoes")
    .update({
      motivo_queda: motivo,
      motivo_queda_obs: obs || null,
      motivo_queda_por: user.id,
      motivo_queda_em: new Date().toISOString(),
    })
    .eq("id", operacaoId);
  if (error) throw new Error(error.message);

  revalidatePath("/forecast");
  revalidatePath("/weekly");
}

// Closer/Líder registram, por venda, se existe repasse a um parceiro —
// padrão é 1% (dre_configuracoes.pct_receita_parceiro), acima disso a
// linha entra como "pendente_aprovacao" até o Diretor aprovar em /dre
// (aprovarComissaoParceiro). Qualquer edição recalcula o status do zero —
// mexer numa comissão já aprovada pede aprovação de novo.
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

  revalidatePath("/forecast");
  revalidatePath("/dre");
}
