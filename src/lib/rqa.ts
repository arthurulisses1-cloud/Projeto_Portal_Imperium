// RQA (Auditoria → RQA, só na Acrópole): as reuniões realizadas do mês com o BANT que o BDR preencheu, a
// validação do closer ("RQA validada?" no Pipefácil, obrigatória para tirar o lead da Reunião Realizada do
// Funil de Vendas) e a validação do gerente comercial (feita no Senatus). Trazida da página RQA do sistema
// antigo (18/11/2026). A comissão de RQA do BDR é aprovadas pelo gerente × valor (R$ 30), paga no dia 15
// do mês seguinte; a previsão (validadas pelo closer × valor) só mostra o que vem. Fica só nesta página:
// não entra na Comissão do mês.
import type { LeadAuditoria } from "@/lib/integracoes/auditoria";

export type SituacaoRqa = "validada" | "nao_validada" | "aguardando" | "sem_registro";
export type DecisaoGerente = "aprovada" | "reprovada";
export type ValidacaoGerente = { decisao: DecisaoGerente; observacao: string | null; atualizadoEm: string; atualizadoPor: string | null };

const semAcento = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Situação da RQA de uma reunião realizada (como no sistema antigo):
 * - validada / nao_validada: o closer preencheu "RQA validada?";
 * - aguardando: sem a validação e o lead ainda está na Reunião Realizada do Funil de Vendas (ou ainda no
 *   funil do BDR): o closer ainda vai validar;
 * - sem_registro: sem a validação, mas o lead já saiu da Reunião Realizada (proposta, ganho…) ou foi
 *   perdido. Tem de ser acertado no Pipefácil.
 */
export function situacaoDaRqa(l: Pick<LeadAuditoria, "rqa" | "status" | "etapa" | "funil">): SituacaoRqa {
  const v = semAcento(l.rqa);
  if (v === "sim" || v === "true") return "validada";
  if (v === "nao" || v === "false") return "nao_validada";
  if (l.status === "lost") return "sem_registro";
  if (/vendas/i.test(l.funil) && (l.status === "won" || semAcento(l.etapa) !== "reuniao realizada")) return "sem_registro";
  return "aguardando";
}

/** Quantos dos quatro campos do BANT estão preenchidos (Faturamento, Cargo, Necessidade, Timing). */
export const bantPreenchidos = (l: Pick<LeadAuditoria, "faturamento" | "cargo" | "necessidade" | "timing">) =>
  [l.faturamento, l.cargo, l.necessidade, l.timing].filter(Boolean).length;

export type ResumoRqa = {
  realizadas: number;
  validada: number;
  nao_validada: number;
  aguardando: number;
  sem_registro: number;
  bantIncompleto: number;
  aprovadas: number;
  reprovadas: number;
  semGerente: number;
  /** Validadas pelo closer × valor. */
  previsao: number;
  /** Aprovadas pelo gerente × valor (a oficial). */
  comissao: number;
};

export function resumirRqa(lista: LeadAuditoria[], gerente: Map<string, ValidacaoGerente>, valor: number): ResumoRqa {
  const conta = (s: SituacaoRqa) => lista.filter((l) => situacaoDaRqa(l) === s).length;
  const aprovadas = lista.filter((l) => gerente.get(l.id)?.decisao === "aprovada").length;
  const reprovadas = lista.filter((l) => gerente.get(l.id)?.decisao === "reprovada").length;
  const validada = conta("validada");
  return {
    realizadas: lista.length,
    validada,
    nao_validada: conta("nao_validada"),
    aguardando: conta("aguardando"),
    sem_registro: conta("sem_registro"),
    bantIncompleto: lista.filter((l) => bantPreenchidos(l) < 4).length,
    aprovadas,
    reprovadas,
    semGerente: lista.length - aprovadas - reprovadas,
    previsao: validada * valor,
    comissao: aprovadas * valor,
  };
}

/** Dia do pagamento da comissão de RQA do mês (AAAA-MM): o dia 15 do mês seguinte. */
export function pagamentoDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01-15` : `${a}-${String(m + 1).padStart(2, "0")}-15`;
}
