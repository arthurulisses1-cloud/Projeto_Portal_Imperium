import { FUNNEL_STAGES, FUNNEL_LABELS, type FunilEtapa } from "@/lib/funil";

export type Transicao = { de: FunilEtapa; para: FunilEtapa; label: string };

export const TRANSICOES: Transicao[] = FUNNEL_STAGES.slice(0, -1).map((etapa, i) => {
  const proxima = FUNNEL_STAGES[i + 1];
  return { de: etapa, para: proxima, label: `${FUNNEL_LABELS[etapa]} → ${FUNNEL_LABELS[proxima]}` };
});

export const MESES_LABEL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Deriva a meta de CADA etapa do funil a partir da meta de crédito + ticket
// médio (dá a meta de Pagos) e das taxas de conversão esperadas (anda de
// trás pra frente até Tentativas). Etapa sem taxa cadastrada fica null —
// não dá pra estimar sem esse dado.
export function calcularFunilMeta(
  metaCredito: number,
  metaTicketMedio: number,
  taxas: Map<string, number>
): Record<FunilEtapa, number | null> {
  const resultado = Object.fromEntries(
    FUNNEL_STAGES.map((e) => [e, null])
  ) as Record<FunilEtapa, number | null>;

  if (metaTicketMedio > 0) {
    resultado.pagos = metaCredito / metaTicketMedio;
  }

  for (let i = FUNNEL_STAGES.length - 2; i >= 0; i--) {
    const etapa = FUNNEL_STAGES[i];
    const proxima = FUNNEL_STAGES[i + 1];
    const proximoValor = resultado[proxima];
    const taxa = taxas.get(`${etapa}_${proxima}`);
    resultado[etapa] = proximoValor !== null && taxa ? proximoValor / taxa : null;
  }

  return resultado;
}
