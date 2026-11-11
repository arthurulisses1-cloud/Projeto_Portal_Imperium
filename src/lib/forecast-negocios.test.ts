import { describe, expect, it } from "vitest";
import { indiceMes, metaForecast, metaMrrForecast, metaKwhForecast, PARAMETROS, vendasDoMes } from "./forecast-negocios";

describe("forecast por negócio", () => {
  it("novembro/2026 é o mês 0 e antes dele não há meta", () => {
    expect(indiceMes(2026, 11)).toBe(0);
    expect(metaForecast("vorp", 2026, 10)).toBe(0);
  });
  it("Matri e slugs sem forecast ficam em zero", () => {
    expect(metaForecast("matri", 2026, 11)).toBe(0);
  });
  it("ramp-up de 50% em novembro reduz as vendas à metade", () => {
    const p = PARAMETROS.matchsales;
    expect(vendasDoMes(p, 0).total).toBeCloseTo(vendasDoMes(p, 1).total / 2);
  });
  it("recorrência faz dezembro maior que novembro (MatchSales)", () => {
    expect(metaForecast("matchsales", 2026, 12)).toBeGreaterThan(metaForecast("matchsales", 2026, 11));
  });
  it("Energy: novembro = 62.192 (1ª conta do outbound + referidos; inbound cai em dezembro)", () => {
    expect(Math.round(metaForecast("vorp-energy", 2026, 11))).toBe(62192);
  });
  it("Energy: meta de kWh de novembro = 120.000; demais meses seguem o forecast", () => {
    expect(metaKwhForecast("vorp-energy", 2026, 11)).toBe(120000);
    expect(metaKwhForecast("vorp-energy", 2026, 12)).toBeGreaterThan(120000);
    expect(metaKwhForecast("vorp", 2026, 11)).toBe(0);
  });
  it("Vorp: meta de recebido fixa em R$ 100 mil só em novembro e a de MRR segue o forecast", () => {
    expect(metaForecast("vorp", 2026, 11)).toBe(100000);
    expect(metaForecast("vorp", 2026, 12)).not.toBe(100000);
    expect(metaMrrForecast("vorp", 2026, 12)).toBeGreaterThan(metaMrrForecast("vorp", 2026, 11));
  });
});
