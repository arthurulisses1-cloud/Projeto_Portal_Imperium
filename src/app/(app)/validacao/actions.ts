"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function decidirEvidencia(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const id = String(formData.get("id"));
  const status = String(formData.get("status")); // aprovado | rejeitado

  const { error } = await supabase
    .from("promotion_evidence")
    .update({ status, decidido_por: user.id })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/validacao");
}
