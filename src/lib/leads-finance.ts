// Funil de leads do Vorp Finance (2026-11-17): Entrevista -> Subido -> Resolvendo pendência -> Venda.
// A venda pedida pelo consultor fica "aguardando aprovação" e só vira venda efetiva (tabela `vendas`)
// quando o Head do Finance ou o Diretor aprovam. Só lógica pura aqui (sem banco).

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

/** Quem aprova a venda: Diretor, ou Head do negócio do lead. */
export function podeAprovarVenda(papel: { diretor: boolean; headDoNegocio: boolean }): boolean {
  return papel.diretor || papel.headDoNegocio;
}

/** Nome seguro para o arquivo do anexo no storage. */
export function nomeArquivoSeguro(nome: string): string {
  const base = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return (base || "anexo").slice(-80);
}
