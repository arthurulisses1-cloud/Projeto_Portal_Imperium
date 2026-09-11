"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { TRANSICOES } from "@/lib/metas";

export async function salvarMeta(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const ano = Number(formData.get("ano"));
  const mes = Number(formData.get("mes"));
  const metaCredito = Number(formData.get("meta_credito_total") ?? 0);
  const metaTicket = Number(formData.get("meta_ticket_medio") ?? 0);

  const { data: meta, error } = await supabase
    .from("metas_mensais")
    .upsert(
      {
        ano,
        mes,
        meta_credito_total: metaCredito,
        meta_ticket_medio: metaTicket,
        criado_por: user.id,
      },
      { onConflict: "ano,mes" }
    )
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await supabase.from("metas_conversao").delete().eq("meta_mensal_id", meta.id);

  const linhas = TRANSICOES.map((t) => ({
    meta_mensal_id: meta.id,
    etapa_de: t.de,
    etapa_para: t.para,
    taxa_esperada: Number(formData.get(`taxa_${t.de}_${t.para}`) ?? 0) / 100,
  })).filter((l) => l.taxa_esperada > 0);

  if (linhas.length > 0) {
    const { error: err2 } = await supabase.from("metas_conversao").insert(linhas);
    if (err2) throw new Error(err2.message);
  }

  revalidatePath("/metas");
}

// Sobrescreve a meta individual de uma pessoa nesse mês (metas_individuais,
// migration 0077) — RLS já garante que só o Diretor grava de verdade
// (is_director()), aqui é só o fluxo do form.
export async function salvarMetaIndividual(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const ano = Number(formData.get("ano"));
  const mes = Number(formData.get("mes"));
  const profileId = String(formData.get("profile_id"));
  const metaCreditoRaw = String(formData.get("meta_credito") ?? "").trim();

  // Campo vazio = "volta a dividir igual" — mesmo caminho de
  // removerMetaIndividual, sem precisar de um segundo botão.
  if (!metaCreditoRaw) {
    const { error } = await supabase
      .from("metas_individuais")
      .delete()
      .eq("ano", ano)
      .eq("mes", mes)
      .eq("profile_id", profileId);
    if (error) throw new Error(error.message);
    revalidatePath("/metas");
    return;
  }

  const metaCredito = Number(metaCreditoRaw);
  if (!Number.isFinite(metaCredito) || metaCredito < 0) throw new Error("Meta inválida.");

  const { error } = await supabase.from("metas_individuais").upsert(
    { ano, mes, profile_id: profileId, meta_credito: metaCredito, criado_por: user.id },
    { onConflict: "ano,mes,profile_id" }
  );
  if (error) throw new Error(error.message);
  revalidatePath("/metas");
}
