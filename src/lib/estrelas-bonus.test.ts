import { describe, expect, it } from "vitest";
import { calcularBonusMensal, competenciaAnterior } from "./estrelas-bonus";

describe("calcularBonusMensal", () => {
  it("premia meta batida, melhor SDR e melhor Closer", () => {
    const r = calcularBonusMensal([
      { id: "s1", role: "sdr", credito: 300000, meta: 250000 },
      { id: "s2", role: "sdr", credito: 120000, meta: 250000 },
      { id: "c1", role: "closer", credito: 400000, meta: 500000 },
      { id: "c2", role: "closer", credito: 200000, meta: 150000 },
    ]);
    const tipos = (id: string) => r.filter((b) => b.profileId === id).map((b) => b.tipo).sort();
    expect(tipos("s1")).toEqual(["melhor_sdr", "meta_individual"]);
    expect(tipos("s2")).toEqual([]);
    expect(tipos("c1")).toEqual(["melhor_closer"]);
    expect(tipos("c2")).toEqual(["meta_individual"]);
  });

  it("crédito zero nunca premia e sem meta não conta como meta batida", () => {
    const r = calcularBonusMensal([
      { id: "s1", role: "sdr", credito: 0, meta: 0 },
      { id: "c1", role: "closer", credito: 0, meta: 100000 },
    ]);
    expect(r).toEqual([]);
  });

  it("empate no topo premia todos os empatados", () => {
    const r = calcularBonusMensal([
      { id: "s1", role: "sdr", credito: 100000, meta: 0 },
      { id: "s2", role: "sdr", credito: 100000, meta: 0 },
    ]);
    expect(r.filter((b) => b.tipo === "melhor_sdr").map((b) => b.profileId).sort()).toEqual(["s1", "s2"]);
  });
});

describe("competenciaAnterior", () => {
  it("devolve o mês anterior, inclusive na virada de ano", () => {
    expect(competenciaAnterior("2026-11-03")).toMatchObject({ inicio: "2026-10-01", fim: "2026-10-31", chave: "2026-10" });
    expect(competenciaAnterior("2027-01-05")).toMatchObject({ inicio: "2026-12-01", fim: "2026-12-31" });
  });
});
