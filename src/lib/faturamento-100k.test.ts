import { describe, expect, it } from "vitest";
import { faixasAcima100k, pctAcima100k, resumirAcima100k } from "./faturamento-100k";

const F = faixasAcima100k("vorp");

describe("faturamento acima de 100 mil", () => {
  it("só a Acrópole tem as faixas, de 100 mil para cima", () => {
    expect(F).toContain("entre_100_e_200_mil");
    expect(F).toContain("acima_de_50_milhoes");
    expect(F).not.toContain("entre_30_e_100_mil");
    expect(F).not.toContain("ate_30_mil");
    expect(faixasAcima100k("matchsales")).toBeNull();
  });

  it("conta as faixas acima de 100 mil e separa os sem faturamento", () => {
    const r = resumirAcima100k(
      [
        { faturamento: "entre_100_e_200_mil" },
        { faturamento: "entre_1_e_5_milhoes" },
        { faturamento: "entre_30_e_100_mil" },
        { faturamento: "ate_30_mil" },
        { faturamento: null },
        { faturamento: "acima_de_50_milhoes" },
        { faturamento: "entre_400_mil_e_1_milhao" },
        { faturamento: null },
      ],
      F,
    );
    expect(r).toEqual({ qtd: 4, total: 8, pct: 0.5, semFaturamento: 2 });
    expect(pctAcima100k(r!)).toBe("50%");
  });

  it("não mostra nada sem faixas, sem leads ou com lista gravada antes do campo", () => {
    expect(resumirAcima100k([{ faturamento: "entre_100_e_200_mil" }], null)).toBeNull();
    expect(resumirAcima100k([], F)).toBeNull();
    expect(resumirAcima100k(undefined, F)).toBeNull();
    expect(resumirAcima100k([{ faturamento: "entre_100_e_200_mil" }, {}], F)).toBeNull();
  });

  it("porcentagem com uma casa", () => {
    expect(pctAcima100k({ qtd: 3, total: 8, pct: 3 / 8, semFaturamento: 0 })).toBe("37,5%");
  });
});
