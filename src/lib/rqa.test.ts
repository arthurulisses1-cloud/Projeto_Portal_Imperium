import { describe, expect, it } from "vitest";
import { bantPreenchidos, pagamentoDoMes, resumirRqa, situacaoDaRqa, type ValidacaoGerente } from "./rqa";

const l = (p: Record<string, unknown>) =>
  ({ id: "x", rqa: null, status: "open", etapa: "Reunião Realizada", funil: "[Vorp] Funil de Vendas", faturamento: "a", cargo: "b", necessidade: "c", timing: "d", ...p }) as never;

describe("RQA", () => {
  it("situação: validada, não validada, aguardando e sem registro", () => {
    expect(situacaoDaRqa(l({ rqa: "sim" }))).toBe("validada");
    expect(situacaoDaRqa(l({ rqa: "nao" }))).toBe("nao_validada");
    expect(situacaoDaRqa(l({}))).toBe("aguardando"); // ainda na Reunião Realizada
    expect(situacaoDaRqa(l({ funil: "[Vorp] Outbound", etapa: "Ganho" }))).toBe("aguardando"); // ainda no funil do BDR
    expect(situacaoDaRqa(l({ etapa: "Proposta Pendente" }))).toBe("sem_registro"); // saiu sem validação
    expect(situacaoDaRqa(l({ status: "lost", etapa: "Perda" }))).toBe("sem_registro");
    expect(situacaoDaRqa(l({ status: "won", etapa: "Ganho" }))).toBe("sem_registro");
  });

  it("resumo: previsão pelo closer, comissão oficial pelo gerente (R$ 30 por RQA)", () => {
    const lista = [l({ id: "a", rqa: "sim" }), l({ id: "b", rqa: "sim", necessidade: null }), l({ id: "c", rqa: "nao" }), l({ id: "d" })];
    const g = new Map<string, ValidacaoGerente>([
      ["a", { decisao: "aprovada", observacao: null, atualizadoEm: "", atualizadoPor: null }],
      ["c", { decisao: "aprovada", observacao: "o closer errou", atualizadoEm: "", atualizadoPor: null }],
      ["b", { decisao: "reprovada", observacao: null, atualizadoEm: "", atualizadoPor: null }],
    ]);
    expect(resumirRqa(lista, g, 30)).toEqual({
      realizadas: 4, validada: 2, nao_validada: 1, aguardando: 1, sem_registro: 0, bantIncompleto: 1,
      aprovadas: 2, reprovadas: 1, semGerente: 1, previsao: 60, comissao: 60,
    });
    expect(bantPreenchidos(l({ cargo: null, timing: null }))).toBe(2);
  });

  it("paga no dia 15 do mês seguinte", () => {
    expect(pagamentoDoMes("2026-11")).toBe("2026-12-15");
    expect(pagamentoDoMes("2026-12")).toBe("2027-01-15");
  });
});
