export type Tier = { producao_min: number; fixo: number; pct_variavel: number };

export function lookupComissao(tiers: Tier[], producaoReal: number) {
  if (!tiers || tiers.length === 0) return null;
  const ordenados = [...tiers].sort((a, b) => a.producao_min - b.producao_min);
  let chosen = ordenados[0];
  for (const t of ordenados) {
    if (producaoReal >= t.producao_min) chosen = t;
  }
  const variavel = Math.round((chosen.pct_variavel / 100) * producaoReal);
  const total = chosen.fixo + variavel;
  return {
    fixo: chosen.fixo,
    pct: chosen.pct_variavel,
    variavel,
    total,
    abaixoDoMinimo: producaoReal < ordenados[0].producao_min,
  };
}
