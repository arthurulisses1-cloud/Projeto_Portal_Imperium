import type { Diagnostico } from "@/lib/gargalo";
import { FUNNEL_LABELS } from "@/lib/funil";

export type ParecerItem = { tom: "alerta" | "elogio" | "info"; texto: string };

// Parecer determinístico (não é IA de verdade — mesma decisão de produto já
// tomada pro Diagnóstico de Gargalo) que junta várias leituras da produção
// num conjunto de recomendações de melhoria, com tom de "Oráculo".
export function gerarParecer({
  gargalo,
  ticketMedio,
  metaTicketMedio,
  pctMeta,
}: {
  gargalo: Diagnostico | null;
  ticketMedio: number | null;
  metaTicketMedio: number;
  pctMeta: number | null;
}): ParecerItem[] {
  const itens: ParecerItem[] = [];

  if (gargalo) {
    const pct = Math.abs(gargalo.desvioPct).toFixed(0);
    itens.push({
      tom: "alerta",
      texto: `Foque em ${FUNNEL_LABELS[gargalo.etapa]}: está ${pct}% abaixo da conversão esperada — é o seu maior ponto de perda no funil agora.`,
    });
    if (gargalo.moduloTrilha) {
      itens.push({
        tom: "info",
        texto: `Recomendação de estudo: módulo "${gargalo.moduloTrilha}" na Trilha de Formação, direcionado a essa etapa.`,
      });
    }
  } else {
    itens.push({
      tom: "elogio",
      texto: "Funil equilibrado — nenhuma etapa abaixo da meta de conversão. Continue no ritmo.",
    });
  }

  if (ticketMedio !== null && metaTicketMedio > 0) {
    const diffPct = ((ticketMedio - metaTicketMedio) / metaTicketMedio) * 100;
    if (diffPct <= -15) {
      itens.push({
        tom: "alerta",
        texto: `Ticket médio ${Math.abs(diffPct).toFixed(0)}% abaixo do esperado — reveja se está fechando negócios menores do que deveria ou perdendo upsell.`,
      });
    } else if (diffPct >= 15) {
      itens.push({
        tom: "elogio",
        texto: `Ticket médio ${diffPct.toFixed(0)}% acima do esperado — ótimo trabalho de qualificação e negociação.`,
      });
    }
  }

  if (pctMeta !== null) {
    if (pctMeta < 60) {
      itens.push({
        tom: "alerta",
        texto: `Você está em ${pctMeta.toFixed(0)}% da meta do período — no ritmo atual, dificilmente bate o mês. Vale intensificar volume agora.`,
      });
    } else if (pctMeta >= 100) {
      itens.push({
        tom: "elogio",
        texto: `Meta do período batida (${pctMeta.toFixed(0)}%). Hora de pensar no próximo degrau — olha o Sistema de Marcos.`,
      });
    }
  }

  return itens;
}
