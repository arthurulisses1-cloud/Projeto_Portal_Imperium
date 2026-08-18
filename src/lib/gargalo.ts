import { FUNNEL_STAGES, FUNNEL_LABELS, type FunilEtapa } from "@/lib/funil";

// Regra determinística (não é IA — a spec pede a IA só pra redigir o texto
// em cima do dado já calculado; aqui o dado é o que importa): compara a taxa
// de conversão realizada de cada etapa com a esperada e acha o maior desvio
// negativo. Também compara com a média da Tribo, se disponível.
const STAGE_TO_TRILHA: Partial<Record<FunilEtapa, string>> = {
  tentativas: "Fundamentos de Prospecção",
  alos: "Fundamentos de Prospecção",
  conexoes: "Objeções em Ligação Fria",
  entrevistas: "Condução de Entrevista",
  subidos: "Condução de Entrevista",
  assinaturas: "Fechamento Consultivo",
  pagos: "Fechamento Consultivo",
};

export type Diagnostico = {
  etapa: FunilEtapa;
  desvioPct: number;
  taxaRealizada: number;
  taxaEsperada: number;
  taxaTribo: number | null;
  moduloTrilha?: string;
};

function taxaEntre(totais: Record<FunilEtapa, number>, i: number): number | null {
  const atual = totais[FUNNEL_STAGES[i]];
  const proxima = totais[FUNNEL_STAGES[i + 1]];
  return atual > 0 ? proxima / atual : null;
}

export function calcularGargalo(
  realizado: Record<FunilEtapa, number>,
  taxasEsperadas: Map<string, number>,
  realizadoTribo?: Record<FunilEtapa, number>
): Diagnostico | null {
  let pior: Diagnostico | null = null;

  for (let i = 0; i < FUNNEL_STAGES.length - 1; i++) {
    const etapa = FUNNEL_STAGES[i];
    const proxima = FUNNEL_STAGES[i + 1];
    const esperada = taxasEsperadas.get(`${etapa}_${proxima}`);
    if (!esperada) continue;

    const realizada = taxaEntre(realizado, i);
    if (realizada === null) continue;

    const desvioPct = ((realizada - esperada) / esperada) * 100;
    if (desvioPct >= 0) continue; // só interessa desvio negativo (abaixo da meta)

    if (!pior || desvioPct < pior.desvioPct) {
      const taxaTribo = realizadoTribo ? taxaEntre(realizadoTribo, i) : null;
      pior = {
        etapa: proxima,
        desvioPct,
        taxaRealizada: realizada,
        taxaEsperada: esperada,
        taxaTribo,
        moduloTrilha: STAGE_TO_TRILHA[proxima],
      };
    }
  }

  return pior;
}

export function textoGargalo(d: Diagnostico): string {
  const pct = Math.abs(d.desvioPct).toFixed(0);
  let texto = `A etapa ${FUNNEL_LABELS[d.etapa]} está ${pct}% abaixo da meta — o maior desvio do funil.`;
  if (d.taxaTribo !== null) {
    const acimaOuAbaixo = d.taxaRealizada < d.taxaTribo ? "também abaixo" : "acima";
    texto += ` Comparado à média da Tribo, essa etapa está ${acimaOuAbaixo} da média.`;
  }
  return texto;
}
