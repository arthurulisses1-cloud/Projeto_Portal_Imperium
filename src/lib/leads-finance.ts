// Funil de leads do Vorp Finance (2026-11-17): Entrevista -> Subido -> Resolvendo pendência -> Venda.
// A venda pedida pelo consultor fica "aguardando aprovação" e só vira venda efetiva (tabela `vendas`)
// quando o Head do Finance ou o Diretor aprovam. Só lógica pura aqui (sem banco).

import { FINANCE } from "@/lib/comissao-negocio";

/** Margem base do Finance (% do valor de desembolso). Fixa: o vendedor não altera. */
export const MARGEM_FINANCE_PCT = FINANCE.margemBase;

const arred = (v: number) => Math.round(v * 100) / 100;

/** Margem base e deságio: o que a comissão passa da margem (6% do desembolso) é deságio; abaixo da margem não há deságio. */
export function desagioFinance(desembolso: number, comissao: number): { pct: number; margem: number; desagio: number } {
  const margem = arred((Math.max(0, desembolso) * MARGEM_FINANCE_PCT) / 100);
  return { pct: MARGEM_FINANCE_PCT, margem, desagio: Math.max(0, arred(Math.max(0, comissao) - margem)) };
}

/** Lê um valor digitado em formato BR (1.234,56) ou simples (1234.56). */
export function parseValorBR(v: string): number {
  const bruto = v.trim().replace(/\s/g, "").replace(/^R\$/, "");
  const normal = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
  const n = Number(normal);
  return Number.isFinite(n) ? n : 0;
}

export type EtapaFinance = "validacao_entrevista" | "subido" | "resolvendo_pendencia" | "venda_pendente" | "venda_aprovada" | "perdido";

/** Colunas do kanban. A coluna "Venda" reúne a venda aguardando aprovação e a aprovada. */
export const COLUNAS_FINANCE: { chave: string; label: string; etapas: EtapaFinance[]; destino: EtapaFinance }[] = [
  { chave: "entrevista", label: "Entrevista", etapas: ["validacao_entrevista"], destino: "validacao_entrevista" },
  { chave: "subido", label: "Subido", etapas: ["subido"], destino: "subido" },
  { chave: "pendencia", label: "Resolvendo pendência", etapas: ["resolvendo_pendencia"], destino: "resolvendo_pendencia" },
  { chave: "venda", label: "Venda", etapas: ["venda_pendente", "venda_aprovada"], destino: "venda_pendente" },
];

export const ETAPAS_FINANCE_ABERTAS: EtapaFinance[] = ["validacao_entrevista", "subido", "resolvendo_pendencia", "venda_pendente"];

/** Etapa de perda registrada em motivo_perda_etapa (valores já aceitos pelo catálogo de motivos). */
export function etapaDePerda(etapa: string): string {
  return etapa === "validacao_entrevista" ? "validacao_entrevista" : "subido";
}

export type DadosSubido = {
  valorPrecatorio: number;
  valorProposta: number;
  comissaoPrevista: number;
  mesmoFundo: boolean | null;
  fundoNovo: string | null;
};

/** Mensagem de erro do formulário de Subido; null = válido. */
export function validarSubido(d: DadosSubido): string | null {
  if (!(d.valorPrecatorio > 0)) return "Informe o valor do precatório.";
  if (!(d.valorProposta > 0)) return "Informe o valor da nossa proposta de desembolso.";
  if (d.valorProposta > d.valorPrecatorio) return "A proposta de desembolso não pode ser maior que o valor do precatório.";
  if (!(d.comissaoPrevista > 0)) return "Informe a nossa comissão prevista.";
  if (d.mesmoFundo === null) return "Confirme se seguimos no mesmo fundo da entrevista.";
  if (d.mesmoFundo === false && !(d.fundoNovo ?? "").trim()) return "Informe o fundo para onde o lead vai.";
  return null;
}

export type DadosVenda = { valorRecebido: number; valorCliente: number; data: string };

/** Mensagem de erro do formulário de Venda; null = válido. `hoje` = AAAA-MM-DD. */
export function validarVenda(d: DadosVenda, hoje: string): string | null {
  if (!(d.valorRecebido > 0)) return "Informe a comissão recebida.";
  if (!(d.valorCliente > 0)) return "Informe o valor pago ao cliente.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data) || d.data > hoje) return "Data inválida (não pode ser futura).";
  return null;
}

/** Canal da venda (outbound/inbound/indicação) a partir da "Origem" da planilha de entrevistas. */
export function canalDaOrigem(origem: string | null): "outbound" | "inbound" | "indicacao" {
  const o = (origem ?? "").toLowerCase();
  if (o.includes("inbound")) return "inbound";
  if (o.includes("indica") || o.includes("parceiro")) return "indicacao";
  return "outbound";
}

/**
 * Quem leva o crédito de executivo numa venda do Finance. Se SDR e Closer do formulário são pessoas
 * diferentes e só um deles é do time do Finance, o executivo é o do Finance e o outro entra como
 * participante (a parte da liderança é dividida em 3 com ele). Se os dois (ou nenhum) são do Finance,
 * vale o Closer. `membros` = quem está no Finance.
 */
export function definirExecutivo(sdrId: string | null, closerId: string | null, membros: ReadonlySet<string>): { executivoId: string | null; participanteId: string | null } {
  if (sdrId && closerId && sdrId !== closerId) {
    const sdrDentro = membros.has(sdrId);
    const closerDentro = membros.has(closerId);
    if (sdrDentro && !closerDentro) return { executivoId: sdrId, participanteId: closerId };
    return { executivoId: closerId, participanteId: sdrId };
  }
  return { executivoId: closerId ?? sdrId, participanteId: null };
}

/** Quem aprova a venda: Diretor, ou Head do negócio do lead. */
export function podeAprovarVenda(papel: { diretor: boolean; headDoNegocio: boolean }): boolean {
  return papel.diretor || papel.headDoNegocio;
}

/** Nome seguro para o arquivo do anexo no storage. */
export function nomeArquivoSeguro(nome: string): string {
  const base = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return (base || "anexo").slice(-80);
}
