import { describe, expect, it } from "vitest";
import { diasUteisDoMes, metasPorCanal, montarEsforco, serieDoMes, TIMES_POR_CANAL } from "./pace-esforco";

const JORGE = "efaa951d-455a-4148-ba3a-fa3b5f4bafd9";
const RYQ = "7d0660e3-9acb-4266-93db-cfdee71e2289";
const VINI = "2acc1ce9-0160-4bf9-8526-4f799604143a";
const nomes = { [JORGE]: "Jorge Abudi", [RYQ]: "Marcus Ryquelme", [VINI]: "Vinícius Anastácio Ferreira" };
const ctx = { ano: 2026, mes: 11, hoje: "2026-11-17" };

describe("pace de esforço (Pace por B.U)", () => {
  const metas = metasPorCanal("vorp", 2026, 11);
  const linhas = [
    { canal: "outbound", etapa: "reunioes_agendadas", quantidade: 27 },
    { canal: "inbound", etapa: "reunioes_agendadas", quantidade: 1 },
    { canal: "outbound", etapa: "reunioes_realizadas", quantidade: 10 },
  ];
  const lead = (canal: string) => ({ nome: "x", data: "2026-11-05", canal });
  const ranking = {
    reunioes_agendadas: [
      { nome: "Vinícius Anastácio Ferreira", total: 14, leads: Array.from({ length: 14 }, () => lead("outbound")) },
      { nome: "Marcus Ryquelme", total: 8, leads: Array.from({ length: 8 }, () => lead("outbound")) },
      { nome: "Jorge Abudi", total: 6, leads: [...Array.from({ length: 5 }, () => lead("outbound")), lead("inbound")] },
    ],
    reunioes_realizadas: [{ nome: "Jorge Abudi", total: 3, leads: [lead("outbound"), lead("outbound"), lead("indicacao")] }],
  };
  const e = montarEsforco("vorp", ctx, linhas, ranking, nomes);

  it("meta do canal dividida entre quem trabalha nele; a da pessoa é a soma dos canais", () => {
    const jorge = e.preVendas.find((p) => p.id === JORGE)!.indicadores.reunioes_agendadas;
    const ryq = e.preVendas.find((p) => p.id === RYQ)!.indicadores.reunioes_agendadas;
    expect(ryq.pace.meta).toBeCloseTo(metas.reunioes_agendadas.outbound! / 3);
    expect(jorge.pace.meta).toBeCloseTo(metas.reunioes_agendadas.outbound! / 3 + metas.reunioes_agendadas.inbound!);
    expect(jorge.canais.map((c) => [c.canal, c.realizado])).toEqual([
      ["outbound", 5],
      ["inbound", 1],
    ]);
  });

  it("o realizado da pessoa é o total de todos os canais (um canal compensa o outro)", () => {
    const jorge = e.preVendas.find((p) => p.id === JORGE)!.indicadores.reunioes_realizadas;
    expect(jorge.pace.recebido).toBe(3);
    const indicacao = jorge.canais.find((c) => c.canal === "indicacao")!;
    expect(indicacao).toMatchObject({ realizado: 1, meta: null }); // Indicação sem time: sem meta individual
  });

  it("o time soma os canais, inclusive a meta de Indicação (que não é dividida)", () => {
    expect(e.time.reunioes_agendadas.pace.recebido).toBe(28);
    const metaRealizadas = Object.values(metas.reunioes_realizadas).reduce((s, v) => s + (v ?? 0), 0);
    expect(e.time.reunioes_realizadas.pace.meta).toBeCloseTo(metaRealizadas);
    expect(metas.reunioes_agendadas.indicacao).toBeUndefined(); // Indicação não tem agendamento
    expect(TIMES_POR_CANAL.vorp.indicacao).toBeUndefined();
  });

  it("ordena os pré-vendas por agendadas", () => {
    expect(e.preVendas.map((p) => p.nome)).toEqual(["Vinícius Anastácio Ferreira", "Marcus Ryquelme", "Jorge Abudi"]);
  });
});

describe("Match Sales: Referidos também tem meta de agendadas (com o no-show)", () => {
  it("agendadas dos referidos = leads indicados; realizadas = agendadas × comparecimento (70%)", () => {
    const m = metasPorCanal("matchsales", 2026, 11);
    expect(m.reunioes_agendadas.indicacao).toBeGreaterThan(0);
    expect(m.reunioes_realizadas.indicacao! / m.reunioes_agendadas.indicacao!).toBeCloseTo(0.7);
    const ag = Object.values(m.reunioes_agendadas).reduce((s, v) => s + (v ?? 0), 0);
    const re = Object.values(m.reunioes_realizadas).reduce((s, v) => s + (v ?? 0), 0);
    expect(re / ag).toBeCloseTo(0.7);
  });
});

describe("gráfico esperado × realizado e conversões ideais", () => {
  it("um ponto por dia útil; fim de semana entra no dia útil seguinte; dia que não chegou fica sem realizado", () => {
    const dias = diasUteisDoMes(2026, 11);
    expect(dias.length).toBe(19);
    expect(dias[0]).toBe("2026-11-03"); // 02/11 é Finados
    const s = serieDoMes(19, [["2026-11-03", 2], ["2026-11-08", 1], ["2026-11-09", 1]], 2026, 11, "2026-11-10");
    expect(s[0]).toMatchObject({ dia: "2026-11-03", esperado: 1, realizado: 2 });
    expect(s.find((p) => p.dia === "2026-11-09")?.realizado).toBe(4); // o domingo 08/11 soma na segunda
    expect(s.find((p) => p.dia === "2026-11-11")?.realizado).toBeNull();
    expect(s[s.length - 1].esperado).toBeCloseTo(19);
  });

  it("ideal do funil pela razão das metas: realizadas ÷ agendadas (sem Indicação) e vendas ÷ realizadas", () => {
    const metas = metasPorCanal("vorp", 2026, 11);
    const e = montarEsforco("vorp", { ano: 2026, mes: 11, hoje: "2026-11-17" }, [], null, {});
    const ag = metas.reunioes_agendadas.outbound! + metas.reunioes_agendadas.inbound!;
    const realComAg = metas.reunioes_realizadas.outbound! + metas.reunioes_realizadas.inbound!;
    expect(e.ideal.realizadas).toBeCloseTo(realComAg / ag);
    const real = Object.values(metas.reunioes_realizadas).reduce((s, v) => s + (v ?? 0), 0);
    const vendas = Object.values(metas.vendas).reduce((s, v) => s + (v ?? 0), 0);
    expect(e.ideal.vendas).toBeCloseTo(vendas / real);
    expect(e.time.vendas.pace.meta).toBeCloseTo(vendas);
  });
});
