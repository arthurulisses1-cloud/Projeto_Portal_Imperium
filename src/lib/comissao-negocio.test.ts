import { describe, expect, it } from "vitest";
import { comissaoDaVenda, dataPagamento, type VendaParaComissao } from "./comissao-negocio";

const base: VendaParaComissao = { id: "v", valor: 10000, canal: "outbound", closerId: "c", closerCargo: "executivo", indicadorId: null };
const ctx = { headId: "h", diretorId: "d" };
const soma = (l: { valor: number }[]) => l.reduce((s, x) => s + x.valor, 0);

describe("comissaoDaVenda", () => {
  it("Vorp outbound: closer 4% + SDR 3% + Diretor 3% (sem Head)", () => {
    const l = comissaoDaVenda("vorp", { ...base, indicadorId: "s" }, { headId: null, diretorId: "d" });
    expect(soma(l)).toBeCloseTo(1000);
    expect(l.find((x) => x.beneficiarioId === "d")?.valor).toBeCloseTo(300);
  });
  it("Vorp inbound 3/2/3 e indicação paga como inbound", () => {
    const l = comissaoDaVenda("vorp", { ...base, canal: "indicacao", indicadorId: "s" }, { headId: null, diretorId: "d" });
    expect(soma(l)).toBeCloseTo(800);
  });
  it("Vorp com Head: 1% Head e 2% Diretor", () => {
    const l = comissaoDaVenda("vorp", base, ctx);
    expect(l.find((x) => x.beneficiarioId === "h")?.pct).toBe(1);
    expect(l.find((x) => x.beneficiarioId === "d")?.pct).toBe(2);
  });
  it("Finance: executivo 10 + head 10 + diretor 5", () => {
    expect(soma(comissaoDaVenda("vorp-finance", base, ctx))).toBeCloseTo(2500);
  });
  it("Finance com Head vendendo: 15 para ele e 10 para o Diretor", () => {
    const l = comissaoDaVenda("vorp-finance", { ...base, closerId: "h", closerCargo: "head" }, ctx);
    expect(l.map((x) => [x.beneficiarioId, x.pct])).toEqual([["h", 15], ["d", 10]]);
  });
  it("MatchSales outbound 10 + líder 2; inbound 8 + 2; com BDR 5/5/2", () => {
    expect(soma(comissaoDaVenda("matchsales", base, ctx))).toBeCloseTo(1200);
    expect(soma(comissaoDaVenda("matchsales", { ...base, canal: "inbound" }, ctx))).toBeCloseTo(1000);
    const l = comissaoDaVenda("matchsales", { ...base, indicadorId: "b" }, ctx);
    expect(l.find((x) => x.papel === "bdr")?.pct).toBe(5);
    expect(l.find((x) => x.papel === "closer")?.pct).toBe(5);
    expect(l.find((x) => x.papel === "head")?.pct).toBe(2);
  });
  it("Energy: executivo 30 + head 5 + diretor 5", () => {
    expect(soma(comissaoDaVenda("vorp-energy", base, ctx))).toBeCloseTo(4000);
  });
  it("Energy: head vendendo ganha 35, diretor vendendo ganha 40", () => {
    const h = comissaoDaVenda("vorp-energy", { ...base, closerId: "h", closerCargo: "head" }, ctx);
    expect(h.filter((x) => x.beneficiarioId === "h").reduce((a, x) => a + x.pct, 0)).toBe(35);
    const d = comissaoDaVenda("vorp-energy", { ...base, closerId: "d", closerCargo: "outro" }, ctx);
    expect(d.filter((x) => x.beneficiarioId === "d").reduce((a, x) => a + x.pct, 0)).toBe(40);
  });
  it("Energy recorrência: 30% executivo + 25% lideranças (Head e Diretor), 45% fica com a Vorp", () => {
    const l = comissaoDaVenda("vorp-energy", { ...base, recorrencia: true }, ctx);
    expect(soma(l)).toBeCloseTo(5500);
    expect(l.find((x) => x.beneficiarioId === "c")?.valor).toBeCloseTo(3000);
    expect(l.find((x) => x.beneficiarioId === "h")?.valor).toBeCloseTo(1250);
    expect(l.find((x) => x.beneficiarioId === "d")?.valor).toBeCloseTo(1250);
  });
  it("Energy recorrência: Diretor vendendo leva 30% + as duas partes de liderança", () => {
    const l = comissaoDaVenda("vorp-energy", { ...base, closerId: "d", recorrencia: true }, ctx);
    expect(l.filter((x) => x.beneficiarioId === "d").reduce((a, x) => a + x.pct, 0)).toBe(55);
  });
  it("Vorp: valor antecipado limita a base a 3 x MRR", () => {
    const v = { ...base, valor: 36000, mrr: 3000, valorAntecipado: 36000 };
    const l = comissaoDaVenda("vorp", v, { headId: null, diretorId: "d" });
    expect(l.find((x) => x.papel === "closer")?.base).toBe(9000);
    expect(l.find((x) => x.papel === "closer")?.valor).toBeCloseTo(360);
  });
  it("Vorp: contrato que não é o primeiro não paga comissão", () => {
    expect(comissaoDaVenda("vorp", { ...base, primeiroContrato: false }, ctx)).toEqual([]);
  });
});

describe("dataPagamento", () => {
  it("dia 15 do mês seguinte", () => {
    expect(dataPagamento("2026-11-20")).toBe("2026-12-15");
    expect(dataPagamento("2026-12-03")).toBe("2027-01-15");
  });
});
