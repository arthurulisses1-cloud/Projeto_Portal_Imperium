import { describe, expect, it } from "vitest";
import { custoDaPessoa, fixoDoMes, montarDre } from "./dre-negocios";
import type { ComissaoNegocio } from "./comissao-negocio";

const neg = (slug: string, recebido: number, totalComissao: number): ComissaoNegocio => ({
  slug,
  nome: slug,
  equipeNome: null,
  temRegra: true,
  recebido,
  totalComissao,
  pessoas: [],
  pagamento: "",
});

describe("bônus de conduta no custo", () => {
  it("o bônus aplicado e o pendente entram no custo; o não aplicado, não", () => {
    expect(custoDaPessoa({ nome: "A", cargo: "sdr", fixo: 2300, bonus: 200, bonusEstado: "aplicado" })).toBe(2500);
    expect(custoDaPessoa({ nome: "A", cargo: "sdr", fixo: 2300, bonus: 200, bonusEstado: "pendente" })).toBe(2500);
    expect(custoDaPessoa({ nome: "A", cargo: "sdr", fixo: 2300, bonus: 200, bonusEstado: "nao" })).toBe(2300);
    expect(custoDaPessoa({ nome: "B", cargo: "head", fixo: 4000 })).toBe(4000);
  });
  it("a DRE soma fixo base mais bônus", () => {
    const { negocios } = montarDre([neg("a", 10000, 0)], new Map([["a", [{ nome: "X", cargo: "sdr", fixo: 1800, bonus: 200, bonusEstado: "aplicado" as const }, { nome: "Y", cargo: "sdr", fixo: 1800, bonus: 200, bonusEstado: "nao" as const }]]]), 0);
    expect(negocios[0].totalFixos).toBe(2000 + 1800);
  });
});

describe("fixoDoMes", () => {
  it("usa a exceção do mês e o fixo mensal nos demais", () => {
    expect(fixoDoMes(4000, { "2026-11": 2000 }, 2026, 11)).toBe(2000);
    expect(fixoDoMes(4000, { "2026-11": 2000 }, 2026, 12)).toBe(4000);
    expect(fixoDoMes(4000, null, 2026, 11)).toBe(4000);
  });
});

describe("montarDre", () => {
  const fixos = new Map([
    ["a", [{ nome: "X", cargo: "head", fixo: 3000 }]],
    ["b", [{ nome: "Y", cargo: "closer", fixo: 1000 }, { nome: "Z", cargo: "sdr", fixo: 500 }]],
  ]);
  const { negocios, total } = montarDre([neg("a", 20000, 4000), neg("b", 10000, 1000)], fixos, 10000);
  it("rateia o custo do Diretor igualmente e calcula resultado por negócio", () => {
    expect(negocios[0].custoDiretor).toBe(5000);
    expect(negocios[0].margemContribuicao).toBe(16000);
    expect(negocios[0].resultado).toBe(16000 - 3000 - 5000);
    expect(negocios[1].totalFixos).toBe(1500);
    expect(negocios[1].resultado).toBe(9000 - 1500 - 5000);
  });
  it("o total fecha com a soma dos negócios", () => {
    expect(total.receita).toBe(30000);
    expect(total.custoDiretor).toBe(10000);
    expect(total.resultado).toBe(total.margemContribuicao - total.totalFixos - 10000);
    expect(total.resultado).toBe(negocios[0].resultado + negocios[1].resultado);
  });
  it("sem negócios, nada de custo", () => {
    expect(montarDre([], new Map()).total.resultado).toBe(0);
  });
});
