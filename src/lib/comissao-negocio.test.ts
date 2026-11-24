import { describe, expect, it } from "vitest";
import { canalComissaoMatch, comissaoDaVenda, dataPagamento, ehFundoMatri, MATCH_ETAPA_GANHO_OUTBOUND, type VendaParaComissao } from "./comissao-negocio";

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
  it("Finance sem valor pago ao cliente (venda antiga): 25% do recebido, sem deságio", () => {
    expect(soma(comissaoDaVenda("vorp-finance", base, ctx))).toBeCloseTo(2500);
  });
  it("Finance: margem de 6% do pago ao cliente, 25% dela em 10/10/5; sem deságio quando a comissão é igual à margem", () => {
    // pago ao cliente 100.000 -> margem 6.000; comissão recebida 6.000
    const l = comissaoDaVenda("vorp-finance", { ...base, valor: 6000, valorCliente: 100000 }, ctx);
    expect(l.every((x) => x.tipo === "base")).toBe(true);
    expect(l.find((x) => x.beneficiarioId === "c")?.valor).toBeCloseTo(600);
    expect(l.find((x) => x.beneficiarioId === "h")?.valor).toBeCloseTo(600);
    expect(l.find((x) => x.beneficiarioId === "d")?.valor).toBeCloseTo(300);
  });
  it("Finance: o excedente sobre a margem é deságio, 20/15/15 com executivo", () => {
    // margem 6.000; comissão recebida 10.000 -> deságio 4.000
    const l = comissaoDaVenda("vorp-finance", { ...base, valor: 10000, valorCliente: 100000 }, ctx);
    const d = l.filter((x) => x.tipo === "desagio");
    expect(d.find((x) => x.beneficiarioId === "c")?.valor).toBeCloseTo(800);
    expect(d.find((x) => x.beneficiarioId === "h")?.valor).toBeCloseTo(600);
    expect(d.find((x) => x.beneficiarioId === "d")?.valor).toBeCloseTo(600);
    expect(soma(l)).toBeCloseTo(1500 + 2000);
  });
  it("Finance com líder vendendo: base 15/10 e deságio 20/20", () => {
    const v = { ...base, valor: 10000, valorCliente: 100000, closerId: "h", closerCargo: "head" };
    const l = comissaoDaVenda("vorp-finance", v, ctx);
    expect(l.filter((x) => x.tipo === "base").map((x) => [x.beneficiarioId, x.pct])).toEqual([["h", 15], ["d", 10]]);
    expect(l.filter((x) => x.tipo === "desagio").map((x) => [x.beneficiarioId, x.pct, x.valor])).toEqual([["h", 20, 800], ["d", 20, 800]]);
  });
  it("Finance: comissão menor que a margem não gera deságio", () => {
    const l = comissaoDaVenda("vorp-finance", { ...base, valor: 5000, valorCliente: 100000 }, ctx);
    expect(l.some((x) => x.tipo === "desagio")).toBe(false);
  });
  it("Finance com participante de outra BU: a parte da liderança (15% da margem) é dividida em 3", () => {
    // margem 4.260 (sem deságio): executivo 10% = 426; liderança 15% = 639 -> 213 para Head, Diretor e o participante
    const v = { ...base, valor: 4260, valorCliente: 71000, closerId: "c", indicadorId: "p" };
    const l = comissaoDaVenda("vorp-finance", v, { ...ctx, membrosIds: new Set(["c", "h"]) });
    expect(l.find((x) => x.beneficiarioId === "c")?.valor).toBeCloseTo(426);
    expect(l.find((x) => x.beneficiarioId === "p")?.valor).toBeCloseTo(213);
    expect(l.find((x) => x.beneficiarioId === "h")?.valor).toBeCloseTo(213);
    expect(l.find((x) => x.beneficiarioId === "d")?.valor).toBeCloseTo(213);
    expect(soma(l)).toBeCloseTo(426 + 639);
  });
  it("Finance: o deságio também divide a liderança em 3 com participante de outra BU", () => {
    // margem 6.000, comissão 10.000 -> deságio 4.000: executivo 20% = 800; liderança 30% = 1.200 -> 400 cada
    const v = { ...base, valor: 10000, valorCliente: 100000, closerId: "c", indicadorId: "p" };
    const l = comissaoDaVenda("vorp-finance", v, { ...ctx, membrosIds: new Set(["c", "h"]) });
    const d = l.filter((x) => x.tipo === "desagio");
    expect(d.find((x) => x.beneficiarioId === "c")?.valor).toBeCloseTo(800);
    for (const id of ["p", "h", "d"]) expect(d.find((x) => x.beneficiarioId === id)?.valor).toBeCloseTo(400);
  });
  it("Finance: SDR do próprio time não divide a liderança", () => {
    const v = { ...base, valor: 6000, valorCliente: 100000, closerId: "c", indicadorId: "s" };
    const l = comissaoDaVenda("vorp-finance", v, { ...ctx, membrosIds: new Set(["c", "h", "s"]) });
    expect(l.find((x) => x.beneficiarioId === "s")).toBeUndefined();
    expect(l.find((x) => x.beneficiarioId === "h")?.valor).toBeCloseTo(600);
  });
  it("MatchSales outbound 10 + líder 2; inbound 8 + 2; com BDR 5/5/2", () => {
    expect(soma(comissaoDaVenda("matchsales", base, ctx))).toBeCloseTo(1200);
    expect(soma(comissaoDaVenda("matchsales", { ...base, canal: "inbound" }, ctx))).toBeCloseTo(1000);
    const l = comissaoDaVenda("matchsales", { ...base, indicadorId: "b" }, ctx);
    expect(l.find((x) => x.papel === "bdr")?.pct).toBe(5);
    expect(l.find((x) => x.papel === "closer")?.pct).toBe(5);
    expect(l.find((x) => x.papel === "head")?.pct).toBe(2);
  });
  it("Match em dupla: cada um pela própria taxa, dividida por dois (10% e 8% viram 5 e 4)", () => {
    const comSoares = { headId: "h", diretorId: "d", comissao10Sempre: new Set(["soares"]) };
    // Soares (10 sempre) + Leonardo no inbound (8): 5% e 4%
    const l = comissaoDaVenda("matchsales", { ...base, canal: "inbound", closerId: "soares", coCloserId: "leo" }, comSoares);
    expect(l.find((x) => x.beneficiarioId === "soares")?.pct).toBe(5);
    expect(l.find((x) => x.beneficiarioId === "leo")?.pct).toBe(4);
    // dois de 8% = 4/4; dois de 10% = 5/5
    const dois8 = comissaoDaVenda("matchsales", { ...base, canal: "inbound", closerId: "a", coCloserId: "b" }, ctx);
    expect(dois8.filter((x) => x.papel === "closer").map((x) => x.pct)).toEqual([4, 4]);
    const dois10 = comissaoDaVenda("matchsales", { ...base, closerId: "a", coCloserId: "b" }, ctx);
    expect(dois10.filter((x) => x.papel === "closer").map((x) => x.pct)).toEqual([5, 5]);
  });
  it("Match, gestão de 2%: Head fora da venda leva 2; sozinho, os 2 vão para o Diretor; na dupla, 1 para cada", () => {
    const fora = comissaoDaVenda("matchsales", { ...base, closerId: "a" }, ctx);
    expect(fora.filter((x) => x.papel === "head" || x.papel === "diretor").map((x) => [x.beneficiarioId, x.pct])).toEqual([["h", 2]]);
    const sozinho = comissaoDaVenda("matchsales", { ...base, canal: "inbound", closerId: "h", closerCargo: "head" }, ctx);
    expect(sozinho.find((x) => x.papel === "closer")?.pct).toBe(8);
    expect(sozinho.filter((x) => x.papel === "head" || x.papel === "diretor").map((x) => [x.beneficiarioId, x.pct])).toEqual([["d", 2]]);
    const co = comissaoDaVenda("matchsales", { ...base, canal: "inbound", closerId: "a", coCloserId: "h" }, ctx);
    expect(co.filter((x) => x.beneficiarioId === "h").map((x) => [x.papel, x.pct])).toEqual([["closer", 4], ["head", 1]]);
    expect(co.filter((x) => x.beneficiarioId === "d").map((x) => [x.papel, x.pct])).toEqual([["diretor", 1]]);
  });
  it("Match: venda ganha no funil Outbound comissiona como outbound mesmo com Canal tráfego (dupla 5/5)", () => {
    const canal = canalComissaoMatch("inbound", MATCH_ETAPA_GANHO_OUTBOUND);
    expect(canal).toBe("outbound");
    expect(canalComissaoMatch("inbound", "8c448cb1-7c1a-4244-bb64-690a70f453d0")).toBe("inbound");
    const l = comissaoDaVenda("matchsales", { ...base, canal, closerId: "leo", coCloserId: "soares" }, { headId: "h", diretorId: "d", comissao10Sempre: new Set(["soares"]) });
    expect(l.filter((x) => x.papel === "closer").map((x) => x.pct)).toEqual([5, 5]);
  });
  it("Match: Soares sozinho recebe 10% até no inbound; os demais seguem 8%", () => {
    const comSoares = { headId: "h", diretorId: "d", comissao10Sempre: new Set(["soares"]) };
    expect(comissaoDaVenda("matchsales", { ...base, canal: "inbound", closerId: "soares" }, comSoares).find((x) => x.papel === "closer")?.pct).toBe(10);
    expect(comissaoDaVenda("matchsales", { ...base, canal: "inbound", closerId: "leo" }, comSoares).find((x) => x.papel === "closer")?.pct).toBe(8);
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

describe("Finance, fundo do Matri (sem comissão para o Head)", () => {
  const venda = { ...base, valor: 6000, valorCliente: 100000, fundoMatri: { sdrId: "s", closerId: "k" } };
  it("SDR 10%, closer 10% e Diretor 5% da margem; o Head não recebe", () => {
    const l = comissaoDaVenda("vorp-finance", venda, ctx);
    expect(l.find((x) => x.beneficiarioId === "s")?.valor).toBeCloseTo(600);
    expect(l.find((x) => x.beneficiarioId === "k")?.valor).toBeCloseTo(600);
    expect(l.find((x) => x.beneficiarioId === "d")?.valor).toBeCloseTo(300);
    expect(l.some((x) => x.beneficiarioId === "h")).toBe(false);
    expect(soma(l)).toBeCloseTo(1500);
  });
  it("quando SDR e closer são a mesma pessoa, ela leva as duas partes (20%)", () => {
    const l = comissaoDaVenda("vorp-finance", { ...venda, fundoMatri: { sdrId: "k", closerId: "k" } }, ctx);
    expect(l.filter((x) => x.beneficiarioId === "k").reduce((s, x) => s + x.valor, 0)).toBeCloseTo(1200);
  });
  it("reconhece o fundo do Matri, inclusive o novo do Subido", () => {
    expect(ehFundoMatri("Matri", null, null)).toBe(true);
    expect(ehFundoMatri("Addebtare", false, "Matri")).toBe(true);
    expect(ehFundoMatri("Matri", false, "Adianta jus")).toBe(false);
    expect(ehFundoMatri("Addebtare", null, null)).toBe(false);
  });
});
