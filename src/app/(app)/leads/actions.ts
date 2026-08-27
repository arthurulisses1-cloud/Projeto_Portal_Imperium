"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// RLS de entrevistas_leads (migration 0053) já restringe update ao mesmo
// recorte de sempre (dono SDR/Closer, líder do Exército, closer da Tribo,
// Diretor) — não precisa reconferir permissão aqui, o Postgres barra
// sozinho quem tentar editar um lead fora do escopo.

// Funil real da operação (migration 0055) — "perdido" é saída, fora da
// esteira principal. "esfriou" ficou órfão da renomeação (sem etapa nova
// equivalente) e não é mais usado por aqui de propósito.
const STATUS_VALIDOS = new Set([
  "validacao_entrevista",
  "entrevista_validada",
  "fechamento",
  "subido",
  "ccb_enviada",
  "assinado",
  "perdido",
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

// Cadastrar perda — igual ao "motivo de queda" que weekly_operacoes já
// tem, só que aqui o catálogo de motivos é editável pelo Diretor
// (motivos_perda_lead) em vez de um enum fixo no código.
export async function salvarPerdaLead(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const leadId = String(formData.get("lead_id") ?? "");
  const motivoId = String(formData.get("motivo_perda_id") ?? "").trim();
  const motivoObs = String(formData.get("motivo_perda_obs") ?? "").trim();
  if (!leadId) throw new Error("Lead inválido.");
  if (!motivoId) throw new Error("Selecione um motivo de perda.");

  const { error } = await supabase
    .from("entrevistas_leads")
    .update({
      status_followup: "perdido",
      motivo_perda_id: motivoId,
      motivo_perda_obs: motivoObs || null,
      status_por: user.id,
      status_em: new Date().toISOString(),
    })
    .eq("id", leadId);
  if (error) throw new Error(error.message);

  revalidatePath("/leads");
}

// ---------- Catálogo de motivos de perda (Diretor) ----------
// RLS (migration 0054) já restringe a is_director() — mesmo padrão de
// marcos/campanhas.

export async function criarMotivoPerda(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) throw new Error("Descreva o motivo.");

  const { error } = await supabase.from("motivos_perda_lead").insert({ nome, created_by: user.id });
  if (error) throw new Error(error.message);

  revalidatePath("/leads");
}

export async function alternarMotivoPerdaAtivo(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const ativoAtual = String(formData.get("ativo") ?? "") === "true";
  if (!id) throw new Error("Motivo inválido.");

  const { error } = await supabase.from("motivos_perda_lead").update({ ativo: !ativoAtual }).eq("id", id);
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
