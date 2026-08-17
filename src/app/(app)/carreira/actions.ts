"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function registrarMetaPessoal(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const nivelAlvo = String(formData.get("nivel_alvo"));
  const dataAlvo = String(formData.get("data_alvo"));

  const { error } = await supabase.from("metas_pessoais").insert({
    profile_id: user.id,
    nivel_alvo: nivelAlvo,
    data_alvo: dataAlvo,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/carreira");
}

export async function escolherLivro(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const livroId = String(formData.get("livro_id"));

  const { error } = await supabase.from("biblioteca_escolhas").insert({
    profile_id: user.id,
    livro_id: livroId,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/carreira");
}

export async function marcarApresentado(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const escolhaId = String(formData.get("escolha_id"));

  const { error } = await supabase
    .from("biblioteca_escolhas")
    .update({ apresentado: true, apresentado_em: new Date().toISOString() })
    .eq("id", escolhaId)
    .eq("profile_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/carreira");
}
