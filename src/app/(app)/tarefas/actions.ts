"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function criarFollowup(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const titulo = String(formData.get("titulo") ?? "").trim();
  const dueDate = String(formData.get("due_date") ?? "");
  if (!titulo) throw new Error("Descreva o follow-up.");

  const { error } = await supabase.from("tasks").insert({
    profile_id: user.id,
    titulo,
    due_date: dueDate || null,
    coluna: "afazer",
  });
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}

export async function concluirFollowup(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const { error } = await supabase.from("tasks").update({ coluna: "concluido" }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}

export async function excluirFollowup(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tarefas");
}
