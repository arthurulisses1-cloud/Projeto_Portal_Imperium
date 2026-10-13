import { describe, expect, it } from "vitest";
import { avaliarFeedback, diasUteisNoIntervalo, type EntradaFeedback } from "./feedback-mes";

const taxas = new Map<string, number>([
  ["tentativas_alos", 0.5],
  ["alos_conexoes", 0.5],
  ["conexoes_entrevistas", 0.2],
  ["entrevistas_assinaturas", 0.5],
  ["assinaturas_pagos", 0.5],
]);

function base(sobrescrever: Partial<EntradaFeedback> = {}): EntradaFeedback {
  return {
    papel: "sdr",
    realizado: { tentativas: 0, alos: 0, conexoes: 0, entrevistas: 0, assinaturas: 0, pagos: 0 },
    creditoPago: 0,
    metaCredito: 100000,
    metaTicketMedio: 10000,
    taxas,
    fracaoMes: 0.5,
    ...sobrescrever,
  };
}

describe("diasUteisNoIntervalo", () => {
  it("conta seg-sex, fim exclusivo", () => {
    // 05/10/2026 é segunda; até 12/10 (segunda, exclusivo) = 5 dias úteis
    expect(diasUteisNoIntervalo("2026-10-05", "2026-10-12")).toBe(5);
    expect(diasUteisNoIntervalo("2026-10-01", "2026-10-01")).toBe(0);
  });
});

describe("avaliarFeedback", () => {
  it("início de mês não avalia", () => {
    expect(avaliarFeedback(base({ fracaoMes: 0 })).nivel).toBe("inicio");
  });

  it("sem meta nem taxas não tem base", () => {
    expect(avaliarFeedback(base({ metaCredito: null, taxas: new Map() })).nivel).toBe("sem_base");
  });

  it("no ritmo quando volume, conversão e crédito batem o esperado", () => {
    // meta 100k / ticket 10k = 10 pagos; pagos 10 ← assin 20 ← entrev 40 ← conexões 200 ← alôs 400 ← tent 800
    const f = avaliarFeedback(
      base({
        realizado: { tentativas: 400, alos: 200, conexoes: 100, entrevistas: 20, assinaturas: 10, pagos: 5 },
        creditoPago: 50000,
      })
    );
    expect(f.nivel).toBe("ritmo");
    expect(f.gargalo).toBeNull();
  });

  it("aponta a conversão ruim como gargalo", () => {
    const f = avaliarFeedback(
      base({
        realizado: { tentativas: 400, alos: 200, conexoes: 100, entrevistas: 5, assinaturas: 10, pagos: 5 },
        creditoPago: 50000,
      })
    );
    expect(f.gargalo).toContain("Conexões → Entrevistas");
  });

  it("fica abaixo quando tudo está muito aquém", () => {
    const f = avaliarFeedback(
      base({ realizado: { tentativas: 80, alos: 40, conexoes: 20, entrevistas: 2, assinaturas: 1, pagos: 0 }, creditoPago: 0 })
    );
    expect(f.nivel).toBe("abaixo");
    expect(f.gargalo).not.toBeNull();
  });
});
