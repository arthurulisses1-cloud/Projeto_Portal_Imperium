import { describe, expect, it } from "vitest";
import { calcularPace, diasUteis, limitesDoMes } from "./pace-negocio";

describe("diasUteis", () => {
  it("novembro de 2026 tem 21 dias úteis (seg-sex)", () => {
    const { inicio, fim } = limitesDoMes(2026, 11);
    expect(diasUteis(inicio, fim)).toBe(21);
  });
});

describe("calcularPace", () => {
  it("meio do mês no ritmo", () => {
    // 2026-11-13 (sexta) = 10 dias úteis decorridos de 21
    const p = calcularPace({ meta: 210_000, recebido: 100_000, hoje: "2026-11-13", ano: 2026, mes: 11 });
    expect(p.diasUteisDecorridos).toBe(10);
    expect(p.diasUteisRestantes).toBe(11);
    expect(p.esperadoAteHoje).toBeCloseTo(100_000);
    expect(p.indice).toBeCloseTo(1);
    expect(p.projecao).toBeCloseTo(210_000);
    expect(p.falta).toBe(110_000);
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
