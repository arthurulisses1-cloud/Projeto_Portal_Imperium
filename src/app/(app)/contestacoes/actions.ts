"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function resolverContestacao(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const id = String(formData.get("id"));
  const decisao = String(formData.get("decisao")); // "aceita" | "rejeitada"
  const justificativa = String(formData.get("justificativa") ?? "").trim();

  const prefixo = decisao === "aceita" ? "[Aceita]" : "[Rejeitada]";
  const resposta = `${prefixo} ${justificativa}`.trim();

  const { error } = await supabase
    .from("contestacoes")
    .update({
      status: "resolvido",
      resposta,
      resolvido_por: user.id,
      resolvido_em: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/contestacoes");
}
