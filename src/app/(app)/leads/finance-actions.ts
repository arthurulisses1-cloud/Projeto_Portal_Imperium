"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hojeBR } from "@/lib/data-br";
import { canalDaOrigem, etapaDePerda, nomeArquivoSeguro, podeAprovarVenda, validarSubido, validarVenda } from "@/lib/leads-finance";

// Funil de leads do Vorp Finance (migration 0113). As ações devolvem { erro } em vez de lançar,
// para o formulário mostrar a mensagem sem derrubar a página.
export type EstadoForm = { erro?: string; ok?: boolean };

const TAMANHO_MAX_ANEXO = 15 * 1024 * 1024;

function valorBR(v: FormDataEntryValue | null): number {
  const bruto = String(v ?? "").trim().replace(/\s/g, "").replace(/^R\$/, "");
  const normal = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
  const n = Number(normal);
  return Number.isFinite(n) ? n : 0;
}

async function contexto() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { supabase, user };
}

/** Lead do funil do Finance (tem negocio_id) lido pela RLS do usuário. */
async function lerLead(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase
    .from("entrevistas_leads")
    .select(
      "id, lead_nome, status_followup, negocio_id, sdr_profile_id, closer_profile_id, origem, tipo_precatorio, fundo_destino, sub_valor_precatorio, sub_valor_proposta, sub_comissao_prevista, venda_valor_recebido, venda_valor_cliente, venda_data, venda_obs, venda_id"
    )
    .eq("id", id)
    .maybeSingle();
  return data && data.negocio_id ? data : null;
}

/** Subido: dados da proposta + anexo opcional. */
export async function subirLeadFinance(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const ctx = await contexto();
  if (!ctx) return { erro: "Não autenticado." };
  const { supabase, user } = ctx;
  const leadId = String(formData.get("lead_id") ?? "");
  const lead = await lerLead(supabase, leadId);
  if (!lead) return { erro: "Lead não encontrado." };
  if (!["validacao_entrevista", "subido", "resolvendo_pendencia"].includes(lead.status_followup)) {
    return { erro: "Este lead já passou da etapa de Subido." };
  }

  const mesmoRaw = String(formData.get("mesmo_fundo") ?? "");
  const dados = {
    valorPrecatorio: valorBR(formData.get("valor_precatorio")),
    valorProposta: valorBR(formData.get("valor_proposta")),
    comissaoPrevista: valorBR(formData.get("comissao_prevista")),
    mesmoFundo: mesmoRaw === "sim" ? true : mesmoRaw === "nao" ? false : null,
    fundoNovo: String(formData.get("fundo_novo") ?? "").trim() || null,
  };
  const erro = validarSubido(dados);
  if (erro) return { erro };

  let anexoPath: string | null = null;
  const anexo = formData.get("anexo");
  if (anexo instanceof File && anexo.size > 0) {
    if (anexo.size > TAMANHO_MAX_ANEXO) return { erro: "O anexo passa de 15 MB." };
    anexoPath = `${user.id}/${lead.id}/${Date.now()}-${nomeArquivoSeguro(anexo.name)}`;
    const { error: upErro } = await supabase.storage.from("leads-anexos").upload(anexoPath, anexo, { contentType: anexo.type || undefined });
    if (upErro) return { erro: "Não foi possível enviar o anexo: " + upErro.message };
  }

  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("entrevistas_leads")
    .update({
      status_followup: "subido",
      subido_em: agora,
      subido_por: user.id,
      subido_obs: String(formData.get("observacao") ?? "").trim() || null,
      sub_valor_precatorio: dados.valorPrecatorio,
      sub_valor_proposta: dados.valorProposta,
      sub_comissao_prevista: dados.comissaoPrevista,
      sub_mesmo_fundo: dados.mesmoFundo,
      sub_fundo_novo: dados.mesmoFundo ? null : dados.fundoNovo,
      ...(anexoPath ? { sub_anexo_path: anexoPath } : {}),
      status_por: user.id,
      status_em: agora,
      ultimo_movimento_em: agora,
    })
    .eq("id", lead.id);
  if (error) return { erro: "Não foi possível salvar: " + error.message };

  revalidatePath("/leads");
  return { ok: true };
}

/** Movimentos simples (sem formulário): voltar para Entrevista ou ir para Resolvendo pendência. */
export async function moverEtapaFinance(leadId: string, destino: "validacao_entrevista" | "resolvendo_pendencia"): Promise<EstadoForm> {
  const ctx = await contexto();
  if (!ctx) return { erro: "Não autenticado." };
  const { supabase, user } = ctx;
  const lead = await lerLead(supabase, leadId);
  if (!lead) return { erro: "Lead não encontrado." };
  if (lead.status_followup === "venda_aprovada" || lead.status_followup === "perdido") return { erro: "Este lead já está encerrado." };
  if (destino === "resolvendo_pendencia" && lead.sub_valor_proposta === null) return { erro: "Suba o lead (formulário de Subido) antes de marcar pendência." };
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("entrevistas_leads")
    .update({ status_followup: destino, status_por: user.id, status_em: agora, ultimo_movimento_em: agora })
    .eq("id", lead.id);
  if (error) return { erro: error.message };
  revalidatePath("/leads");
  return { ok: true };
}

/** Venda: o consultor pede; fica aguardando aprovação do Head/Diretor. */
export async function pedirVendaFinance(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const ctx = await contexto();
  if (!ctx) return { erro: "Não autenticado." };
  const { supabase, user } = ctx;
  const lead = await lerLead(supabase, String(formData.get("lead_id") ?? ""));
  if (!lead) return { erro: "Lead não encontrado." };
  if (!["subido", "resolvendo_pendencia", "venda_pendente"].includes(lead.status_followup)) return { erro: "Suba o lead antes de lançar a venda." };
  if (lead.sub_valor_proposta === null) return { erro: "Falta o formulário de Subido deste lead." };
  if (!lead.closer_profile_id) return { erro: "O lead está sem closer na planilha; peça para corrigir antes de lançar a venda." };

  const dados = {
    valorRecebido: valorBR(formData.get("valor_recebido")),
    valorCliente: valorBR(formData.get("valor_cliente")),
    data: String(formData.get("data") ?? "") || hojeBR(),
  };
  const erro = validarVenda(dados, hojeBR());
  if (erro) return { erro };

  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("entrevistas_leads")
    .update({
      status_followup: "venda_pendente",
      venda_valor_recebido: dados.valorRecebido,
      venda_valor_cliente: dados.valorCliente,
      venda_data: dados.data,
      venda_obs: String(formData.get("observacao") ?? "").trim() || null,
      venda_enviada_em: agora,
      venda_enviada_por: user.id,
      venda_recusa_motivo: null,
      status_por: user.id,
      status_em: agora,
      ultimo_movimento_em: agora,
    })
    .eq("id", lead.id);
  if (error) return { erro: "Não foi possível salvar: " + error.message };
  revalidatePath("/leads");
  return { ok: true };
}

/** Quem pode aprovar: Diretor ou Head do negócio do lead. */
async function podeAprovar(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, negocioId: string) {
  const [{ data: eu }, { data: vinculo }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
    supabase.from("profile_negocios").select("cargo").eq("profile_id", userId).eq("negocio_id", negocioId).maybeSingle(),
  ]);
  return podeAprovarVenda({ diretor: eu?.role === "diretor", headDoNegocio: vinculo?.cargo === "head" });
}

/** Aprova a venda: grava em `vendas` (conta em Recebido, metas e comissão) e encerra o lead como venda aprovada. */
export async function aprovarVendaFinance(leadId: string): Promise<EstadoForm> {
  const ctx = await contexto();
  if (!ctx) return { erro: "Não autenticado." };
  const { supabase, user } = ctx;
  const lead = await lerLead(supabase, leadId);
  if (!lead) return { erro: "Lead não encontrado." };
  if (!(await podeAprovar(supabase, user.id, lead.negocio_id as string))) return { erro: "Só o Head do Finance ou o Diretor aprovam vendas." };
  if (lead.status_followup !== "venda_pendente") return { erro: "Esta venda não está aguardando aprovação." };
  if (!lead.closer_profile_id || lead.venda_valor_recebido === null || lead.venda_valor_cliente === null || !lead.venda_data) {
    return { erro: "Dados da venda incompletos." };
  }

  const { data: venda, error: vendaErro } = await supabase
    .from("vendas")
    .insert({
      profile_id: lead.closer_profile_id,
      tipo: "individual",
      valor: lead.venda_valor_recebido,
      valor_cliente: lead.venda_valor_cliente,
      data: lead.venda_data,
      cliente: lead.lead_nome,
      produto: lead.tipo_precatorio,
      observacao: lead.venda_obs,
      canal: canalDaOrigem(lead.origem),
      indicador_id: lead.sdr_profile_id && lead.sdr_profile_id !== lead.closer_profile_id ? lead.sdr_profile_id : null,
      papel: "closer",
      origem: "lead aprovado",
      negocio_id: lead.negocio_id,
      lancamento_manual: true,
      lancado_por: user.id,
    })
    .select("id")
    .single();
  if (vendaErro || !venda) return { erro: "Não foi possível registrar a venda: " + (vendaErro?.message ?? "sem retorno") };

  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("entrevistas_leads")
    .update({
      status_followup: "venda_aprovada",
      venda_aprovada_em: agora,
      venda_aprovada_por: user.id,
      venda_id: venda.id,
      status_por: user.id,
      status_em: agora,
      ultimo_movimento_em: agora,
    })
    .eq("id", lead.id);
  if (error) {
    await supabase.from("vendas").delete().eq("id", venda.id); // não deixa venda órfã
    return { erro: "Não foi possível concluir a aprovação: " + error.message };
  }
  revalidatePath("/leads");
  revalidatePath("/");
  return { ok: true };
}

/** Recusa a venda: volta o lead para Resolvendo pendência com o motivo para o consultor. */
export async function recusarVendaFinance(leadId: string, motivo: string): Promise<EstadoForm> {
  const ctx = await contexto();
  if (!ctx) return { erro: "Não autenticado." };
  const { supabase, user } = ctx;
  const lead = await lerLead(supabase, leadId);
  if (!lead) return { erro: "Lead não encontrado." };
  if (!(await podeAprovar(supabase, user.id, lead.negocio_id as string))) return { erro: "Só o Head do Finance ou o Diretor recusam vendas." };
  if (lead.status_followup !== "venda_pendente") return { erro: "Esta venda não está aguardando aprovação." };
  if (!motivo.trim()) return { erro: "Diga o motivo da recusa." };
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("entrevistas_leads")
    .update({ status_followup: "resolvendo_pendencia", venda_recusa_motivo: motivo.trim(), status_por: user.id, status_em: agora, ultimo_movimento_em: agora })
    .eq("id", lead.id);
  if (error) return { erro: error.message };
  revalidatePath("/leads");
  return { ok: true };
}

/** Lead perdido, com motivo do catálogo existente. */
export async function perderLeadFinance(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const ctx = await contexto();
  if (!ctx) return { erro: "Não autenticado." };
  const { supabase, user } = ctx;
  const lead = await lerLead(supabase, String(formData.get("lead_id") ?? ""));
  if (!lead) return { erro: "Lead não encontrado." };
  if (["venda_aprovada", "perdido"].includes(lead.status_followup)) return { erro: "Este lead já está encerrado." };
  const motivoId = String(formData.get("motivo_perda_id") ?? "").trim();
  if (!motivoId) return { erro: "Selecione o motivo da perda." };
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("entrevistas_leads")
    .update({
      status_followup: "perdido",
      motivo_perda_id: motivoId,
      motivo_perda_obs: String(formData.get("motivo_perda_obs") ?? "").trim() || null,
      motivo_perda_etapa: etapaDePerda(lead.status_followup),
      status_por: user.id,
      status_em: agora,
      ultimo_movimento_em: agora,
    })
    .eq("id", lead.id);
  if (error) return { erro: error.message };
  revalidatePath("/leads");
  return { ok: true };
}
