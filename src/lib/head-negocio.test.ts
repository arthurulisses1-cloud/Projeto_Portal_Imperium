import { describe, expect, it } from "vitest";
import { ordenarPorAtencao, type LinhaTime } from "./head-negocio";

const linha = (nome: string, indice: number | null): LinhaTime => ({
  id: nome,
  nome,
  cargo: "executivo",
  recebido: null,
  vendas: 0,
  mrr: 0,
  agendadas: null,
  realizadas: null,
  noShow: null,
  indice,
});

describe("ordenarPorAtencao", () => {
  it("quem está mais longe do ritmo vem primeiro; sem meta vai para o fim", () => {
    const r = ordenarPorAtencao([linha("Ana", 1.2), linha("Bia", 0.4), linha("Caio", null), linha("Davi", 0.9)]);
    expect(r.map((l) => l.nome)).toEqual(["Bia", "Davi", "Ana", "Caio"]);
  });
  it("empate segue a ordem alfabética", () => {
    expect(ordenarPorAtencao([linha("Zeca", 0.5), linha("Ana", 0.5)]).map((l) => l.nome)).toEqual(["Ana", "Zeca"]);
  });
});
