import { describe, expect, it } from "vitest";
import { calcularPace, diasUteis, limitesDoMes } from "./pace-negocio";

describe("diasUteis", () => {
  it("novembro de 2026 tem 19 dias úteis (21 seg-sex menos Finados e Consciência Negra)", () => {
    const { inicio, fim } = limitesDoMes(2026, 11);
    expect(diasUteis(inicio, fim)).toBe(19);
    expect(diasUteis("2026-11-02", "2026-11-02")).toBe(0);
    expect(diasUteis("2026-11-20", "2026-11-20")).toBe(0);
  });
});

describe("calcularPace", () => {
  it("meio do mês no ritmo", () => {
    // 2026-11-13 (sexta) = 9 dias úteis decorridos de 19 (02/11 é feriado)
    const p = calcularPace({ meta: 190_000, recebido: 90_000, hoje: "2026-11-13", ano: 2026, mes: 11 });
    expect(p.diasUteisDecorridos).toBe(9);
    expect(p.diasUteisRestantes).toBe(10);
    expect(p.esperadoAteHoje).toBeCloseTo(90_000);
    expect(p.indice).toBeCloseTo(1);
    expect(p.projecao).toBeCloseTo(190_000);
    expect(p.falta).toBe(100_000);
    expect(p.necessarioPorDia).toBeCloseTo(10_000);
  });

  it("sem meta", () => {
    expect(calcularPace({ meta: 0, recebido: 5000, hoje: "2026-11-13", ano: 2026, mes: 11 }).status).toBe("sem_meta");
  });

  it("meta batida vira adiantado e sem necessidade por dia", () => {
    const p = calcularPace({ meta: 1000, recebido: 1500, hoje: "2026-11-13", ano: 2026, mes: 11 });
    expect(p.status).toBe("adiantado");
    expect(p.falta).toBe(0);
  });

  it("atrasado e crítico", () => {
    expect(calcularPace({ meta: 210_000, recebido: 70_000, hoje: "2026-11-13", ano: 2026, mes: 11 }).status).toBe("atrasado");
    expect(calcularPace({ meta: 210_000, recebido: 30_000, hoje: "2026-11-13", ano: 2026, mes: 11 }).status).toBe("critico");
  });

  it("mês passado conta todos os dias; mês futuro, nenhum", () => {
    expect(calcularPace({ meta: 100, recebido: 50, hoje: "2026-12-10", ano: 2026, mes: 11 }).diasUteisRestantes).toBe(0);
    expect(calcularPace({ meta: 100, recebido: 0, hoje: "2026-10-10", ano: 2026, mes: 11 }).diasUteisDecorridos).toBe(0);
  });
});
