// Forecast por negócio: a meta de recebimento deixa de ser digitada à mão e passa
// a sair do funil + modelo de receita de cada negócio (artefato de forecast do
// Diretor, nov/2026). Tudo aqui é parâmetro: ajustar uma taxa é mudar um número.
//
// Premissas (documentadas para o Diretor conferir):
//  - mês 0 = novembro/2026; o volume do funil é multiplicado pelo ramp-up do mês;
//  - recorrência: a venda do mês j paga a mensalidade já no mês j e segue com
//    sobrevivência (1 - churn)^(meses desde a venda);
//  - indicações (referidos) = vendas diretas do mês × leads por venda × reunião
//    realizada × conversão em venda (sem efeito composto).

export type CanalFunil = { volume: number; taxas: number[] };

export type ParametrosForecast = {
  outbound?: CanalFunil;
  inbound?: CanalFunil;
  /** Indicações: leads gerados por venda direta e taxas [reunião realizada, venda]. */
  referidos?: { leadsPorVenda: number; taxas: [number, number] };
  churn: number;
};

const INICIO = { ano: 2026, mes: 11 };

/** Fator de produtividade por mês (ramp-up). Meses fora da tabela valem 1. */
export const RAMP_UP: Record<string, number> = { "2026-11": 0.5 };

export const PARAMETROS: Record<string, ParametrosForecast> = {
  vorp: {
    outbound: { volume: 3960, taxas: [0.15, 0.25, 0.65, 0.6, 0.2] },
    inbound: { volume: 220, taxas: [0.3, 0.8, 0.3, 0.7, 0.7, 0.3] },
    referidos: { leadsPorVenda: 2, taxas: [0.6, 0.2] },
    churn: 0.15,
  },
  "vorp-finance": {
    outbound: { volume: 3960, taxas: [0.15, 0.25, 0.7, 0.7, 0.2] },
    inbound: { volume: 220, taxas: [0.3, 0.8, 0.3, 0.7, 0.8, 0.3] },
    churn: 0,
  },
  matchsales: {
    outbound: { volume: 5280, taxas: [0.15, 0.25, 0.7, 0.7, 0.2] },
    inbound: { volume: 440, taxas: [0.3, 0.8, 0.3, 0.7, 0.8, 0.3] },
    referidos: { leadsPorVenda: 4, taxas: [0.7, 0.3] },
    churn: 0.1,
  },
  "vorp-energy": {
    outbound: { volume: 3960, taxas: [0.15, 0.25, 0.7, 0.7, 0.2] },
    inbound: { volume: 200, taxas: [0.3, 0.8, 0.3, 0.7, 0.8, 0.3] },
    churn: 0.05,
  },
};

// Modelo de receita
const VORP_TICKET_MENSAL = 8000;
const FINANCE_TICKET = 8000;
const MATCH_TICKET_MENSAL = 600;
const MATCH_SETUP = 2500;
// Energy: Sunne (geração) e Folha
const ENERGY_KWH_POR_VENDA = 10500;
const ENERGY_VALOR_KWH = 0.55;
const ENERGY_PRIMEIRA_CONTA = ENERGY_KWH_POR_VENDA * ENERGY_VALOR_KWH; // R$ 5.775
const ENERGY_LIMITE_KWH_MES = 80000; // até aqui paga 80% da 1ª conta; acima, 100%
const ENERGY_PCT_ATE_LIMITE = 0.8;
const ENERGY_RECORRENCIA_SUNNE = 0.045; // % da conta, a partir do 3º mês
const ENERGY_PCT_FOLHA = 0.3; // fatia das vendas que é Folha
const ENERGY_FOLHA_MENSAL = 50 * 6; // 50 colaboradores x R$ 6, a partir do 3º mês

function produto(volume: number, taxas: number[]): number {
  return taxas.reduce((acc, t) => acc * t, volume);
}

/** Meses desde o início do forecast (nov/2026 = 0). Negativo = antes do forecast. */
export function indiceMes(ano: number, mes: number): number {
  return (ano - INICIO.ano) * 12 + (mes - INICIO.mes);
}

function chaveMes(i: number): string {
  const total = INICIO.mes - 1 + i;
  const ano = INICIO.ano + Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

/** Vendas (fracionárias) previstas no mês i, já com ramp-up. */
export function vendasDoMes(p: ParametrosForecast, i: number): { outbound: number; inbound: number; referidos: number; total: number } {
  const ramp = RAMP_UP[chaveMes(i)] ?? 1;
  const outbound = p.outbound ? produto(p.outbound.volume, p.outbound.taxas) * ramp : 0;
  const inbound = p.inbound ? produto(p.inbound.volume, p.inbound.taxas) * ramp : 0;
  const diretas = outbound + inbound;
  const referidos = p.referidos ? diretas * p.referidos.leadsPorVenda * p.referidos.taxas[0] * p.referidos.taxas[1] : 0;
  return { outbound, inbound, referidos, total: diretas + referidos };
}

/** Metas de recebimento definidas pelo Diretor, que valem no lugar do forecast (a meta de MRR segue o forecast). */
export const META_RECEBIDO_FIXA: Record<string, number> = { vorp: 100000 };

/** Meta de recebimento (R$) do negócio no mês, ou 0 se não houver forecast. */
export function metaForecast(slug: string, ano: number, mes: number): number {
  const p = PARAMETROS[slug];
  const i = indiceMes(ano, mes);
  if (!p || i < 0) return 0;
  if (META_RECEBIDO_FIXA[slug]) return META_RECEBIDO_FIXA[slug];
  const vendas = Array.from({ length: i + 1 }, (_, j) => vendasDoMes(p, j).total);
  const sobrevive = (desde: number) => Math.pow(1 - p.churn, desde);

  if (slug === "vorp") {
    return vendas.reduce((s, v, j) => s + v * VORP_TICKET_MENSAL * sobrevive(i - j), 0);
  }
  if (slug === "matchsales") {
    return vendas.reduce((s, v, j) => s + (j === i ? v * MATCH_SETUP : 0) + v * MATCH_TICKET_MENSAL * sobrevive(i - j), 0);
  }
  if (slug === "vorp-finance") {
    return vendas[i] * FINANCE_TICKET;
  }
  if (slug === "vorp-energy") {
    let total = 0;
    for (let j = 0; j <= i; j++) {
      const sunne = vendas[j] * (1 - ENERGY_PCT_FOLHA);
      const folha = vendas[j] * ENERGY_PCT_FOLHA;
      if (j === i) {
        const pct = sunne * ENERGY_KWH_POR_VENDA <= ENERGY_LIMITE_KWH_MES ? ENERGY_PCT_ATE_LIMITE : 1;
        total += sunne * ENERGY_PRIMEIRA_CONTA * pct;
      }
      const idade = i - j;
      if (idade >= 2) {
        total += sunne * ENERGY_PRIMEIRA_CONTA * ENERGY_RECORRENCIA_SUNNE * sobrevive(idade);
        total += folha * ENERGY_FOLHA_MENSAL * sobrevive(idade);
      }
    }
    return total;
  }
  return 0;
}

/** Meta de MRR (R$) do mês — só Vorp e MatchSales têm contrato recorrente. É a parte recorrente da meta de recebimento (sem o setup). */
export function metaMrrForecast(slug: string, ano: number, mes: number): number {
  if (slug !== "vorp" && slug !== "matchsales") return 0;
  const p = PARAMETROS[slug];
  const i = indiceMes(ano, mes);
  if (!p || i < 0) return 0;
  const vendas = Array.from({ length: i + 1 }, (_, j) => vendasDoMes(p, j).total);
  const ticket = slug === "vorp" ? VORP_TICKET_MENSAL : MATCH_TICKET_MENSAL;
  return vendas.reduce((acc, v, j) => acc + v * ticket * Math.pow(1 - p.churn, i - j), 0);
}
