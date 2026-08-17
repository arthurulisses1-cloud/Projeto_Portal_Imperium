"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function abrirContestacao(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const referencia = String(formData.get("referencia") ?? "").trim();
  const valorRaw = formData.get("valor_contestado");
  const motivo = String(formData.get("motivo") ?? "").trim();

  if (!motivo) throw new Error("Motivo é obrigatório.");

  const { error } = await supabase.from("contestacoes").insert({
    profile_id: user.id,
    referencia: referencia || null,
    valor_contestado: valorRaw ? Number(valorRaw) : null,
    motivo,
    status: "aberto",
  });

  if (error) throw new Error(error.message);
  revalidatePath("/comissao");
}
