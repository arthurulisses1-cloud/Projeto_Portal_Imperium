"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Toda checagem de "quem pode fazer o quê" mora na RLS (migration 0051) —
// líder/closer só conseguem inserir/atualizar/excluir tarefa de liderado
// se ela não estiver `privado`, e o Postgres já barra o resto. Aqui só
// validamos formato de entrada.

export async function criarTarefa(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const titulo = String(formData.get("titulo") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "");
  const prioridadeRaw = String(formData.get("prioridade") ?? "media");
  const prioridade = ["alta", "media", "baixa"].includes(prioridadeRaw) ? prioridadeRaw : "media";
  const colunaRaw = String(formData.get("coluna") ?? "afazer");
  const coluna = ["backlog", "afazer", "andamento", "bloqueado", "concluido"].includes(colunaRaw) ? colunaRaw : "afazer";
  const paraId = String(formData.get("profile_id") ?? "").trim() || user.id;
  if (!titulo) throw new Error("Descreva a tarefa.");

  const { error } = await supabase.from("tasks").insert({
    profile_id: paraId,
    titulo,
    due_date: dueDate || null,
    coluna,
    prioridade,
    // null = tarefa própria; só grava "atribuído por" quando é pra outra pessoa.
    atribuido_por: paraId === user.id ? null : user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}

export async function editarTarefa(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const titulo = String(formData.get("titulo") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "");
  const prioridadeRaw = String(formData.get("prioridade") ?? "media");
  const prioridade = ["alta", "media", "baixa"].includes(prioridadeRaw) ? prioridadeRaw : "media";
  if (!id) throw new Error("Tarefa inválida.");
  if (!titulo) throw new Error("Descreva a tarefa.");

  const { error } = await supabase.from("tasks").update({ titulo, due_date: dueDate || null, prioridade }).eq("id", id);
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
