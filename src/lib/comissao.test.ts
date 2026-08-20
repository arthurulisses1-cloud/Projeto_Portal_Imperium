import { describe, expect, it } from "vitest";
import { calcularRemuneracao, lookupComissao, proximoTier, type Tier } from "./comissao";

// Tiers de Tribuno (Closer Jr) reais, ver supabase/migrations/0030_comissao_papeis.sql —
// %SDR flat 0.50, %Closer escalando 0.30→0.40, sem %Gestão.
const TIERS_TRIBUNO: Tier[] = [
  { producao_min: 300000, fixo: 2300, pct_sdr: 0.5, pct_closer: 0.3, pct_gestao: 0 },
  { producao_min: 450000, fixo: 2300, pct_sdr: 0.5, pct_closer: 0.3, pct_gestao: 0 },
  { producao_min: 600000, fixo: 2500, pct_sdr: 0.5, pct_closer: 0.3, pct_gestao: 0 },
  { producao_min: 900000, fixo: 2500, pct_sdr: 0.5, pct_closer: 0.35, pct_gestao: 0 },
  { producao_min: 1050000, fixo: 2800, pct_sdr: 0.5, pct_closer: 0.35, pct_gestao: 0 },
  { producao_min: 1200000, fixo: 2800, pct_sdr: 0.5, pct_closer: 0.4, pct_gestao: 0 },
  { producao_min: 1500000, fixo: 3200, pct_sdr: 0.5, pct_closer: 0.4, pct_gestao: 0 },
];

// Legado (Líder) — %SDR flat 0.60, %Closer flat 0.30, %Gestão escalando.
const TIERS_LEGADO: Tier[] = [
  { producao_min: 600000, fixo: 4000, pct_sdr: 0.6, pct_closer: 0.3, pct_gestao: 0.05 },
  { producao_min: 1000000, fixo: 4000, pct_sdr: 0.6, pct_closer: 0.3, pct_gestao: 0.2 },
];

describe("lookupComissao", () => {
  it("escolhe o tier certo pela produção e aplica a % do papel pedido", () => {
    const r = lookupComissao(TIERS_TRIBUNO, 950000, "closer");
    expect(r?.tierIdx).toBe(3); // tier 900k
    expect(r?.pct).toBe(0.35);
    expect(r?.variavel).toBe(Math.round(0.35 / 100 * 950000));
  });

  it("usa o tier mínimo (com abaixoDoMinimo=true) quando a produção não bate nenhum limiar", () => {
    const r = lookupComissao(TIERS_TRIBUNO, 100000, "closer");
    expect(r?.tierIdx).toBe(0);
    expect(r?.abaixoDoMinimo).toBe(true);
  });

  it("retorna null pra lista de tiers vazia", () => {
    expect(lookupComissao([], 500000)).toBeNull();
  });
});

describe("proximoTier", () => {
  it("calcula quanto falta e quanto ganha subindo de tier", () => {
    const p = proximoTier(TIERS_TRIBUNO, 300000, "closer");
    expect(p?.faltaProducao).toBe(150000); // até o tier 450k
    expect(p?.proximoLimite).toBe(450000);
  });

  it("retorna null no tier máximo (não tem próximo)", () => {
    const p = proximoTier(TIERS_TRIBUNO, 1600000, "closer");
    expect(p).toBeNull();
  });
});

describe("calcularRemuneracao", () => {
  it("aplica cada % sobre a produção do papel correspondente, no mesmo tier", () => {
    // Tribuno com 175.925 como Closer (papel principal) e 128.905 como SDR
    // — mesmo caso real do Leonardo Enzo em 2026-08.
    const r = calcularRemuneracao(TIERS_TRIBUNO, 175924.94, {
      sdr: 128905.35,
      closer: 175924.94,
      ambos: 0,
      gestao: 0,
    });
    expect(r?.tierIdx).toBe(0); // abaixo de 300k, cai no tier mínimo
    expect(r?.fixo).toBe(2300);
    expect(r?.sdr.pct).toBe(0.5);
    expect(r?.sdr.variavel).toBe(Math.round(0.5 / 100 * 128905.35));
    expect(r?.closer.pct).toBe(0.3);
    expect(r?.closer.variavel).toBe(Math.round(0.3 / 100 * 175924.94));
    expect(r?.total).toBe(r!.fixo + r!.sdr.variavel + r!.closer.variavel);
  });

  it("venda 'ambos' aplica só a MAIOR % (não soma SDR+Closer)", () => {
    // Legado: pct_sdr=0.60 >= pct_closer=0.30 nesse tier — a produção
    // "ambos" tem que ir inteira pro balde de SDR, não duplicar em ambos.
    const r = calcularRemuneracao(TIERS_LEGADO, 700000, {
      sdr: 0,
      closer: 0,
      ambos: 200000,
      gestao: 700000,
    });
    expect(r?.sdr.producao).toBe(200000);
    expect(r?.sdr.variavel).toBe(Math.round(0.6 / 100 * 200000));
    expect(r?.closer.producao).toBe(0);
    expect(r?.closer.variavel).toBe(0);
    // total não pode conter a % de closer sobre esses 200k também
    expect(r?.total).toBe(
      r!.fixo + r!.sdr.variavel + r!.closer.variavel + r!.gestao.variavel
    );
  });

  it("venda 'ambos' vai pro balde de Closer quando %Closer é maior nesse tier", () => {
    const tiersClosverMaior: Tier[] = [
      { producao_min: 0, fixo: 1000, pct_sdr: 0.2, pct_closer: 0.5, pct_gestao: 0 },
    ];
    const r = calcularRemuneracao(tiersClosverMaior, 100000, {
      sdr: 0,
      closer: 0,
      ambos: 100000,
      gestao: 0,
    });
    expect(r?.sdr.variavel).toBe(0);
    expect(r?.closer.producao).toBe(100000);
    expect(r?.closer.pct).toBe(0.5);
  });

  it("produção de gestão é remunerada pela % de gestão do tier escolhido pela própria gestão", () => {
    const r = calcularRemuneracao(TIERS_LEGADO, 1100000, {
      sdr: 0,
      closer: 0,
      ambos: 0,
      gestao: 1100000,
    });
    expect(r?.tierIdx).toBe(1); // tier de 1.000.000
    expect(r?.gestao.pct).toBe(0.2);
    expect(r?.gestao.variavel).toBe(Math.round(0.2 / 100 * 1100000));
  });

  it("retorna null pra lista de tiers vazia", () => {
    expect(calcularRemuneracao([], 100000, { sdr: 0, closer: 0, ambos: 0, gestao: 0 })).toBeNull();
  });
});
