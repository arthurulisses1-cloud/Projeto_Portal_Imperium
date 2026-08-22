"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { AlvoTipo } from "@/lib/social";

export async function postarComentario(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const alvoTipo = String(formData.get("alvo_tipo") ?? "") as AlvoTipo;
  const alvoId = String(formData.get("alvo_id") ?? "");
  const texto = String(formData.get("texto") ?? "").trim();
  const mencionados = formData.getAll("mencionado").map(String).filter(Boolean);
  if (!alvoId || !texto) throw new Error("Comentário vazio.");

  const { data: comentario, error } = await supabase
    .from("post_comentarios")
    .insert({ alvo_tipo: alvoTipo, alvo_id: alvoId, autor_id: user.id, texto })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (mencionados.length > 0) {
    const { error: mencaoError } = await supabase
      .from("post_mencoes")
      .insert(mencionados.map((profileId) => ({ comentario_id: comentario.id, profile_id: profileId })));
    if (mencaoError) throw new Error(mencaoError.message);
  }

  revalidatePath("/");
  revalidatePath("/campanhas");
}

export async function excluirComentario(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const id = String(formData.get("id"));
  const { error } = await supabase.from("post_comentarios").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/campanhas");
}

export async function reagir(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const alvoTipo = String(formData.get("alvo_tipo") ?? "") as AlvoTipo;
  const alvoId = String(formData.get("alvo_id") ?? "");
  const emoji = String(formData.get("emoji") ?? "");
  if (!alvoId || !emoji) throw new Error("Reação inválida.");

  const { data: existente } = await supabase
    .from("post_reacoes")
    .select("id, emoji")
    .eq("alvo_tipo", alvoTipo)
    .eq("alvo_id", alvoId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (existente && existente.emoji === emoji) {
    // clicar de novo no mesmo emoji remove a reação
    const { error } = await supabase.from("post_reacoes").delete().eq("id", existente.id);
    if (error) throw new Error(error.message);
  } else if (existente) {
    const { error } = await supabase.from("post_reacoes").update({ emoji }).eq("id", existente.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("post_reacoes")
      .insert({ alvo_tipo: alvoTipo, alvo_id: alvoId, profile_id: user.id, emoji });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/");
  revalidatePath("/campanhas");
}

export async function marcarMencaoLida(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const id = String(formData.get("id") ?? "");
  if (id) {
    const { error } = await supabase.from("post_mencoes").update({ lido: true }).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    // sem id = marcar todas as pendentes da pessoa como lidas
    const { error } = await supabase.from("post_mencoes").update({ lido: true }).eq("profile_id", user.id).eq("lido", false);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/");
}
