"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function exigirDiretor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "diretor") throw new Error("Só o Diretor edita a Academy.");
  return { supabase, userId: user.id };
}

function revalidar() {
  revalidatePath("/academy");
}

export async function atualizarTrilha(formData: FormData) {
  const { supabase } = await exigirDiretor();
  const id = String(formData.get("id"));
  const diaSemana = Number(formData.get("dia_semana"));
  const horaInicio = String(formData.get("hora_inicio") ?? "").trim();
  const horaFim = String(formData.get("hora_fim") ?? "").trim();
  if (!horaInicio || !horaFim) throw new Error("Preencha o horário.");

  const { error } = await supabase
    .from("academy_trilhas")
    .update({ dia_semana: diaSemana, hora_inicio: horaInicio, hora_fim: horaFim })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidar();
}

export async function criarAula(formData: FormData) {
  const { supabase } = await exigirDiretor();
  const trilhaId = String(formData.get("trilha_id"));
  const tema = String(formData.get("tema") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  if (!tema) throw new Error("Tema é obrigatório.");

  const { data: ultima } = await supabase
    .from("academy_aulas")
    .select("ordem")
    .eq("trilha_id", trilhaId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const novaOrdem = (ultima?.ordem ?? 0) + 1;

  const { error } = await supabase.from("academy_aulas").insert({
    trilha_id: trilhaId,
    ordem: novaOrdem,
    tema,
    descricao: descricao || null,
  });
  if (error) throw new Error(error.message);
  revalidar();
}

export async function atualizarAula(formData: FormData) {
  const { supabase } = await exigirDiretor();
  const id = String(formData.get("id"));
  const tema = String(formData.get("tema") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const data = String(formData.get("data") ?? "").trim();
  const instrutorId = String(formData.get("instrutor_id") ?? "").trim();
  const marco = String(formData.get("marco")) === "true";
  if (!tema) throw new Error("Tema é obrigatório.");

  const { error } = await supabase
    .from("academy_aulas")
    .update({
      tema,
      descricao: descricao || null,
      data: data || null,
      instrutor_id: instrutorId || null,
      marco,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidar();
}

export async function excluirAula(formData: FormData) {
  const { supabase } = await exigirDiretor();
  const id = String(formData.get("id"));
  const { error } = await supabase.from("academy_aulas").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidar();
}

// Troca a ordem da aula com a vizinha (acima ou abaixo) — mesmo padrão do
// resto do app pra reordenar sem drag-and-drop (ver campanhas, motivos de
// perda). Precisa trocar em 2 passos porque `unique(trilha_id, ordem)`
// bloquearia um update direto pro valor que a outra linha já tem.
export async function moverAula(formData: FormData) {
  const { supabase } = await exigirDiretor();
  const id = String(formData.get("id"));
  const direcao = String(formData.get("direcao")); // "cima" | "baixo"

  const { data: atual } = await supabase.from("academy_aulas").select("id, trilha_id, ordem").eq("id", id).single();
  if (!atual) throw new Error("Aula não encontrada.");

  const { data: todas } = await supabase
    .from("academy_aulas")
    .select("id, ordem")
    .eq("trilha_id", atual.trilha_id)
    .order("ordem");
  const lista = todas ?? [];
  const idx = lista.findIndex((a) => a.id === atual.id);
  const idxVizinha = direcao === "cima" ? idx - 1 : idx + 1;
  if (idx === -1 || idxVizinha < 0 || idxVizinha >= lista.length) return; // já é a primeira/última

  const vizinha = lista[idxVizinha];

  // Troca em 2 passos porque `unique(trilha_id, ordem)` bloquearia um
  // update direto pro valor que a outra linha já tem.
  const TEMP = -1;
  await supabase.from("academy_aulas").update({ ordem: TEMP }).eq("id", atual.id);
  await supabase.from("academy_aulas").update({ ordem: atual.ordem }).eq("id", vizinha.id);
  await supabase.from("academy_aulas").update({ ordem: vizinha.ordem }).eq("id", atual.id);

  revalidar();
}

// Preenche a data de todas as aulas da trilha a partir de uma data-base,
// uma por semana, na ordem — atalho pra não digitar 12 datas na mão.
export async function definirDatasEmLote(formData: FormData) {
  const { supabase } = await exigirDiretor();
  const trilhaId = String(formData.get("trilha_id"));
  const dataInicio = String(formData.get("data_inicio"));
  if (!dataInicio) throw new Error("Escolha a data de início.");

  const { data: aulas } = await supabase
    .from("academy_aulas")
    .select("id, ordem")
    .eq("trilha_id", trilhaId)
    .order("ordem");

  const [ano, mes, dia] = dataInicio.split("-").map(Number);
  const base = new Date(Date.UTC(ano, mes - 1, dia));

  for (const aula of aulas ?? []) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + (aula.ordem - 1) * 7);
    await supabase
      .from("academy_aulas")
      .update({ data: d.toISOString().slice(0, 10) })
      .eq("id", aula.id);
  }
  revalidar();
}

export async function marcarRealizada(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const id = String(formData.get("id"));
  const realizada = String(formData.get("realizada")) === "true";
  // RLS já garante que só o instrutor daquela aula (ou o Diretor) consegue
  // de fato gravar — o trigger prevent_academy_aula_overreach barra
  // qualquer outra coluna sendo tocada por quem não é Diretor.
  const { error } = await supabase.from("academy_aulas").update({ realizada }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidar();
}

export async function enviarMaterial(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const aulaId = String(formData.get("aula_id"));
  const file = formData.get("arquivo") as File | null;
  if (!file || file.size === 0) throw new Error("Selecione um arquivo.");
  const nome = String(formData.get("nome") ?? "").trim() || file.name;

  const ext = file.name.split(".").pop() || "bin";
  const path = `${user.id}/${Date.now()}-${aulaId}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("academy-materiais")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw new Error(uploadError.message);

  const { data: pub } = supabase.storage.from("academy-materiais").getPublicUrl(path);

  const { error } = await supabase.from("academy_materiais").insert({
    aula_id: aulaId,
    nome,
    url: pub.publicUrl,
    enviado_por: user.id,
  });
  if (error) throw new Error(error.message);
  revalidar();
}

export async function excluirMaterial(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const id = String(formData.get("id"));
  const { error } = await supabase.from("academy_materiais").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidar();
}
