"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function salvarObservacao(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const profileId = String(formData.get("profile_id"));
  const observacao = String(formData.get("observacao") ?? "").trim();

  const { error } = await supabase
    .from("profiles")
    .update({ observacao_diretor: observacao || null })
    .eq("id", profileId);
  if (error) throw new Error(error.message);

  revalidatePath("/legado");
}

export async function salvarAdmissao(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const profileId = String(formData.get("profile_id"));
  const dataAdmissao = String(formData.get("data_admissao") ?? "");

  const { error } = await supabase
    .from("profiles")
    .update({ data_admissao: dataAdmissao || null })
    .eq("id", profileId);
  if (error) throw new Error(error.message);

  revalidatePath("/legado");
}
