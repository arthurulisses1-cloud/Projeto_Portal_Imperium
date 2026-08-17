"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function marcarModuloConcluido(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const moduloId = String(formData.get("modulo_id"));

  const { error } = await supabase.from("trilha_progresso").insert({
    profile_id: user.id,
    modulo_id: moduloId,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/trilha");
}
