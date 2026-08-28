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

// Reanálise (migration 0062, pedido do Diretor, 2026-08-28) só faz sentido
// a partir de onde o compliance/jurídico entra em cena — mesmo corte já
// usado pra duplicar os motivos de perda de Subido em CCB Enviada/Assinado.
const ETAPAS_QUE_PODEM_IR_PARA_REANALISE = new Set(["subido", "ccb_enviada", "assinado"]);

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

// Editar nome/etapa de um motivo já cadastrado (pedido do Diretor,
// 2026-08-28: "dê opção de remover, adicionar ou editar cada motivo").
export async function editarMotivoPerda(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const etapaRaw = String(formData.get("etapa") ?? "").trim();
  if (!id) throw new Error("Motivo inválido.");
  if (!nome) throw new Error("Descreva o motivo.");
  const etapa = etapaRaw && ETAPAS_DE_PERDA_VALIDAS.has(etapaRaw) ? etapaRaw : null;

  const { error } = await supabase.from("motivos_perda_lead").update({ nome, etapa }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/leads");
}

// Excluir de vez (diferente de "Desativar", que só esconde da escolha mas
// preserva histórico) — barrado pelo próprio Postgres (FK) se algum lead já
// usa esse motivo; nesse caso orienta a desativar em vez de excluir.
export async function excluirMotivoPerda(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  if (!id) throw new Error("Motivo inválido.");

  const { error } = await supabase.from("motivos_perda_lead").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error("Esse motivo já foi usado em algum lead perdido — desative em vez de excluir, pra não perder o histórico.");
    }
    throw new Error(error.message);
  }

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

// ---------- Funil de Reanálise (migration 0062) ----------
// Segundo funil dentro da mesma tela /leads (pedido do Diretor,
// 2026-08-28: "não crie outra aba"). O lead NUNCA muda status_followup
// aqui — só ganha em_reanalise=true e some do funil principal, reaparece
// no funil de reanálise até alguém marcar como resolvida. É por isso que
// "Resolvida" não precisa restaurar etapa nenhuma: o lead nunca saiu de
// onde estava.

export async function enviarParaReanalise(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const leadId = String(formData.get("lead_id") ?? "");
  const leadNome = String(formData.get("lead_nome") ?? "").trim();
  const reanaliseData = String(formData.get("reanalise_data") ?? "").trim();
  if (!leadId) throw new Error("Lead inválido.");
  if (!reanaliseData) throw new Error("Informe a data que o Jurídico deu pra reanálise.");

  const { data: atual, error: atualError } = await supabase
    .from("entrevistas_leads")
    .select("status_followup, em_reanalise")
    .eq("id", leadId)
    .maybeSingle();
  if (atualError) throw new Error(atualError.message);
  if (!atual) throw new Error("Lead não encontrado.");
  if (atual.em_reanalise) throw new Error("Esse lead já está em reanálise.");
  if (!ETAPAS_QUE_PODEM_IR_PARA_REANALISE.has(atual.status_followup)) {
    throw new Error("Só é possível enviar pra reanálise a partir de Subido, CCB Enviada ou Assinado.");
  }

  const { error } = await supabase
    .from("entrevistas_leads")
    .update({ em_reanalise: true, reanalise_data: reanaliseData })
    .eq("id", leadId);
  if (error) throw new Error(error.message);

  // Lembrete automático (pedido do Diretor: "já é gerada uma tarefa pra
  // lembrete futuro") — mesmo padrão de criarLembreteDeLead, mas com due_date
  // = data que o Jurídico deu, não hoje. Título com prefixo fixo "Reanálise:"
  // pra resolverParaReanalise() saber depois qual lembrete fechar.
  const { error: taskError } = await supabase.from("tasks").insert({
    profile_id: user.id,
    titulo: `Reanálise: ${leadNome || "lead"}`,
    due_date: reanaliseData,
    coluna: "afazer",
    prioridade: "normal",
    lead_id: leadId,
  });
  if (taskError) throw new Error(taskError.message);

  revalidatePath("/leads");
  revalidatePath("/tarefas");
  revalidatePath("/");
}

// Quando a tarefa de lembrete vence, o closer volta aqui e resolve: OU o
// Jurídico liberou (volta pro funil principal, sem mexer em status_followup)
// OU segue em reanálise com uma nova data (fecha o lembrete antigo, abre um
// novo com o novo prazo).
export async function resolverReanalise(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const leadId = String(formData.get("lead_id") ?? "");
  const leadNome = String(formData.get("lead_nome") ?? "").trim();
  const resolvida = String(formData.get("resolvida") ?? "") === "true";
  const novaData = String(formData.get("nova_data") ?? "").trim();
  if (!leadId) throw new Error("Lead inválido.");
  if (!resolvida && !novaData) throw new Error("Informe a nova data que o Jurídico deu.");

  // Fecha o lembrete de reanálise ainda aberto pra esse lead — resolvida ou
  // não, o lembrete antigo já cumpriu o papel (avisar que o dia chegou).
  // Filtra pelo prefixo do título pra não fechar OUTROS lembretes/tarefas
  // que por acaso estejam ligados ao mesmo lead (ex: "Follow-up: ...").
  await supabase
    .from("tasks")
    .update({ coluna: "concluido" })
    .eq("lead_id", leadId)
    .ilike("titulo", "Reanálise:%")
    .neq("coluna", "concluido");

  if (resolvida) {
    const { error } = await supabase
      .from("entrevistas_leads")
      .update({ em_reanalise: false, reanalise_data: null })
      .eq("id", leadId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("entrevistas_leads").update({ reanalise_data: novaData }).eq("id", leadId);
    if (error) throw new Error(error.message);

    const { error: taskError } = await supabase.from("tasks").insert({
      profile_id: user.id,
      titulo: `Reanálise: ${leadNome || "lead"}`,
      due_date: novaData,
      coluna: "afazer",
      prioridade: "normal",
      lead_id: leadId,
    });
    if (taskError) throw new Error(taskError.message);
  }

  revalidatePath("/leads");
  revalidatePath("/tarefas");
  revalidatePath("/");
}
