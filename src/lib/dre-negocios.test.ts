import { describe, expect, it } from "vitest";
import { montarDre } from "./dre-negocios";
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
