// Faturamento acima de 100 mil (Acrópole, 18/11/2026): ao lado das reuniões agendadas e realizadas, no Pace e
// no Dashboard do negócio, quantas são de leads com faturamento a partir de 100 mil/mês e a porcentagem.
// Conta pelas listas de leads de cada número (as mesmas do hover), com as faixas de `acima100k` da config.
import { CRM_POR_NEGOCIO } from "@/lib/integracoes/config";
import type { LeadEtapa } from "@/lib/funil-negocio";

export type Acima100k = { qtd: number; total: number; pct: number; semFaturamento: number };

/** Faixas que contam no negócio; null = o negócio não usa o indicador. */
export function faixasAcima100k(slug: string): string[] | null {
  const f = CRM_POR_NEGOCIO[slug]?.acima100k;
  return f && f.length > 0 ? f : null;
}

/**
 * Resumo de uma lista de leads. null quando o negócio não tem as faixas, a lista está vazia ou foi gravada
 * antes do campo existir (lead sem a chave `faturamento`): melhor não mostrar do que mostrar 0%.
 */
export function resumirAcima100k(leads: Pick<LeadEtapa, "faturamento">[] | undefined, faixas: string[] | null): Acima100k | null {
  if (!faixas || !leads || leads.length === 0) return null;
  if (leads.some((l) => l.faturamento === undefined)) return null;
  const aceitas = new Set(faixas);
  const qtd = leads.filter((l) => !!l.faturamento && aceitas.has(l.faturamento)).length;
  const semFaturamento = leads.filter((l) => !l.faturamento).length;
  return { qtd, total: leads.length, pct: qtd / leads.length, semFaturamento };
}

/** "44%" (uma casa quando não é inteiro: "37,5%"). */
export const pctAcima100k = (r: Acima100k) => `${(Math.round(r.pct * 1000) / 10).toLocaleString("pt-BR")}%`;
