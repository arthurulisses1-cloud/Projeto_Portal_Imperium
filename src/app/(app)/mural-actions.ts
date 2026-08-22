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

  let midiaUrl: string | null = null;
  const midia = formData.get("midia") as File | null;
  if (midia && midia.size > 0) {
    const ext = midia.name.split(".").pop() || "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("mural-midia")
      .upload(path, midia, { contentType: midia.type });
    if (uploadError) throw new Error(uploadError.message);
    midiaUrl = supabase.storage.from("mural-midia").getPublicUrl(path).data.publicUrl;
  }

  const { data: post, error } = await supabase
    .from("mural_posts")
    .insert({
      autor_id: user.id,
      tipo,
      titulo,
      corpo: corpo || null,
      midia_url: midiaUrl,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  if (tipo === "enquete") {
    const opcoesTexto = formData
      .getAll("opcao")
      .map((v) => String(v).trim())
      .filter(Boolean);
    if (opcoesTexto.length < 2) throw new Error("A enquete precisa de ao menos 2 opções.");

    const { data: enquete, error: enqueteError } = await supabase
      .from("enquetes")
      .insert({ mural_post_id: post.id, pergunta: titulo, created_by: user.id })
      .select("id")
      .single();
    if (enqueteError) throw new Error(enqueteError.message);

    const { error: opcoesError } = await supabase
      .from("enquete_opcoes")
      .insert(opcoesTexto.map((texto, ordem) => ({ enquete_id: enquete.id, texto, ordem })));
    if (opcoesError) throw new Error(opcoesError.message);
  }

  revalidatePath("/");
}

export async function excluirPostMural(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const id = String(formData.get("id"));
  // RLS (mural_delete) já restringe pra autor do post ou Diretor — esse
  // delete só afeta linha nenhuma (sem erro) se a pessoa não tiver direito.
  const { error } = await supabase.from("mural_posts").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/");
}

export async function votarEnquete(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const enqueteId = String(formData.get("enquete_id"));
  const opcaoId = String(formData.get("opcao_id"));

  const { error } = await supabase
    .from("enquete_votos")
    .upsert({ enquete_id: enqueteId, opcao_id: opcaoId, profile_id: user.id }, { onConflict: "enquete_id,profile_id" });
  if (error) throw new Error(error.message);

  revalidatePath("/");
}
