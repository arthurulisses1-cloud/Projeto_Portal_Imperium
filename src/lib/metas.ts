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
