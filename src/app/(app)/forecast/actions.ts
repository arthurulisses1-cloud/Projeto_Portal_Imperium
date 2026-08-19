"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { podeEditarOperacao, type StatusManual } from "@/lib/forecast";

export async function salvarStatusForecast(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const { data: meProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!meProfile) throw new Error("Perfil não encontrado.");

  const operacaoId = String(formData.get("operacao_id"));
  const statusManualRaw = String(formData.get("status_manual") ?? "");
  const statusManual: StatusManual | null =
    statusManualRaw === "resolvendo_pendencia" || statusManualRaw === "aguardando_pagamento"
      ? statusManualRaw
      : null;
  const observacao = String(formData.get("observacao") ?? "").trim();

  // Não confia no "podeEditar" que já veio calculado pra tela — reconfere
  // aqui com dados frescos do banco antes de gravar.
  const admin = createAdminClient();
  const { data: op } = await admin
    .from("weekly_operacoes")
    .select("id, sdr_profile_id, closer_profile_id")
    .eq("id", operacaoId)
    .single();
  if (!op) throw new Error("Operação não encontrada.");

  let exercitoLideradoId: string | null = null;
  if (meProfile.role === "lider") {
    const { data: ex } = await admin.from("exercitos").select("id").eq("legado_id", user.id).maybeSingle();
    exercitoLideradoId = ex?.id ?? null;
  }

  const idsEnvolvidos = [op.sdr_profile_id, op.closer_profile_id].filter((x): x is string => !!x);
  const { data: envolvidos } =
    idsEnvolvidos.length > 0
      ? await admin.from("profiles").select("id, tribo:tribos!profiles_tribo_id_fkey(exercito_id)").in("id", idsEnvolvidos)
      : { data: [] };
  const exercitoPorProfileId = new Map(
    (envolvidos ?? []).map((p) => [p.id, (p.tribo as unknown as { exercito_id: string } | null)?.exercito_id ?? null])
  );

  const permitido = podeEditarOperacao(
    { id: user.id, role: meProfile.role, exercitoLideradoId },
    {
      closerProfileId: op.closer_profile_id,
      sdrExercitoId: op.sdr_profile_id ? exercitoPorProfileId.get(op.sdr_profile_id) ?? null : null,
      closerExercitoId: op.closer_profile_id ? exercitoPorProfileId.get(op.closer_profile_id) ?? null : null,
    }
  );
  if (!permitido) throw new Error("Você não tem permissão pra editar esta operação.");

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
