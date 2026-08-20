export type Tier = {
  producao_min: number;
  fixo: number;
  pct_sdr: number;
  pct_closer: number;
  pct_gestao: number;
};

export type Papel = "sdr" | "closer" | "gestao";

// Simulador genérico: aplica UMA % (a do papel escolhido) sobre uma produção
// hipotética, escolhendo o tier pela própria produção simulada. Usado só
// pelos simuladores client-side (SimuladorComissao/SimuladorVendaRapida),
// que simulam "e se eu produzisse mais no MEU papel principal".
export function lookupComissao(tiers: Tier[], producaoReal: number, papel: Papel = "closer") {
  if (!tiers || tiers.length === 0) return null;
  const ordenados = [...tiers].sort((a, b) => a.producao_min - b.producao_min);
  let chosenIdx = 0;
  ordenados.forEach((t, i) => {
    if (producaoReal >= t.producao_min) chosenIdx = i;
  });
  const chosen = ordenados[chosenIdx];
  const pct = papel === "sdr" ? chosen.pct_sdr : papel === "gestao" ? chosen.pct_gestao : chosen.pct_closer;
  const variavel = Math.round((pct / 100) * producaoReal);
  const total = chosen.fixo + variavel;
  return {
    fixo: chosen.fixo,
    pct,
    variavel,
    total,
    tierIdx: chosenIdx,
    abaixoDoMinimo: producaoReal < ordenados[0].producao_min,
  };
}

// Quanto falta de produção (no papel principal) pro próximo tier, e quanto a
// comissão sobe no Fixo + variável desse mesmo papel.
export function proximoTier(tiers: Tier[], producaoReal: number, papel: Papel = "closer") {
  if (!tiers || tiers.length === 0) return null;
  const ordenados = [...tiers].sort((a, b) => a.producao_min - b.producao_min);
  const atual = lookupComissao(ordenados, producaoReal, papel);
  if (!atual) return null;
  const proximo = ordenados[atual.tierIdx + 1];
  if (!proximo) return null;
  const pct = papel === "sdr" ? proximo.pct_sdr : papel === "gestao" ? proximo.pct_gestao : proximo.pct_closer;
  const variavelNoProximo = Math.round((pct / 100) * proximo.producao_min);
  const totalNoProximo = proximo.fixo + variavelNoProximo;
  return {
    faltaProducao: proximo.producao_min - producaoReal,
    ganhoTotal: totalNoProximo - atual.total,
    proximoLimite: proximo.producao_min,
  };
}

export type ParcelaRemuneracao = { producao: number; pct: number; variavel: number };

export type Remuneracao = {
  tierIdx: number;
  fixo: number;
  sdr: ParcelaRemuneracao;
  closer: ParcelaRemuneracao;
  gestao: ParcelaRemuneracao;
  total: number;
  abaixoDoMinimo: boolean;
};

// Cálculo real da remuneração do mês (usado em /comissao e na lateral) — UM
// tier só, escolhido pela produção do papel PRINCIPAL do cargo (SDR pra
// Legionário/Centurião, Closer pra Tribuno/Pretor, Gestão do time pra
// Legado/Diretor), e as 3 percentuais desse MESMO tier aplicadas cada uma
// sobre a produção do papel correspondente. Isso substitui o hack antigo de
// "cargo equivalente" (Tribuno usando a tabela de Legionário pra SDR): agora
// cada rank já tem as 3 colunas certas, então não tem mais tabela emprestada
// nem tier "fantasma" pro papel cruzado — só um Fixo por mês (do tier
// principal), e cada variável nasce da produção real daquele papel.
export function calcularRemuneracao(
  tiers: Tier[],
  producaoPrincipal: number,
  producoes: { sdr: number; closer: number; gestao: number }
): Remuneracao | null {
  if (!tiers || tiers.length === 0) return null;
  const ordenados = [...tiers].sort((a, b) => a.producao_min - b.producao_min);
  let chosenIdx = 0;
  ordenados.forEach((t, i) => {
    if (producaoPrincipal >= t.producao_min) chosenIdx = i;
  });
  const chosen = ordenados[chosenIdx];
  const parcela = (pct: number, producao: number): ParcelaRemuneracao => ({
    producao,
    pct,
    variavel: Math.round((pct / 100) * producao),
  });
  const sdr = parcela(chosen.pct_sdr, producoes.sdr);
  const closer = parcela(chosen.pct_closer, producoes.closer);
  const gestao = parcela(chosen.pct_gestao, producoes.gestao);
  return {
    tierIdx: chosenIdx,
    fixo: chosen.fixo,
    sdr,
    closer,
    gestao,
    total: chosen.fixo + sdr.variavel + closer.variavel + gestao.variavel,
    abaixoDoMinimo: producaoPrincipal < ordenados[0].producao_min,
  };
}
