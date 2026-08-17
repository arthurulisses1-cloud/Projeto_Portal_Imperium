"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function publicarMural(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const tipo = String(formData.get("tipo"));
  const titulo = String(formData.get("titulo") ?? "").trim();
  const corpo = String(formData.get("corpo") ?? "").trim();
  if (!titulo) throw new Error("Título é obrigatório.");

  const { error } = await supabase.from("mural_posts").insert({
    autor_id: user.id,
    tipo,
    titulo,
    corpo: corpo || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/");
}
