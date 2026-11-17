import { describe, expect, it } from "vitest";
import { casarLeads, codigo, ehOMesmoLead, identidadeDe, normalizarTelefone, tokensDoNome } from "./identidade";

describe("normalizarTelefone", () => {
  it("tira máscara e DDI e exige DDD + número", () => {
    expect(normalizarTelefone("(85) 99999-0000")).toBe("85999990000");
    expect(normalizarTelefone("+55 85 99999-0000")).toBe("85999990000");
    expect(normalizarTelefone("5585999990000")).toBe("85999990000");
    expect(normalizarTelefone("999990000")).toBeNull();
    expect(normalizarTelefone(null)).toBeNull();
    expect(normalizarTelefone(85999990000)).toBe("85999990000");
  });
});

describe("tokensDoNome", () => {
  it("normaliza acento e caixa e ignora ligações", () => {
    expect(tokensDoNome("José da Silva  DOS Santos")).toEqual(["jose", "silva", "santos"]);
    expect(tokensDoNome(undefined)).toEqual([]);
  });
});

describe("casarLeads", () => {
  const a = identidadeDe("(85) 99999-0000", "José da Silva");
  it("telefone e nome iguais: forte", () => {
    expect(casarLeads(a, identidadeDe("+5585999990000", "JOSE SILVA SANTOS"))).toBe("forte");
  });
  it("telefone igual e uma palavra do nome: provável (conta como o mesmo)", () => {
    const c = casarLeads(a, identidadeDe("85999990000", "Jose Pereira"));
    expect(c).toBe("provavel");
    expect(ehOMesmoLead(c)).toBe(true);
  });
  it("telefone igual com nome totalmente diferente: só telefone (não conta)", () => {
    const c = casarLeads(a, identidadeDe("85999990000", "Maria Souza"));
    expect(c).toBe("so_telefone");
    expect(ehOMesmoLead(c)).toBe(false);
  });
  it("telefone diferente ou ausente: não casa, mesmo com nome igual", () => {
    expect(casarLeads(a, identidadeDe("85988887777", "José da Silva"))).toBeNull();
    expect(casarLeads(a, identidadeDe(null, "José da Silva"))).toBeNull();
  });
  it("só guarda códigos, nunca o telefone ou o nome", () => {
    const j = JSON.stringify(a);
    expect(j).not.toContain("85999990000");
    expect(j).not.toContain("jose");
    expect(codigo("x")).toHaveLength(32);
  });
});
