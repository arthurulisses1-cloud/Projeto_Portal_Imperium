"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function exigirLiderOuDiretor(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (profile?.role !== "lider" && profile?.role !== "diretor") {
    throw new Error("Só Líder ou Diretor podem gerenciar campanhas.");
  }
}

export async function criarCampanha(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  await exigirLiderOuDiretor(supabase, user.id);

  const titulo = String(formData.get("titulo") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const requisitosMinimos = String(formData.get("requisitos_minimos") ?? "").trim();
  const recompensa = String(formData.get("recompensa") ?? "").trim();
  const alvo = String(formData.get("alvo") ?? "geral");
  const metrica = String(formData.get("metrica") ?? "credito");
  const imagemPosicaoRaw = String(formData.get("imagem_posicao") ?? "center");
  const imagemPosicao = ["top", "center", "bottom"].includes(imagemPosicaoRaw) ? imagemPosicaoRaw : "center";
  const papelCreditoRaw = String(formData.get("papel_credito") ?? "total");
  const papelCredito = ["sdr", "closer", "total"].includes(papelCreditoRaw) ? papelCreditoRaw : "total";
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
      requisitos_minimos: requisitosMinimos || null,
      recompensa: recompensa || null,
      imagem_url: imagemUrl,
      imagem_posicao: imagemPosicao,
      alvo,
      metrica,
      papel_credito: papelCredito,
      meta_valor: metaValorRaw ? Number(metaValorRaw) : null,
      data_inicio: dataInicio,
      data_fim: dataFim,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (alvo === "grupo_rank") {
    // Participante não é marcado pessoa por pessoa — é auto-populado por
    // Cargo (Legionário, Centurião...) na hora de criar. Ranking/progresso
    // depois disso é igual "individual" (ver membrosDe em lib/campanhas.ts).
    const ranks = formData.getAll("rank_participante").map((v) => String(v)).filter(Boolean);
    if (ranks.length > 0) {
      const { data: pessoasDoCargo } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("role", ["sdr", "closer", "lider"])
        .in("rank", ranks);
      const linhas = (pessoasDoCargo ?? []).map((p) => ({
        campanha_id: campanha.id,
        ref_id: p.id,
        label: p.full_name,
      }));
      if (linhas.length > 0) {
        const { error: partError } = await supabase.from("campanha_participantes").insert(linhas);
        if (partError) throw new Error(partError.message);
      }
    }
  } else if (alvo !== "geral") {
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

// Ajuste rápido pra campanha já criada com foto cortada errado — sem crop
// de verdade (arrastar/soltar), troca qual parte da foto fica visível.
export async function atualizarEnquadramentoCampanha(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  await exigirLiderOuDiretor(supabase, user.id);

  const id = String(formData.get("id"));
  const imagemPosicaoRaw = String(formData.get("imagem_posicao") ?? "center");
  const imagemPosicao = ["top", "center", "bottom"].includes(imagemPosicaoRaw) ? imagemPosicaoRaw : "center";

  const { error } = await supabase.from("campanhas").update({ imagem_posicao: imagemPosicao }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/campanhas");
  revalidatePath("/");
}

export async function excluirCampanha(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  await exigirLiderOuDiretor(supabase, user.id);

  const id = String(formData.get("id"));
  const { error } = await supabase.from("campanhas").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/campanhas");
  revalidatePath("/");
}
