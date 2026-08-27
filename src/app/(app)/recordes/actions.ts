"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function exigirDiretor(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (profile?.role !== "diretor") throw new Error("Só o Diretor pode gerenciar os Anais do Império.");
}

export async function criarRecordeCurado(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  await exigirDiretor(supabase, user.id);

  const titulo = String(formData.get("titulo") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const valorTexto = String(formData.get("valor_texto") ?? "").trim();
  const dataReferencia = String(formData.get("data_referencia") ?? "").trim();
  const profileId = String(formData.get("profile_id") ?? "").trim();
  if (!titulo) throw new Error("Título é obrigatório.");

  const { error } = await supabase.from("recordes_curados").insert({
    titulo,
    descricao: descricao || null,
    valor_texto: valorTexto || null,
    data_referencia: dataReferencia || null,
    profile_id: profileId || null,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/recordes");
}

export async function excluirRecordeCurado(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  await exigirDiretor(supabase, user.id);

  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Recorde não encontrado.");

  const { error } = await supabase.from("recordes_curados").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/recordes");
}
