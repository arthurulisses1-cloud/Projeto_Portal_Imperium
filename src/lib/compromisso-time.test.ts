import { describe, expect, it } from "vitest";
import { atingimentoDaPessoa, montarTime, reunioesDeHoje, type KpiPessoa } from "./compromisso-time";

const k = (chave: string, meta: number, realizado: number): KpiPessoa => ({ chave, label: chave, meta, realizado });

describe("atingimentoDaPessoa", () => {
  it("média dos indicadores com meta, cada um limitado a 100%", () => {
    expect(atingimentoDaPessoa([k("a", 10, 5), k("b", 2, 6), k("c", 0, 9)])).toBeCloseTo(0.75);
    expect(atingimentoDaPessoa([k("a", 0, 3)])).toBeNull();
  });
});

describe("reunioesDeHoje", () => {
  const leads = [
    { preVendas: "Jorge", closer: null, agendadaEm: "2026-11-19T13:45:00Z", realizadaEm: null },
    { preVendas: "Jorge", closer: "Bruno", agendadaEm: "2026-11-18T13:45:00Z", realizadaEm: "2026-11-19T18:00:00Z" },
    { preVendas: "Outro", closer: null, agendadaEm: "2026-11-19T13:45:00Z", realizadaEm: null },
  ];
  it("conta as agendadas de hoje de quem agendou e as realizadas de hoje de quem agendou ou fechou", () => {
    expect(reunioesDeHoje(leads, "Jorge", "2026-11-19")).toEqual({ agendadas: 1, realizadas: 1 });
    expect(reunioesDeHoje(leads, "Bruno", "2026-11-19")).toEqual({ agendadas: 0, realizadas: 1 });
  });
});

describe("montarTime", () => {
  const membros = [
    { id: "ana", nome: "Ana", cargo: "executivo" },
    { id: "bia", nome: "Bia", cargo: "executivo" },
    { id: "caio", nome: "Caio", cargo: "sdr" },
    { id: "dani", nome: "Dani", cargo: "sdr" },
  ];
  const kpis = new Map([
    ["ana", [k("agendadas", 4, 2), k("recebido", 1000, 1000)]],
    ["bia", [k("agendadas", 2, 2)]],
    ["dani", [k("agendadas", 0, 0)]],
  ]);
  const t = montarTime("matchsales", "Galácticos", membros, kpis, new Set(["caio"]));
  it("conta quem lançou e quem era esperado (falta não entra)", () => {
    expect(t.lancaram).toBe(2);
    expect(t.esperados).toBe(3);
    expect(t.pessoas.find((p) => p.id === "caio")?.faltou).toBe(true);
    expect(t.pessoas.find((p) => p.id === "dani")?.lancou).toBe(false);
  });
  it("soma cada indicador do time e calcula o atingimento geral de quem lançou", () => {
    const ag = t.kpis.find((x) => x.chave === "agendadas")!;
    expect(ag).toMatchObject({ meta: 6, realizado: 4 });
    expect(ag.pct).toBeCloseTo(4 / 6);
    expect(t.atingimento).toBeCloseTo((0.75 + 1) / 2);
  });
  it("quem não lançou vai para o fim da lista", () => {
    expect(t.pessoas.map((p) => p.id).slice(0, 2).sort()).toEqual(["ana", "bia"]);
  });
});
