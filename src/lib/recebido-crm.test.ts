import { describe, expect, it } from "vitest";
import { consolidarGanhosEnergy, type GanhoCrm } from "./recebido-crm";
import { pctVorpPrimeiraFatura, primeiraFaturaSunne } from "./energy-canais";
import type { SunneDeal } from "./sunne";

const deal = (id: string, extra: Partial<SunneDeal>): SunneDeal => ({
  id,
  organizationId: "org-a",
  product: "gd",
  funnel: "connection",
  stage: "x",
  stageKey: "send_to_plant",
  isClosed: true,
  isLost: false,
  createdAt: "2026-11-02T12:00:00Z",
  closedAt: "2026-11-10T15:00:00Z",
  averageConsumption: 500,
  compensableKwh: 450,
  referenceValue: 247.5,
  ...extra,
});
const ganhoPipefacil = (id: string, valor: number): GanhoCrm => ({ id, negocio_id: "n", data: "2026-11-16", valor, cliente: null, canal: "outbound" });

describe("primeira fatura e fatia da Vorp", () => {
  it("usa o valor da Sunne; sem ele, kWh compensáveis x R$ 0,55", () => {
    expect(primeiraFaturaSunne(deal("a", {}))).toBe(247.5);
    expect(primeiraFaturaSunne(deal("a", { referenceValue: null }))).toBeCloseTo(450 * 0.55);
    expect(primeiraFaturaSunne(deal("a", { referenceValue: null, compensableKwh: null }))).toBeCloseTo(500 * 0.55);
  });
  it("80% até 80 mil kWh no mês; acima, 100%", () => {
    expect(pctVorpPrimeiraFatura(7500)).toBe(0.8);
    expect(pctVorpPrimeiraFatura(80000)).toBe(0.8);
    expect(pctVorpPrimeiraFatura(80001)).toBe(1);
  });
});

describe("consolidarGanhosEnergy", () => {
  const deals = [
    deal("s1", {}),
    deal("s2", { referenceValue: 100, closedAt: "2026-11-20T15:00:00Z" }),
    deal("s3", { closedAt: "2026-10-30T15:00:00Z" }), // outro mês
    deal("s4", { isClosed: false, funnel: "sales", stageKey: "validation" }), // não fechado
    deal("s5", { isLost: true }), // perdido
    deal("s6", { product: "alugsol" }), // outro produto
  ];

  it("a Vorp recebe 80% da primeira fatura de cada venda fechada na Sunne no mês", () => {
    const r = consolidarGanhosEnergy(deals, [], null, "n", "2026-11-01", "2026-12-01");
    expect(r.map((g) => g.id)).toEqual(["s2", "s1"]);
    expect(r.map((g) => g.valor)).toEqual([80, 198]);
  });

  it("soma os ganhos do Pipefácil só quando já dá para saber que não estão na Sunne", () => {
    const pf = [ganhoPipefacil("p1", 150), ganhoPipefacil("p2", 200)];
    const semCasamento = consolidarGanhosEnergy(deals, pf, null, "n", "2026-11-01", "2026-12-01");
    expect(semCasamento).toHaveLength(2); // sem telefone para casar: Pipefácil fora, nada em dobro
    const comCasamento = consolidarGanhosEnergy(deals, pf, new Set(["p1"]), "n", "2026-11-01", "2026-12-01");
    expect(comCasamento.map((g) => g.id).sort()).toEqual(["p2", "s1", "s2"]);
    expect(comCasamento.find((g) => g.id === "p2")?.valor).toBe(160);
  });
});
