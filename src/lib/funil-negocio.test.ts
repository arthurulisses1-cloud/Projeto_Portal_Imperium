import { describe, expect, it } from "vitest";
import { funisDoMes } from "./funil-negocio";

describe("funisDoMes", () => {
  it("MatchSales e Energy têm 3 canais (com indicação); Finance tem 2", () => {
    expect(funisDoMes("matchsales", 2026, 12).map((f) => f.canal)).toEqual(["outbound", "inbound", "indicacao"]);
    expect(funisDoMes("vorp-finance", 2026, 12).map((f) => f.canal)).toEqual(["outbound", "inbound"]);
    expect(funisDoMes("vorp-energy", 2026, 12).map((f) => f.canal)).toEqual(["outbound", "inbound", "indicacao"]);
  });
  it("volume inicial e conversões do forecast (outbound MatchSales, mês cheio)", () => {
    const e = funisDoMes("matchsales", 2026, 12)[0].etapas;
    expect(e[0]).toMatchObject({ label: "Alôs", meta: 5280, conversaoMeta: null });
    expect(e[1].meta).toBeCloseTo(792);
    expect(e[e.length - 1].label).toBe("Vendas");
  });
  it("novembro aplica ramp-up de 50%", () => {
    expect(funisDoMes("vorp", 2026, 11)[0].etapas[0].meta).toBe(1980);
  });
  it("rótulos próprios: Finance com Entrevistas/Subidos, Energy com Contas subidas", () => {
    expect(funisDoMes("vorp-finance", 2026, 12)[0].etapas.map((x) => x.label)).toEqual(["Entrevistas", "Subidos", "Vendas"]);
    const fin = funisDoMes("vorp-finance", 2026, 12)[0].etapas;
    expect(fin[0].conversaoMeta).toBeNull();
    expect(fin[0].meta).toBeCloseTo(3960 * 0.15 * 0.25 * 0.7); // 104,0 entrevistas
    expect(fin[1].conversaoMeta).toBe(0.7);
    expect(fin[2].conversaoMeta).toBe(0.2);
    expect(funisDoMes("vorp-energy", 2026, 12)[1].etapas.map((x) => x.label)).toContain("Contas subidas");
  });
  it("sem forecast antes de novembro", () => {
    expect(funisDoMes("vorp", 2026, 10)).toEqual([]);
  });
});
