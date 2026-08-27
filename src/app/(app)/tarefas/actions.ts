"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { parseTarefaRapida } from "@/lib/tarefas-nlp";

// Toda checagem de "quem pode fazer o quê" mora na RLS (migrations 0051 e
// 0052) — líder/closer só conseguem mexer em tarefa/checklist/comentário/
// dependência de liderado se ela não estiver `privado`, e o Postgres já
// barra o resto. Aqui só validamos formato de entrada.

const PRIORIDADES = ["critica", "alta", "normal", "baixa"];
const COLUNAS = ["backlog", "afazer", "andamento", "bloqueado", "concluido"];

export async function criarTarefa(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const titulo = String(formData.get("titulo") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "");
  const dueTime = String(formData.get("due_time") ?? "");
  const prioridadeRaw = String(formData.get("prioridade") ?? "normal");
  const prioridade = PRIORIDADES.includes(prioridadeRaw) ? prioridadeRaw : "normal";
  const colunaRaw = String(formData.get("coluna") ?? "afazer");
  const coluna = COLUNAS.includes(colunaRaw) ? colunaRaw : "afazer";
  const paraId = String(formData.get("profile_id") ?? "").trim() || user.id;
  if (!titulo) throw new Error("Descreva a tarefa.");

  const { error } = await supabase.from("tasks").insert({
    profile_id: paraId,
    titulo,
    due_date: dueDate || null,
    due_time: dueTime || null,
    coluna,
    prioridade,
    // null = tarefa própria; só grava "atribuído por" quando é pra outra pessoa.
    atribuido_por: paraId === user.id ? null : user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
  // Também usada pelo cardzinho rápido do Mural (TarefasMuralQuickAdd) —
  // sem isso o widget "Suas Tarefas em Aberto" só atualizava depois de
  // navegar pra outra aba e voltar.
  revalidatePath("/");
}

// Quick Add: "ligar pro João amanhã às 14h" — sem formulário, um campo só.
// Sempre cria pra mim mesmo, na coluna "afazer" (mesmo padrão do antigo
// Follow-ups, quem quiser atribuir pra outra pessoa usa o cartão normal).
export async function criarTarefaRapida(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const textoBruto = String(formData.get("texto") ?? "").trim();
  if (!textoBruto) throw new Error("Descreva a tarefa.");
  const { titulo, dueDate, dueTime } = parseTarefaRapida(textoBruto);

  const { error } = await supabase.from("tasks").insert({
    profile_id: user.id,
    titulo,
    due_date: dueDate,
    due_time: dueTime,
    coluna: "afazer",
    prioridade: "normal",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}

export async function editarTarefa(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const titulo = String(formData.get("titulo") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "");
  const dueTime = String(formData.get("due_time") ?? "");
  const prioridadeRaw = String(formData.get("prioridade") ?? "normal");
  const prioridade = PRIORIDADES.includes(prioridadeRaw) ? prioridadeRaw : "normal";
  const tempoEstimadoRaw = String(formData.get("tempo_estimado_min") ?? "").trim();
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (!id) throw new Error("Tarefa inválida.");
  if (!titulo) throw new Error("Descreva a tarefa.");

  const { error } = await supabase
    .from("tasks")
    .update({
      titulo,
      descricao: descricao || null,
      due_date: dueDate || null,
      due_time: dueTime || null,
      prioridade,
      tags,
      tempo_estimado_min: tempoEstimadoRaw ? Number(tempoEstimadoRaw) : null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}

export async function moverTarefa(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const coluna = String(formData.get("coluna") ?? "");
  if (!id || !coluna) throw new Error("Tarefa ou coluna inválida.");

  const { error } = await supabase.from("tasks").update({ coluna }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}

// "Adiar" — empurra o prazo em 1 dia (Trello-style quick action). Se não
// tinha prazo, começa de amanhã.
export async function adiarTarefa(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const dueDateAtual = String(formData.get("due_date") ?? "");
  if (!id) throw new Error("Tarefa inválida.");

  const base = dueDateAtual ? new Date(dueDateAtual + "T00:00:00") : new Date();
  base.setDate(base.getDate() + 1);
  const novaData = base.toISOString().slice(0, 10);

  const { error } = await supabase.from("tasks").update({ due_date: novaData }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}

export async function transferirTarefa(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const id = String(formData.get("id") ?? "");
  const novoDonoId = String(formData.get("profile_id") ?? "");
  if (!id || !novoDonoId) throw new Error("Dados inválidos.");

  const { error } = await supabase
    .from("tasks")
    .update({ profile_id: novoDonoId, atribuido_por: novoDonoId === user.id ? null : user.id })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}

// Só o próprio dono chama isso na prática (o botão só aparece pro dono na
// UI), mas a RLS de update também cobriria líder/closer — deixamos a
// visibilidade restrita na tela mesmo, é o dono quem decide o que esconder.
export async function alternarPrivado(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const privadoAtual = String(formData.get("privado") ?? "") === "true";
  if (!id) throw new Error("Tarefa inválida.");

  const { error } = await supabase.from("tasks").update({ privado: !privadoAtual }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}

export async function excluirTarefa(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Tarefa inválida.");

  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}

// ---------- Checklist (subtarefas) ----------

export async function adicionarChecklistItem(formData: FormData) {
  const supabase = await createClient();
  const taskId = String(formData.get("task_id") ?? "");
  const titulo = String(formData.get("titulo") ?? "").trim();
  const ordem = Number(formData.get("ordem") ?? 0);
  if (!taskId || !titulo) throw new Error("Dados inválidos.");

  const { error } = await supabase.from("task_checklist_items").insert({ task_id: taskId, titulo, ordem });
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}

export async function alternarChecklistItem(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const feitoAtual = String(formData.get("feito") ?? "") === "true";
  if (!id) throw new Error("Item inválido.");

  const { error } = await supabase.from("task_checklist_items").update({ feito: !feitoAtual }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}

export async function excluirChecklistItem(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Item inválido.");

  const { error } = await supabase.from("task_checklist_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}

// ---------- Comentários ----------

export async function adicionarComentario(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const taskId = String(formData.get("task_id") ?? "");
  const texto = String(formData.get("texto") ?? "").trim();
  if (!taskId || !texto) throw new Error("Escreva um comentário.");

  const { error } = await supabase.from("task_comentarios").insert({ task_id: taskId, autor_id: user.id, texto });
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}

export async function excluirComentario(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Comentário inválido.");

  const { error } = await supabase.from("task_comentarios").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}

// ---------- Dependência ("aguardando") ----------

export async function definirDependencia(formData: FormData) {
  const supabase = await createClient();
  const taskId = String(formData.get("task_id") ?? "");
  const dependeDeId = String(formData.get("depende_de_id") ?? "");
  if (!taskId || !dependeDeId) throw new Error("Dados inválidos.");
  if (taskId === dependeDeId) throw new Error("Uma tarefa não pode depender dela mesma.");

  const { error } = await supabase.from("task_dependencias").insert({ task_id: taskId, depende_de_id: dependeDeId });
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}

export async function removerDependencia(formData: FormData) {
  const supabase = await createClient();
  const taskId = String(formData.get("task_id") ?? "");
  const dependeDeId = String(formData.get("depende_de_id") ?? "");
  if (!taskId || !dependeDeId) throw new Error("Dados inválidos.");

  const { error } = await supabase
    .from("task_dependencias")
    .delete()
    .eq("task_id", taskId)
    .eq("depende_de_id", dependeDeId);
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}

// ---------- Time tracking ----------

export async function iniciarCronometro(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Tarefa inválida.");

  const { error } = await supabase.from("tasks").update({ cronometro_iniciado_em: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}

export async function pararCronometro(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const iniciadoEm = String(formData.get("cronometro_iniciado_em") ?? "");
  const tempoGastoAtual = Number(formData.get("tempo_gasto_seg") ?? 0);
  if (!id || !iniciadoEm) throw new Error("Cronômetro não estava rodando.");

  const decorridoSeg = Math.max(0, Math.round((Date.now() - new Date(iniciadoEm).getTime()) / 1000));
  const { error } = await supabase
    .from("tasks")
    .update({ cronometro_iniciado_em: null, tempo_gasto_seg: tempoGastoAtual + decorridoSeg })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}
