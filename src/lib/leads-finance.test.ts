import { describe, expect, it } from "vitest";
import { canalDaOrigem, definirExecutivo, desagioFinance, nomeArquivoSeguro, parseValorBR, podeAprovarVenda, validarSubido, validarVenda } from "./leads-finance";

const ok = { valorPrecatorio: 100000, valorProposta: 60000, comissaoPrevista: 6000, mesmoFundo: true, fundoNovo: null };

describe("validarSubido", () => {
  it("aceita um subido completo", () => expect(validarSubido(ok)).toBeNull());
  it("exige os três valores e a proposta não pode passar do precatório", () => {
    expect(validarSubido({ ...ok, valorPrecatorio: 0 })).toMatch(/precatório/);
    expect(validarSubido({ ...ok, valorProposta: 0 })).toMatch(/proposta/);
    expect(validarSubido({ ...ok, valorProposta: 120000 })).toMatch(/maior/);
    expect(validarSubido({ ...ok, comissaoPrevista: 0 })).toMatch(/comissão/);
  });
  it("exige confirmar o fundo; se mudou, informar qual", () => {
    expect(validarSubido({ ...ok, mesmoFundo: null })).toMatch(/fundo/);
    expect(validarSubido({ ...ok, mesmoFundo: false })).toMatch(/fundo/);
    expect(validarSubido({ ...ok, mesmoFundo: false, fundoNovo: "Fundo B" })).toBeNull();
  });
});

describe("validarVenda", () => {
  it("valida valores e data", () => {
    expect(validarVenda({ valorRecebido: 6000, valorCliente: 60000, data: "2026-11-17" }, "2026-11-17")).toBeNull();
    expect(validarVenda({ valorRecebido: 0, valorCliente: 60000, data: "2026-11-17" }, "2026-11-17")).toMatch(/comissão/);
    expect(validarVenda({ valorRecebido: 6000, valorCliente: 0, data: "2026-11-17" }, "2026-11-17")).toMatch(/cliente/);
    expect(validarVenda({ valorRecebido: 6000, valorCliente: 60000, data: "2026-11-18" }, "2026-11-17")).toMatch(/Data/);
    expect(validarVenda({ valorRecebido: 6000, valorCliente: 60000, data: "17/11/2026" }, "2026-11-17")).toMatch(/Data/);
  });
});

describe("desagioFinance", () => {
  it("o que passa de 6% do desembolso é deságio", () => {
    expect(desagioFinance(100000, 10000)).toEqual({ pct: 6, margem: 6000, desagio: 4000 });
  });
  it("comissão igual ou abaixo de 6% não gera deságio", () => {
    expect(desagioFinance(100000, 6000).desagio).toBe(0);
    expect(desagioFinance(100000, 5000).desagio).toBe(0);
    expect(desagioFinance(0, 0)).toEqual({ pct: 6, margem: 0, desagio: 0 });
  });
});

describe("parseValorBR", () => {
  it("aceita 1.234,56 e 1234.56", () => {
    expect(parseValorBR("R$ 1.234,56")).toBeCloseTo(1234.56);
    expect(parseValorBR("1234.56")).toBeCloseTo(1234.56);
    expect(parseValorBR("abc")).toBe(0);
  });
});

describe("definirExecutivo", () => {
  const finance = new Set(["ikaro", "stefani"]);
  it("SDR do Finance e closer de outra BU: o executivo é o do Finance", () => {
    expect(definirExecutivo("ikaro", "rafael", finance)).toEqual({ executivoId: "ikaro", participanteId: "rafael" });
  });
  it("closer do Finance e SDR de outra BU: vale o closer", () => {
    expect(definirExecutivo("fernando", "ikaro", finance)).toEqual({ executivoId: "ikaro", participanteId: "fernando" });
  });
  it("os dois do Finance, ou nenhum: vale o closer", () => {
    expect(definirExecutivo("stefani", "ikaro", finance).executivoId).toBe("ikaro");
    expect(definirExecutivo("davi", "rafael", finance).executivoId).toBe("rafael");
  });
  it("sem SDR ou com a mesma pessoa nos dois campos", () => {
    expect(definirExecutivo(null, "ikaro", finance)).toEqual({ executivoId: "ikaro", participanteId: null });
    expect(definirExecutivo("ikaro", "ikaro", finance)).toEqual({ executivoId: "ikaro", participanteId: null });
  });
});

describe("canalDaOrigem", () => {
  it("mapeia a origem da planilha", () => {
    expect(canalDaOrigem("Inbound")).toBe("inbound");
    expect(canalDaOrigem("INDICAÇÃO")).toBe("indicacao");
    expect(canalDaOrigem("Parceiros")).toBe("indicacao");
    expect(canalDaOrigem("Disparo")).toBe("outbound");
    expect(canalDaOrigem(null)).toBe("outbound");
  });
});

describe("aprovação e arquivo", () => {
  it("só Diretor ou Head do negócio aprovam", () => {
    expect(podeAprovarVenda({ diretor: true, headDoNegocio: false })).toBe(true);
    expect(podeAprovarVenda({ diretor: false, headDoNegocio: true })).toBe(true);
    expect(podeAprovarVenda({ diretor: false, headDoNegocio: false })).toBe(false);
  });
  it("nome de arquivo sem acento nem espaço", () => {
    expect(nomeArquivoSeguro("Proposta João (final).pdf")).toBe("Proposta_Joao_final_.pdf");
    expect(nomeArquivoSeguro("???")).toBe("anexo");
  });
});
