export type Tier = { producao_min: number; fixo: number; pct_variavel: number };

export function lookupComissao(tiers: Tier[], producaoReal: number) {
  if (!tiers || tiers.length === 0) return null;
  const ordenados = [...tiers].sort((a, b) => a.producao_min - b.producao_min);
  let chosenIdx = 0;
  ordenados.forEach((t, i) => {
    if (producaoReal >= t.producao_min) chosenIdx = i;
  });
  const chosen = ordenados[chosenIdx];
  const variavel = Math.round((chosen.pct_variavel / 100) * producaoReal);
  const total = chosen.fixo + variavel;
  return {
    fixo: chosen.fixo,
    pct: chosen.pct_variavel,
    variavel,
    total,
    tierIdx: chosenIdx,
    abaixoDoMinimo: producaoReal < ordenados[0].producao_min,
  };
}

// Quanto falta de produção pro próximo tier, e quanto a comissão total sobe
// se bater ele.
export function proximoTier(tiers: Tier[], producaoReal: number) {
  if (!tiers || tiers.length === 0) return null;
  const ordenados = [...tiers].sort((a, b) => a.producao_min - b.producao_min);
  const atual = lookupComissao(ordenados, producaoReal);
  if (!atual) return null;
  const proximo = ordenados[atual.tierIdx + 1];
  if (!proximo) return null;
  const variavelNoProximo = Math.round((proximo.pct_variavel / 100) * proximo.producao_min);
  const totalNoProximo = proximo.fixo + variavelNoProximo;
  return {
    faltaProducao: proximo.producao_min - producaoReal,
    ganhoTotal: totalNoProximo - atual.total,
    proximoLimite: proximo.producao_min,
  };
}
