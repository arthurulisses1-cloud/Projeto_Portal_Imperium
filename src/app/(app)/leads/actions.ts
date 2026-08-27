"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// RLS de entrevistas_leads (migration 0053) já restringe update ao mesmo
// recorte de sempre (dono SDR/Closer, líder do Exército, closer da Tribo,
// Diretor) — não precisa reconferir permissão aqui, o Postgres barra
// sozinho quem tentar editar um lead fora do escopo.

const STATUS_VALIDOS = new Set([
  "a_contatar",
  "em_negociacao",
  "proposta_enviada",
  "aguardando_documentos",
  "esfriou",
  "convertido",
]);

export async function salvarStatusLead(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const leadId = String(formData.get("lead_id") ?? "");
  const statusRaw = String(formData.get("status_followup") ?? "");
  const observacao = String(formData.get("observacao") ?? "").trim();
  if (!leadId) throw new Error("Lead inválido.");
  if (!STATUS_VALIDOS.has(statusRaw)) throw new Error("Status inválido.");

  const { error } = await supabase
    .from("entrevistas_leads")
    .update({
      status_followup: statusRaw,
      observacao: observacao || null,
      status_por: user.id,
      status_em: new Date().toISOString(),
    })
    .eq("id", leadId);
  if (error) throw new Error(error.message);

  revalidatePath("/leads");
}

// "Linkar uma atividade a um lead" (pedido do Diretor, 2026-08-27) — cria
// direto um lembrete no Kanban de Tarefas já vinculado a esse lead
// (tasks.lead_id, migration 0053), sem precisar ir até /tarefas preencher
// tudo de novo.
export async function criarLembreteDeLead(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const leadId = String(formData.get("lead_id") ?? "");
  const leadNome = String(formData.get("lead_nome") ?? "").trim();
  if (!leadId) throw new Error("Lead inválido.");

  const { error } = await supabase.from("tasks").insert({
    profile_id: user.id,
    titulo: `Follow-up: ${leadNome || "lead"}`,
    due_date: new Date().toISOString().slice(0, 10),
    coluna: "afazer",
    prioridade: "normal",
    lead_id: leadId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/leads");
  revalidatePath("/tarefas");
}
