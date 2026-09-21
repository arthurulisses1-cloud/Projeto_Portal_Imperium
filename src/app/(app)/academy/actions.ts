"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverAudienciaDaTrilha } from "@/lib/academy";
import { ACADEMY_RH } from "@/lib/acessos-especiais";

// Checklist pré-aula do RH — pedido do Diretor, 2026-09-21: "pra que cada
// aula exista, o RH tem que realizar algumas atividades... que podem já
// ficar cadastradas como tarefas". Prazo = data da aula menos N dias.
const RH_CHECKLIST: { chave: string; titulo: string; diasAntes: number }[] = [
  { chave: "agendar_sala", titulo: "Agendar sala de reunião e confirmar horário da aula", diasAntes: 3 },
  { chave: "confirmar_professor", titulo: "Confirmar aula com o professor", diasAntes: 2 },
  { chave: "confirmar_slide", titulo: "Confirmar com o professor se o slide da aula está pronto", diasAntes: 1 },
  { chave: "enviar_arte", titulo: "Enviar arte com os dados da aula no Grupo do Imperium", diasAntes: 1 },
];

function subtrairDias(dataISO: string, dias: number): string {
  const [y, m, d] = dataISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - dias);
  return dt.toISOString().slice(0, 10);
}

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
  revalidatePath("/academy/instrutor");
  revalidatePath("/academy/trilha");
  revalidatePath("/tarefas");
  revalidatePath("/");
}

// Recria as tarefas-lembrete ligadas a uma aula (instrutor + audiência da
// trilha) sempre que data/instrutor/tema mudam — apaga tudo que já existia
// pra essa aula e gera de novo do zero (mais simples que diff, volume
// pequeno). Sem data marcada, não gera nada.
async function sincronizarTasksDaAula(supabase: SupabaseClient, aulaId: string) {
  await supabase.from("tasks").delete().eq("origem_academy_aula_id", aulaId);

  const { data: aula } = await supabase
    .from("academy_aulas")
    .select("id, tema, data, instrutor_id, trilha:academy_trilhas(nome, rank, tipo, hora_inicio)")
    .eq("id", aulaId)
    .maybeSingle();
  if (!aula || !aula.data) return;

  const trilha = aula.trilha as unknown as { nome: string; rank: string | null; tipo: string; hora_inicio: string } | null;
  if (!trilha) return;

  type NovaTask = {
    profile_id: string;
    titulo: string;
    due_date: string;
    due_time: string | null;
    coluna: "afazer";
    prioridade: "alta" | "normal";
    tags: string[];
    origem_academy_aula_id: string;
  };
  const linhas: NovaTask[] = [];

  if (aula.instrutor_id) {
    linhas.push({
      profile_id: aula.instrutor_id,
      titulo: `Ministrar: ${aula.tema} (${trilha.nome})`,
      due_date: aula.data,
      due_time: trilha.hora_inicio,
      coluna: "afazer",
      prioridade: "alta",
      tags: ["academy"],
      origem_academy_aula_id: aula.id,
    });
  }

  const alunos = await resolverAudienciaDaTrilha(supabase, trilha);
  for (const a of alunos) {
    if (a.id === aula.instrutor_id) continue; // já ganhou a tarefa de instrutor acima
    linhas.push({
      profile_id: a.id,
      titulo: `Aula da Imperium Academy: ${aula.tema} (${trilha.nome})`,
      due_date: aula.data,
      due_time: trilha.hora_inicio,
      coluna: "afazer",
      prioridade: "normal",
      tags: ["academy"],
      origem_academy_aula_id: aula.id,
    });
  }

  // Checklist do RH — qualquer uma das 2 pessoas de ACADEMY_RH ganha a
  // MESMA tarefa (2 linhas, mesma tag+aula) e dar check numa fecha pra
  // ambas (ver moverTarefa, src/app/(app)/tarefas/actions.ts).
  for (const item of RH_CHECKLIST) {
    const dueDate = subtrairDias(aula.data, item.diasAntes);
    for (const pessoa of ACADEMY_RH) {
      linhas.push({
        profile_id: pessoa.id,
        titulo: `${item.titulo} — ${trilha.nome}: ${aula.tema}`,
        due_date: dueDate,
        due_time: null,
        coluna: "afazer",
        prioridade: "alta",
        tags: [`academy_rh:${item.chave}`],
        origem_academy_aula_id: aula.id,
      });
    }
  }

  if (linhas.length > 0) {
    const { error } = await supabase.from("tasks").insert(linhas);
    if (error) throw new Error(error.message);
  }
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

  const { data: nova, error } = await supabase
    .from("academy_aulas")
    .insert({
      trilha_id: trilhaId,
      ordem: novaOrdem,
      tema,
      descricao: descricao || null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  // Aula nova nasce sem data — nada a sincronizar ainda, mas já deixa o
  // padrão coerente pra quando o Diretor definir a data em seguida.
  if (nova) await sincronizarTasksDaAula(supabase, nova.id);
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
  await sincronizarTasksDaAula(supabase, id);
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
    await sincronizarTasksDaAula(supabase, aula.id);
  }
  revalidar();
}

// "Fechar aula" — pedido do Diretor, 2026-09-21: "quero que seja
// obrigatório o professor alocar os materiais e dar a lista de presença
// da aula... uma espécie de 'fechar aula do módulo'". Só valida na hora
// de FECHAR (realizada true) — reabrir (voltar pra false) continua livre,
// não faz sentido travar isso.
export async function marcarRealizada(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const id = String(formData.get("id"));
  const realizada = String(formData.get("realizada")) === "true";

  if (realizada) {
    const [{ count: numMateriais }, { count: numPresencas }] = await Promise.all([
      supabase.from("academy_materiais").select("id", { count: "exact", head: true }).eq("aula_id", id),
      supabase.from("academy_presencas").select("id", { count: "exact", head: true }).eq("aula_id", id),
    ]);
    const faltando: string[] = [];
    if (!numMateriais) faltando.push("nenhum material enviado");
    if (!numPresencas) faltando.push("lista de presença ainda não salva");
    if (faltando.length > 0) {
      throw new Error(`Pra fechar a aula, resolve antes: ${faltando.join(" e ")}.`);
    }
  }

  // RLS já garante que só o instrutor daquela aula (ou o Diretor) consegue
  // de fato gravar — o trigger prevent_academy_aula_overreach barra
  // qualquer outra coluna sendo tocada por quem não é Diretor.
  const { error } = await supabase.from("academy_aulas").update({ realizada }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidar();
}

// Lista de presença — pedido do Diretor, 2026-09-21: "coloque a lista de
// presença, pra que ele [instrutor] cadastre quem participou da aula...
// isso contabiliza no plano de carreira no quesito formação". O form manda
// TODOS os alunos da audiência como hidden `aluno_id` (pra saber quem
// existe, mesmo quem não foi marcado) e só os presentes como `presente`
// (checkbox) — grava true/false pra todo mundo, nunca deixa "faltando".
// RLS (academy_presencas_insert/update) já garante que só o instrutor
// daquela aula ou o Diretor consegue gravar.
export async function salvarPresencas(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const aulaId = String(formData.get("aula_id"));
  const alunoIds = formData.getAll("aluno_id").map(String);
  const presentesIds = new Set(formData.getAll("presente").map(String));
  if (alunoIds.length === 0) return;

  const linhas = alunoIds.map((alunoId) => ({
    aula_id: aulaId,
    aluno_id: alunoId,
    presente: presentesIds.has(alunoId),
    marcado_por: user.id,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("academy_presencas").upsert(linhas, { onConflict: "aula_id,aluno_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/academy/instrutor");
  revalidatePath("/carreira");
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
