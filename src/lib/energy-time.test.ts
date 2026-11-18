import { describe, expect, it } from "vitest";
import { comissaoDasVendas, funilEnergia, kwhParaLimite, motivoDaPerda, producaoEnergia } from "./energy-time";
import type { SunneDeal } from "./sunne";

const deal = (id: string, extra: Partial<SunneDeal>): SunneDeal => ({
  id,
  organizationId: "org-a",
  product: "gd",
  funnel: "sales",
  stage: "x",
  stageKey: "referral_sent",
  isClosed: false,
  isLost: false,
  createdAt: "2026-11-05T12:00:00Z",
  closedAt: null,
  averageConsumption: 500,
  compensableKwh: 450,
  referenceValue: 250,
  ...extra,
});

describe("funilEnergia", () => {
  const deals = [
    deal("1", { stageKey: "proposal_sent" }), // subida, não chegou ao contrato
    deal("2", { stageKey: "contract_sent" }), // contrato enviado
    deal("3", { stageKey: "validation" }), // em validação
    deal("4", { funnel: "connection", stageKey: "send_to_plant", isClosed: true, closedAt: "2026-11-10T12:00:00Z" }), // ganha
    deal("5", { funnel: "lost", isLost: true, lostFromFunnel: "sales", lostFromStageKey: "validation", lostReason: "client_gave_up" }), // perdida após validação
    deal("6", { funnel: "lost", isLost: true, lostFromFunnel: "sales", lostFromStageKey: "proposal_sent", cancellationReason: "Documento ilegível" }), // perdida antes
    deal("7", { organizationId: "org-b", stageKey: "validation" }), // de outro vendedor
    deal("8", { createdAt: "2026-10-20T12:00:00Z", stageKey: "validation" }), // de outro mês
    deal("9", { product: "alugsol" }), // outro produto
  ];

  it("conta o funil de um vendedor", () => {
    const f = funilEnergia(deals, 2026, 11, new Set(["org-a"]));
    expect(f).toMatchObject({ subidas: 6, contrato: 4, validacao: 3, ganhas: 1, emAndamento: 1, perdidas: 2, perdidasAntes: 1 });
  });
  it("sem filtro de vendedor soma o time", () => {
    const f = funilEnergia(deals, 2026, 11, null);
    expect(f.subidas).toBe(7);
    expect(f.validacao).toBe(4);
  });
  it("lista os motivos das perdas em português, do mais frequente", () => {
    const f = funilEnergia(deals, 2026, 11, new Set(["org-a"]));
    expect(f.motivos.map((m) => m.motivo).sort()).toEqual(["Cliente desistiu", "Documento ilegível"]);
  });
});

describe("motivoDaPerda", () => {
  it("usa o motivo da plataforma, depois a categoria, depois o da validação; sem nada, avisa", () => {
    expect(motivoDaPerda({ lostReason: "no_contact" })).toBe("Sem retorno do cliente");
    expect(motivoDaPerda({ lostCategory: "replaced" })).toBe("Refeito (substituído)");
    expect(motivoDaPerda({ cancellationReason: "Outro texto" })).toBe("Outro texto");
    expect(motivoDaPerda({})).toBe("Sem motivo informado");
  });
});

describe("producaoEnergia", () => {
  const fechadas = [
    deal("a", { isClosed: true, closedAt: "2026-11-10T12:00:00Z", averageConsumption: 400, referenceValue: 200 }),
    deal("b", { isClosed: true, closedAt: "2026-11-12T12:00:00Z", averageConsumption: 600, referenceValue: 300, organizationId: "org-b" }),
    deal("c", { isClosed: true, closedAt: "2026-10-30T12:00:00Z" }), // outro mês
    deal("d", { isClosed: true, isLost: true, closedAt: "2026-11-11T12:00:00Z" }), // cancelada
  ];
  it("kWh e 80% da primeira fatura do vendedor", () => {
    const p = producaoEnergia(fechadas, 2026, 11, new Set(["org-a"]), 1000);
    expect(p).toEqual({ kwh: 400, faturamento: 160, fechadas: 1 });
  });
  it("acima de 80 mil kWh no mês, a Vorp fica com 100%", () => {
    expect(producaoEnergia(fechadas, 2026, 11, new Set(["org-a"]), 90000).faturamento).toBe(200);
  });
  it("o limite conta os kWh compensáveis de todos os fechados do mês", () => {
    expect(kwhParaLimite(fechadas, 2026, 11)).toBe(450 * 2);
  });
});

describe("comissaoDasVendas", () => {
  const fechadas = [
    deal("a", { isClosed: true, closedAt: "2026-11-10T12:00:00Z", referenceValue: 200 }),
    deal("b", { isClosed: true, closedAt: "2026-11-12T12:00:00Z", referenceValue: 100, organizationId: "org-b" }),
    deal("c", { isClosed: true, closedAt: "2026-10-30T12:00:00Z", referenceValue: 999 }),
  ];
  it("30% do que a Vorp recebe (80% da primeira fatura) das contas do vendedor", () => {
    const l = comissaoDasVendas(fechadas, 2026, 11, new Set(["org-a"]), 1000, 30);
    expect(l).toHaveLength(1);
    expect(l[0].recebido).toBe(160);
    expect(l[0].comissao).toBeCloseTo(48);
  });
  it("sem filtro de vendedor traz o time todo", () => {
    expect(comissaoDasVendas(fechadas, 2026, 11, null, 1000, 30)).toHaveLength(2);
  });
});
