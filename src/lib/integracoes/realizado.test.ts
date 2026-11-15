import { describe, expect, it } from "vitest";
import { CRM_POR_NEGOCIO } from "./config";
import { calcularRealizadoCrm, dataBR, ehMql, vendasGanhas, type DealCrm, type EventoCrm } from "./realizado";
import { contarAlosConexoes, segundos } from "./tresc";
import { canalDoDeal } from "./run";
import { aplicarRealizado, etapasIntegradas, funisDoMes } from "../funil-negocio";

const cfg = CRM_POR_NEGOCIO.vorp;
const ST = {
  agendadaOut: "722cd95f-5518-4fcf-8229-3bb4aea55a7d",
  ganhoOut: "966ae249-0035-4120-ba6d-a3ff6db881ad",
  conectadoIn: "cmq9hpng3008r40mzimnpkyaq",
  realizadaVendas: "cmq9wwt8l024541npexvflx5e",
  propostaApresentada: "fdd8ac8c-c615-4cbd-8da7-86010918f646",
  ganhoVendas: "cmq9wwt8l024a41npns90puld",
  entradaOut: "badae364-589d-46ca-a54b-c4ef85780cd0",
};

function deal(p: Partial<DealCrm> & { deal_id: string }): DealCrm {
  return {
    canal: "outbound",
    faturamento: null,
    cargo: null,
    status: "open",
    stage_id: null,
    valor: 0,
    mrr: null,
    nome: null,
    empresa: null,
    produtos: null,
    responsavel_user_id: null,
    closer_user_id: null,
    sdr_user_id: null,
    criado_em: null,
    fechado_em: null,
    ...p,
  };
}
const ev = (deal_id: string, stage_id: string, ocorrido_em: string): EventoCrm => ({ deal_id, stage_id, ocorrido_em });
const total = (r: ReturnType<typeof calcularRealizadoCrm>, canal: string, etapa: string) =>
  r.filter((x) => x.canal === canal && x.etapa === etapa).reduce((s, x) => s + x.quantidade, 0);

describe("3C Plus", () => {
  it("alô = atendida com BDR; conexão = 60s ou mais falando com o BDR", () => {
    const r = contarAlosConexoes(
      [
        { call_date: "", agent: "A", has_agent: true, speaking_with_agent_time: "00:01:25" },
        { call_date: "", agent: "A", has_agent: true, speaking_with_agent_time: "00:00:59" },
        { call_date: "", agent: "-", has_agent: false, speaking_with_agent_time: "00:00:00" },
      ],
      60,
    );
    expect(r).toEqual({ alos: 2, conexoes: 1 });
    expect(segundos("01:00:01")).toBe(3601);
  });
});

describe("realizado do CRM", () => {
  it("conta no dia em que o lead chegou pela 1ª vez na etapa ou além (pulo de etapa também conta)", () => {
    const deals = [deal({ deal_id: "a" })];
    const eventos = [
      ev("a", ST.entradaOut, "2026-11-09T21:40:24Z"),
      ev("a", ST.agendadaOut, "2026-11-09T21:50:33Z"),
      ev("a", ST.ganhoOut, "2026-11-11T13:50:32Z"),
      ev("a", ST.realizadaVendas, "2026-11-11T13:50:34Z"),
      ev("a", ST.ganhoVendas, "2026-11-20T15:00:00Z"), // pulou a proposta
    ];
    const r = calcularRealizadoCrm(deals, eventos, cfg, "2026-11-01", "2026-12-01");
    expect(total(r, "outbound", "reunioes_agendadas")).toBe(1);
    expect(total(r, "outbound", "reunioes_realizadas")).toBe(1);
    expect(total(r, "outbound", "propostas")).toBe(1);
    expect(total(r, "outbound", "vendas")).toBe(1);
    expect(r.find((x) => x.etapa === "reunioes_realizadas")?.data).toBe("2026-11-11");
  });

  it("etapa alcançada em outro mês não conta de novo", () => {
    const deals = [deal({ deal_id: "b" })];
    const eventos = [ev("b", ST.agendadaOut, "2026-10-30T12:00:00Z"), ev("b", ST.ganhoOut, "2026-11-03T12:00:00Z")];
    const r = calcularRealizadoCrm(deals, eventos, cfg, "2026-11-01", "2026-12-01");
    expect(total(r, "outbound", "reunioes_agendadas")).toBe(0);
    expect(total(r, "outbound", "reunioes_realizadas")).toBe(1);
  });

  it("inbound é o canal Tráfego Pago: leads, MQL e conectados", () => {
    const deals = [
      deal({ deal_id: "c", canal: "trafego", criado_em: "2026-11-05T13:00:00Z", faturamento: "entre_400_mil_e_1_milhao", cargo: "ceo_diretor_executivo" }),
      deal({ deal_id: "d", canal: "trafego", criado_em: "2026-11-05T13:00:00Z", faturamento: "entre_30_e_100_mil", cargo: "proprietario" }),
      deal({ deal_id: "e", canal: "social_selling", criado_em: "2026-11-05T13:00:00Z" }),
    ];
    const r = calcularRealizadoCrm(deals, [ev("c", ST.conectadoIn, "2026-11-06T13:00:00Z")], cfg, "2026-11-01", "2026-12-01");
    expect(total(r, "inbound", "leads")).toBe(2);
    expect(total(r, "inbound", "mql")).toBe(1);
    expect(total(r, "inbound", "conectados")).toBe(1);
    expect(r.some((x) => x.canal === "outbound")).toBe(false);
  });

  it("MQL: faturamento a partir de 100 mil e cargo de gerente para cima", () => {
    expect(ehMql({ faturamento: "entre_100_e_200_mil", cargo: "gerente" }, cfg)).toBe(true);
    expect(ehMql({ faturamento: "entre_100_e_200_mil", cargo: "supervisor" }, cfg)).toBe(false);
    expect(ehMql({ faturamento: "entre_30_e_100_mil", cargo: "socio" }, cfg)).toBe(false);
  });

  it("data no fuso de Brasília", () => {
    expect(dataBR("2026-11-12T01:30:00Z")).toBe("2026-11-11");
  });

  it("canal vazio: formulário/anúncio vira Tráfego Pago; o resto fica de fora", () => {
    expect(canalDoDeal({ properties: { canal_origem: "outbound" }, tags: [] })).toBe("outbound");
    expect(canalDoDeal({ properties: {}, tags: [{ name: "FORMS FACEBOOK" }] })).toBe("trafego");
    expect(canalDoDeal({ properties: {}, tags: [{ name: "MARKETING" }] })).toBeNull();
  });
});

describe("vendas a partir do Ganho", () => {
  it("só Ganho do funil de vendas, com canal da Acrópole; valor = antecipado", () => {
    const deals = [
      deal({ deal_id: "v1", status: "won", stage_id: ST.ganhoVendas, valor: 24000, mrr: 8000, closer_user_id: "u1", sdr_user_id: "u2", empresa: "ACME" }),
      deal({ deal_id: "v2", status: "won", stage_id: ST.ganhoOut }), // ganho de SDR, não é venda
      deal({ deal_id: "v3", status: "won", stage_id: ST.ganhoVendas, canal: "eventos" }),
    ];
    const v = vendasGanhas(deals, [ev("v1", ST.ganhoVendas, "2026-11-10T15:00:00Z")], cfg);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ deal_id: "v1", data: "2026-11-10", canal: "outbound", valor: 24000, mrr: 8000, cliente: "ACME" });
  });
});

describe("funil do dashboard", () => {
  it("preenche só as etapas integradas e zera as integradas sem registro", () => {
    const funis = aplicarRealizado(funisDoMes("vorp", 2026, 11), [{ canal: "outbound", etapa: "alos", quantidade: 143 }], etapasIntegradas("vorp"));
    const out = funis.find((f) => f.canal === "outbound")!;
    expect(out.etapas[0].realizado).toBe(143);
    expect(out.etapas[1].realizado).toBe(0);
    const semIntegracao = aplicarRealizado(funisDoMes("matchsales", 2026, 12), [], etapasIntegradas("matchsales"));
    expect(semIntegracao[0].etapas[0].realizado).toBeNull();
  });
});
