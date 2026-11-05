import { describe, expect, it } from "vitest";
import { indiceMes, metaForecast, PARAMETROS, vendasDoMes } from "./forecast-negocios";

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
  it("recorrência faz dezembro maior que novembro (Vorp)", () => {
    expect(metaForecast("vorp", 2026, 12)).toBeGreaterThan(metaForecast("vorp", 2026, 11));
  });
});
