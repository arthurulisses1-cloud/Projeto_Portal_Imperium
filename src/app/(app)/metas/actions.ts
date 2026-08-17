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
