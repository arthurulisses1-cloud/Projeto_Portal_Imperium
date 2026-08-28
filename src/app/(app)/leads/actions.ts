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
  "pago",
  "perdido",
]);

const TEMPERATURAS_VALIDAS = new Set(["frio", "morno", "quente"]);

// A partir de Fechamento (inclusive) o lead precisa estar qualificado —
// pedido do Diretor (2026-08-27): "lead só pode entrar em fechamento ou
// subido se for preenchido: Forecast (Frio/Morno/Quente) e Valor do
// Crédito". Cobre também as etapas depois de Fechamento/Subido (CCB
// Enviada, Assinado, Pago) pra fechar a brecha de arrastar direto pra lá
// sem passar pelas etapas anteriores.
const ETAPAS_QUE_EXIGEM_QUALIFICACAO = new Set(["fechamento", "subido", "ccb_enviada", "assinado", "pago"]);

// Etapas de onde um lead pode "cair" — tudo antes de Perdido/Pago, que já
// são saídas em si (migration 0059, pedido do Diretor, 2026-08-28: motivo
// de perda específico por etapa).
const ETAPAS_DE_PERDA_VALIDAS = new Set([
  "validacao_entrevista",
  "entrevista_validada",
  "fechamento",
  "subido",
  "ccb_enviada",
  "assinado",
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
  const temperaturaRaw = String(formData.get("temperatura") ?? "").trim();
  const valorCreditoRaw = String(formData.get("valor_credito") ?? "").trim();
  if (!leadId) throw new Error("Lead inválido.");
  if (!STATUS_VALIDOS.has(statusRaw)) throw new Error("Status inválido.");

  const temperatura = TEMPERATURAS_VALIDAS.has(temperaturaRaw) ? temperaturaRaw : null;
  const valorCredito = valorCreditoRaw ? Number(valorCreditoRaw.replace(",", ".")) : null;
  const valorCreditoValido = valorCredito !== null && Number.isFinite(valorCredito) && valorCredito > 0;

  const update: Record<string, unknown> = {
    status_followup: statusRaw,
    observacao: observacao || null,
    status_por: user.id,
    status_em: new Date().toISOString(),
  };
  if (temperatura) update.temperatura = temperatura;
  if (valorCreditoValido) update.valor_credito = valorCredito;

  if (ETAPAS_QUE_EXIGEM_QUALIFICACAO.has(statusRaw)) {
    const { data: atual } = await supabase
      .from("entrevistas_leads")
      .select("temperatura, valor_credito")
      .eq("id", leadId)
      .maybeSingle();
    const temperaturaFinal = temperatura ?? atual?.temperatura ?? null;
    const valorFinal = valorCreditoValido ? valorCredito : atual?.valor_credito ?? null;
    if (!temperaturaFinal || !valorFinal) {
      throw new Error("Pra entrar em Fechamento (ou etapas depois), preencha o Forecast (Frio/Morno/Quente) e o Valor do Crédito.");
    }
  }

  const { error } = await supabase.from("entrevistas_leads").update(update).eq("id", leadId);
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
  const etapaRaw = String(formData.get("motivo_perda_etapa") ?? "").trim();
  if (!leadId) throw new Error("Lead inválido.");
  if (!etapaRaw || !ETAPAS_DE_PERDA_VALIDAS.has(etapaRaw)) throw new Error("Escolha de qual etapa o lead foi perdido.");
  if (!motivoId) throw new Error("Selecione um motivo de perda.");

  const { error } = await supabase
    .from("entrevistas_leads")
    .update({
      status_followup: "perdido",
      motivo_perda_id: motivoId,
      motivo_perda_obs: motivoObs || null,
      motivo_perda_etapa: etapaRaw,
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
  const etapaRaw = String(formData.get("etapa") ?? "").trim();
  if (!nome) throw new Error("Descreva o motivo.");
  // Vazio = motivo universal (aparece em qualquer etapa) — só valida quando
  // uma etapa específica foi escolhida.
  const etapa = etapaRaw && ETAPAS_DE_PERDA_VALIDAS.has(etapaRaw) ? etapaRaw : null;

  const { error } = await supabase.from("motivos_perda_lead").insert({ nome, etapa, created_by: user.id });
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
