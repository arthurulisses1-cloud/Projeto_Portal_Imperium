"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function criarCampanha(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const titulo = String(formData.get("titulo") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const alvo = String(formData.get("alvo") ?? "geral");
  const metrica = String(formData.get("metrica") ?? "credito");
  const metaValorRaw = String(formData.get("meta_valor") ?? "").trim();
  const dataInicio = String(formData.get("data_inicio") ?? "");
  const dataFim = String(formData.get("data_fim") ?? "");
  if (!titulo || !dataInicio || !dataFim) throw new Error("Título e período são obrigatórios.");

  let imagemUrl: string | null = null;
  const imagem = formData.get("imagem") as File | null;
  if (imagem && imagem.size > 0) {
    const ext = imagem.name.split(".").pop() || "jpg";
    const path = `${user.id}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("campanhas").upload(path, imagem, { contentType: imagem.type });
    if (uploadError) throw new Error(uploadError.message);
    imagemUrl = supabase.storage.from("campanhas").getPublicUrl(path).data.publicUrl;
  }

  const { data: campanha, error } = await supabase
    .from("campanhas")
    .insert({
      titulo,
      descricao: descricao || null,
      imagem_url: imagemUrl,
      alvo,
      metrica,
      meta_valor: metaValorRaw ? Number(metaValorRaw) : null,
      data_inicio: dataInicio,
      data_fim: dataFim,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (alvo !== "geral") {
    const participantesRaw = formData.getAll("participante"); // "ref_id::label"
    const linhas = participantesRaw
      .map((v) => String(v))
      .filter(Boolean)
      .map((v) => {
        const [refId, ...labelParts] = v.split("::");
        return { campanha_id: campanha.id, ref_id: refId, label: labelParts.join("::") };
      });
    if (linhas.length > 0) {
      const { error: partError } = await supabase.from("campanha_participantes").insert(linhas);
      if (partError) throw new Error(partError.message);
    }
  }

  revalidatePath("/campanhas");
  revalidatePath("/");
}

export async function excluirCampanha(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const { error } = await supabase.from("campanhas").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/campanhas");
  revalidatePath("/");
}
