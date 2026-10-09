"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { hojeBR } from "@/lib/data-br";
import { DIAS_PRAZO_PENDENCIA } from "@/lib/leads-cobranca";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

// RLS de entrevistas_leads (migration 0053) já restringe update ao mesmo
// recorte de sempre (dono SDR/Closer, líder do Exército, closer da Tribo,
// Diretor) — não precisa reconferir permissão aqui, o Postgres barra
// sozinho quem tentar editar um lead fora do escopo.

// Funil real da operação (migration 0055) — "perdido" é saída, fora da
// esteira principal. "esfriou" ficou órfão da renomeação (sem etapa nova
// equivalente) e não é mais usado por aqui de propósito.
const STATUS_VALIDOS = new Set([
  "validacao_entrevista",
  "entrevista_recusada",
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

async function registrarLog(
  supabase: SupabaseClient,
  leadId: string,
  autorId: string | null,
  tipo: string,
  nota: string | null,
  detalhe?: Record<string, unknown>
) {
  await supabase.from("lead_atualizacoes").insert({ lead_id: leadId, autor_id: autorId, tipo, nota, detalhe: detalhe ?? null });
}

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
  const subidoData = String(formData.get("subido_data") ?? "").trim();
  const subidoObs = String(formData.get("subido_obs") ?? "").trim();
  const recusaConfirmada = String(formData.get("recusa_confirmada") ?? "") === "true";
  const recusaMotivo = String(formData.get("recusa_motivo") ?? "").trim();
  if (!leadId) throw new Error("Lead inválido.");
  if (!STATUS_VALIDOS.has(statusRaw)) throw new Error("Status inválido.");

  const temperatura = TEMPERATURAS_VALIDAS.has(temperaturaRaw) ? temperaturaRaw : null;
  const valorCredito = valorCreditoRaw ? Number(valorCreditoRaw.replace(",", ".")) : null;
  const valorCreditoValido = valorCredito !== null && Number.isFinite(valorCredito) && valorCredito > 0;

  const { data: atual } = await supabase
    .from("entrevistas_leads")
    .select("status_followup, temperatura, valor_credito, subido_em, rot_fase, rot_responsavel_id, closer_profile_id, repasse_sdr_id, repasse_etapa")
    .eq("id", leadId)
    .maybeSingle();
  if (!atual) throw new Error("Lead não encontrado.");

  const agora = new Date().toISOString();
  const mudouEtapa = atual.status_followup !== statusRaw;

  // Lead que já foi repassado pra um SDR fica sob o funil de Repasse: o
  // closer não mexe até o SDR devolver (entrevista recuperada).
  if (mudouEtapa && atual.status_followup === "entrevista_recusada" && (atual.repasse_sdr_id || atual.repasse_etapa)) {
    throw new Error("Esse lead já está em repasse com um SDR — ele volta pra você quando a entrevista for recuperada.");
  }

  const update: Record<string, unknown> = {
    status_followup: statusRaw,
    observacao: observacao || null,
    status_por: user.id,
    status_em: agora,
    // Salvar o card conta como "atualização de status" pra cobrança de 2 dias.
    ultima_atualizacao_em: agora,
  };
  if (temperatura) update.temperatura = temperatura;
  if (valorCreditoValido) update.valor_credito = valorCredito;

  if (ETAPAS_QUE_EXIGEM_QUALIFICACAO.has(statusRaw)) {
    const temperaturaFinal = temperatura ?? atual.temperatura ?? null;
    const valorFinal = valorCreditoValido ? valorCredito : atual.valor_credito ?? null;
    if (!temperaturaFinal || !valorFinal) {
      throw new Error("Pra entrar em Fechamento (ou etapas depois), preencha o Forecast (Frio/Morno/Quente) e o Valor do Crédito.");
    }
  }

  // Subido passa a ser registrado de verdade (pedido do Diretor, 2026-10-09):
  // ao entrar nessa etapa pede a data em que a documentação subiu pro
  // compliance — o resultado da análise é lançado depois, na visão "Subidos".
  const registrandoSubido = statusRaw === "subido" && !atual.subido_em;
  if (registrandoSubido) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(subidoData)) throw new Error("Informe a data em que o subido foi realizado.");
    if (subidoData > hojeBR()) throw new Error("A data do subido não pode ser no futuro.");
    const { data: padrao } = await supabase
      .from("compliance_resultados")
      .select("id")
      .eq("comportamento", "aguardando")
      .eq("ativo", true)
      .order("ordem")
      .limit(1)
      .maybeSingle();
    update.subido_em = subidoData;
    update.subido_obs = subidoObs || null;
    update.subido_por = user.id;
    update.compliance_resultado_id = padrao?.id ?? null;
    update.compliance_comportamento = "aguardando";
    update.compliance_atualizado_em = agora;
    update.compliance_atualizado_por = user.id;
  }

  // Entrevista Recusada (pedido do Diretor, 2026-10-09): só sai de Validação
  // de Entrevista, e com poka-yoke — confirmar que o lead realmente está
  // negando + motivo obrigatório. Em D+15 o lead vai pro funil de repasse.
  if (statusRaw === "entrevista_recusada" && mudouEtapa) {
    if (atual.status_followup !== "validacao_entrevista") {
      throw new Error("Só dá pra recusar uma entrevista que ainda está em Validação de Entrevista.");
    }
    if (!recusaConfirmada) throw new Error("Confirme que o lead realmente está negando a entrevista.");
    if (recusaMotivo.length < 3) throw new Error("Informe o motivo da recusa.");
    update.recusada_em = hojeBR();
    update.recusa_motivo = recusaMotivo;
    update.recusada_por = user.id;
  }
  if (mudouEtapa && atual.status_followup === "entrevista_recusada" && statusRaw !== "entrevista_recusada") {
    // Closer voltou atrás antes do repasse: limpa a recusa.
    update.recusada_em = null;
    update.recusa_motivo = null;
    update.recusada_por = null;
  }

  if (mudouEtapa) {
    // Troca de etapa é "movimento" de verdade: zera o relógio de 30 dias da
    // rotação e, se o lead estava com outro closer pra recuperação, ele
    // volta a ser um lead ativo normal (quem avançou fica com ele).
    update.ultimo_movimento_em = agora;
    if (atual.rot_fase) {
      update.rot_fase = null;
      update.rot_etapa = "recuperado";
      update.rot_desde = null;
      update.rot_primeiro_toque_em = null;
      if (atual.rot_responsavel_id && atual.rot_responsavel_id === atual.closer_profile_id) update.rot_responsavel_id = null;
    }
  }

  const { error } = await supabase.from("entrevistas_leads").update(update).eq("id", leadId);
  if (error) throw new Error(error.message);

  if (mudouEtapa && atual.status_followup === "validacao_entrevista") {
    // Decisão tomada: fecha a tarefa de validação do closer dono do lead.
    // Service role porque quem move o card pode ser outro (ex: líder) e a RLS
    // de tasks só deixa o dono atualizar; o filtro é só por lead + flag.
    await createAdminClient()
      .from("tasks")
      .update({ coluna: "concluido" })
      .eq("lead_id", leadId)
      .eq("exige_lead_movido", true)
      .neq("coluna", "concluido");
    revalidatePath("/tarefas");
  }

  if (mudouEtapa) {
    await registrarLog(supabase, leadId, user.id, registrandoSubido ? "subido" : statusRaw === "entrevista_recusada" ? "recusa" : "etapa", observacao || subidoObs || recusaMotivo || null, {
      de: atual.status_followup,
      para: statusRaw,
    });
  }

  revalidatePath("/leads");
  revalidatePath("/");
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
      ultimo_movimento_em: new Date().toISOString(),
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
    due_date: hojeBR(),
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

// ---------- Subidos: resultado do compliance (migration 0089) ----------
// O resultado sai de um sistema próprio da empresa, sem integração — o
// consultor lança aqui. Os resultados possíveis são um catálogo editável
// (compliance_resultados); o que o código entende é o "comportamento".

function somarDias(data: string, dias: number): string {
  const [y, m, d] = data.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + dias);
  return dt.toISOString().slice(0, 10);
}

export async function atualizarComplianceLead(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const leadId = String(formData.get("lead_id") ?? "");
  const leadNome = String(formData.get("lead_nome") ?? "").trim();
  const resultadoId = String(formData.get("resultado_id") ?? "");
  const obs = String(formData.get("obs") ?? "").trim();
  const prazoRaw = String(formData.get("pendencia_prazo") ?? "").trim();
  const reanaliseData = String(formData.get("reanalise_data") ?? "").trim();
  if (!leadId) throw new Error("Lead inválido.");
  if (!resultadoId) throw new Error("Escolha o resultado da análise.");

  const { data: resultado } = await supabase
    .from("compliance_resultados")
    .select("id, nome, comportamento")
    .eq("id", resultadoId)
    .maybeSingle();
  if (!resultado) throw new Error("Resultado inválido.");

  const { data: atual } = await supabase.from("entrevistas_leads").select("status_followup, em_reanalise").eq("id", leadId).maybeSingle();
  if (!atual) throw new Error("Lead não encontrado.");
  if (resultado.comportamento === "reanalise" && !atual.em_reanalise && !reanaliseData) {
    throw new Error("Informe a data que o Jurídico deu pra reanálise.");
  }

  const agora = new Date().toISOString();
  const update: Record<string, unknown> = {
    compliance_resultado_id: resultado.id,
    compliance_comportamento: resultado.comportamento,
    compliance_obs: obs || null,
    compliance_atualizado_em: agora,
    compliance_atualizado_por: user.id,
    ultima_atualizacao_em: agora,
    ultimo_movimento_em: agora,
    pendencia_prazo: null,
  };
  if (resultado.comportamento === "pendencia") {
    update.pendencia_prazo = /^\d{4}-\d{2}-\d{2}$/.test(prazoRaw) ? prazoRaw : somarDias(hojeBR(), DIAS_PRAZO_PENDENCIA);
  }
  if (resultado.comportamento === "queda") {
    // Queda no compliance é saída do funil: vira Perdido, de onde caiu.
    update.status_followup = "perdido";
    update.motivo_perda_etapa = "subido";
    update.motivo_perda_obs = obs ? `Queda no compliance: ${obs}` : "Queda no compliance";
    update.status_por = user.id;
    update.status_em = agora;
  }

  const { error } = await supabase.from("entrevistas_leads").update(update).eq("id", leadId);
  if (error) throw new Error(error.message);

  await registrarLog(supabase, leadId, user.id, "compliance", obs || null, {
    resultado: resultado.nome,
    comportamento: resultado.comportamento,
  });

  if (resultado.comportamento === "reanalise" && !atual.em_reanalise) {
    const fd = new FormData();
    fd.set("lead_id", leadId);
    fd.set("lead_nome", leadNome);
    fd.set("reanalise_data", reanaliseData);
    await enviarParaReanalise(fd);
  }

  revalidatePath("/leads");
  revalidatePath("/");
}

// "Sem novidade" / anotação rápida: zera a cobrança de 2 dias sem mexer em
// etapa nem em resultado do compliance.
export async function registrarAtualizacaoLead(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const leadId = String(formData.get("lead_id") ?? "");
  const nota = String(formData.get("nota") ?? "").trim();
  if (!leadId) throw new Error("Lead inválido.");

  const { error } = await supabase.from("entrevistas_leads").update({ ultima_atualizacao_em: new Date().toISOString() }).eq("id", leadId);
  if (error) throw new Error(error.message);
  await registrarLog(supabase, leadId, user.id, "atualizacao", nota || "Status conferido, sem novidade");

  revalidatePath("/leads");
  revalidatePath("/");
}

// Toque de quem recebeu o lead pra recuperação: o primeiro registro é o
// diagnóstico ("por que a venda não fechou?") e apaga a cobrança de
// "lead novo na sua carteira". NÃO reinicia o relógio de 30 dias.
export async function registrarToqueRecuperacao(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const leadId = String(formData.get("lead_id") ?? "");
  const nota = String(formData.get("nota") ?? "").trim();
  if (!leadId) throw new Error("Lead inválido.");
  if (!nota) throw new Error("Registre o que você apurou com o lead.");

  const { data: atual } = await supabase.from("entrevistas_leads").select("rot_primeiro_toque_em, rot_etapa").eq("id", leadId).maybeSingle();
  if (!atual) throw new Error("Lead não encontrado.");

  const agora = new Date().toISOString();
  const update: Record<string, unknown> = { ultima_atualizacao_em: agora };
  if (!atual.rot_primeiro_toque_em) update.rot_primeiro_toque_em = agora;
  if (atual.rot_etapa === "base_repasses") update.rot_etapa = "diagnostico";
  const { error } = await supabase.from("entrevistas_leads").update(update).eq("id", leadId);
  if (error) throw new Error(error.message);
  await registrarLog(supabase, leadId, user.id, "diagnostico", nota);

  revalidatePath("/leads");
  revalidatePath("/");
}

// ---------- Catálogo de resultados do compliance (Diretor) ----------
const COMPORTAMENTOS_VALIDOS = new Set(["aguardando", "pendencia", "reanalise", "queda", "aprovado"]);

export async function criarResultadoCompliance(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const nome = String(formData.get("nome") ?? "").trim();
  const comportamento = String(formData.get("comportamento") ?? "");
  if (!nome) throw new Error("Dê um nome ao resultado.");
  if (!COMPORTAMENTOS_VALIDOS.has(comportamento)) throw new Error("Escolha o comportamento.");

  const { error } = await supabase.from("compliance_resultados").insert({ nome, comportamento, created_by: user.id, ordem: 99 });
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
}

export async function alternarResultadoComplianceAtivo(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const ativoAtual = String(formData.get("ativo") ?? "") === "true";
  if (!id) throw new Error("Resultado inválido.");
  const { error } = await supabase.from("compliance_resultados").update({ ativo: !ativoAtual }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
}

export async function editarResultadoCompliance(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();
  const comportamento = String(formData.get("comportamento") ?? "");
  if (!id) throw new Error("Resultado inválido.");
  if (!nome) throw new Error("Dê um nome ao resultado.");
  if (!COMPORTAMENTOS_VALIDOS.has(comportamento)) throw new Error("Escolha o comportamento.");
  const { error } = await supabase.from("compliance_resultados").update({ nome, comportamento }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
}

// ---------- Funil "Repasse Entrevistas" (migration 0090) ----------
// Cada SDR só enxerga/edita o que está no nome dele (RLS repasse_sdr_id).
const ETAPAS_REPASSE_VALIDAS = new Set(["base_repasses", "tentando_reativacao", "entrevista_recuperada", "nao_faz_sentido"]);

export async function moverRepasse(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const leadId = String(formData.get("lead_id") ?? "");
  const etapa = String(formData.get("etapa") ?? "");
  const nota = String(formData.get("nota") ?? "").trim();
  if (!leadId) throw new Error("Lead inválido.");
  if (!ETAPAS_REPASSE_VALIDAS.has(etapa)) throw new Error("Etapa inválida.");

  const { data: atual } = await supabase
    .from("entrevistas_leads")
    .select("repasse_etapa, repasse_sdr_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!atual || !atual.repasse_etapa) throw new Error("Esse lead não está no funil de repasse.");
  if (atual.repasse_etapa === "nao_faz_sentido") throw new Error("Lead travado em \"Não faz sentido recuperar\" — não volta pro repasse.");
  if (atual.repasse_etapa === "entrevista_recuperada") throw new Error("Essa entrevista já foi recuperada e voltou pro closer.");

  const agora = new Date().toISOString();
  const update: Record<string, unknown> = { repasse_etapa: etapa };

  if (etapa === "nao_faz_sentido") {
    if (nota.length < 5) throw new Error("Escreva por que não faz sentido recuperar esse lead.");
    update.repasse_nota = nota;
  }
  if (etapa === "entrevista_recuperada") {
    // Volta pro funil principal: o closer original valida a nova entrevista e
    // segue o fluxo normal. Fica registrado quem recuperou (repasse_sdr_id).
    update.status_followup = "validacao_entrevista";
    update.status_por = user.id;
    update.status_em = agora;
    update.ultimo_movimento_em = agora;
    update.recusada_em = null;
  }

  const { error } = await supabase.from("entrevistas_leads").update(update).eq("id", leadId);
  if (error) throw new Error(error.message);

  await supabase.from("lead_atualizacoes").insert({
    lead_id: leadId,
    autor_id: user.id,
    tipo: "repasse",
    nota: nota || null,
    detalhe: { de: atual.repasse_etapa, para: etapa },
  });

  revalidatePath("/repasse");
  revalidatePath("/leads");
  revalidatePath("/");
}

// ---------- Funil "Repasse Closers" (rotação de 30 dias, migration 0090) ----------
// Mesma estrutura do repasse de entrevistas dos SDRs: Base de Repasses →
// Diagnóstico → Tentando Recuperar → Recuperado | Não faz sentido recuperar.
const ETAPAS_REPASSE_CLOSER_VALIDAS = new Set(["base_repasses", "diagnostico", "tentando_recuperar", "recuperado", "nao_faz_sentido"]);

export async function moverRepasseCloser(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const leadId = String(formData.get("lead_id") ?? "");
  const etapa = String(formData.get("etapa") ?? "");
  const nota = String(formData.get("nota") ?? "").trim();
  if (!leadId) throw new Error("Lead inválido.");
  if (!ETAPAS_REPASSE_CLOSER_VALIDAS.has(etapa)) throw new Error("Etapa inválida.");

  const { data: atual } = await supabase
    .from("entrevistas_leads")
    .select("rot_etapa, rot_fase, rot_primeiro_toque_em, rot_responsavel_id, closer_profile_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!atual || !atual.rot_etapa) throw new Error("Esse lead não está no funil de repasse.");
  if (atual.rot_etapa === "nao_faz_sentido") throw new Error('Lead travado em "Não faz sentido recuperar" — não volta pro repasse.');
  if (atual.rot_etapa === "recuperado") throw new Error("Esse lead já foi recuperado e voltou pro funil principal.");

  const agora = new Date().toISOString();
  const update: Record<string, unknown> = { rot_etapa: etapa, ultima_atualizacao_em: agora };

  if (etapa === "diagnostico" || etapa === "tentando_recuperar") {
    if (!atual.rot_primeiro_toque_em) update.rot_primeiro_toque_em = agora;
  }
  if (etapa === "diagnostico" && nota.length < 3) {
    throw new Error("Registre o que o lead disse sobre por que não fechou.");
  }
  if (etapa === "nao_faz_sentido") {
    if (nota.length < 5) throw new Error("Escreva por que não faz sentido recuperar esse lead.");
    update.rot_nota = nota;
    update.rot_primeiro_toque_em = atual.rot_primeiro_toque_em ?? agora;
  }
  if (etapa === "recuperado") {
    // Sai da rotação e volta pro fluxo normal; quem recuperou fica com o lead.
    update.rot_fase = null;
    update.rot_desde = null;
    update.rot_primeiro_toque_em = null;
    update.ultimo_movimento_em = agora;
    if (atual.rot_responsavel_id && atual.rot_responsavel_id === atual.closer_profile_id) update.rot_responsavel_id = null;
  }

  const { error } = await supabase.from("entrevistas_leads").update(update).eq("id", leadId);
  if (error) throw new Error(error.message);

  await supabase.from("lead_atualizacoes").insert({
    lead_id: leadId,
    autor_id: user.id,
    tipo: "diagnostico",
    nota: nota || null,
    detalhe: { de: atual.rot_etapa, para: etapa },
  });

  revalidatePath("/leads");
  revalidatePath("/");
}
