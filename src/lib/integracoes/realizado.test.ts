import { describe, expect, it } from "vitest";
import { CRM_POR_NEGOCIO, TRESC_POR_NEGOCIO } from "./config";
import { calcularFunilUnico, calcularRealizadoCrm, dataBR, ehMql, vendasGanhas, type DealCrm, type EventoCrm } from "./realizado";
import { contarAlosConexoes, segundos } from "./tresc";
import { canalDoDeal } from "./run";
import { aplicarRealizado, etapasIntegradas, funilUnicoDoNegocio, funisDoMes } from "../funil-negocio";
import { ganhosDoMes } from "../recebido-crm";

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

  it("ligação manual que ninguém atendeu (Falha / Não Atendida) não é alô", () => {
    const r = contarAlosConexoes(
      [
        { call_date: "", agent: "A", has_agent: true, status_id: 8, speaking_with_agent_time: "00:00:00" },
        { call_date: "", agent: "A", has_agent: true, status_id: 5, speaking_with_agent_time: "00:00:00" },
        { call_date: "", agent: "A", has_agent: true, status_id: 7, speaking_with_agent_time: "00:00:03" },
        { call_date: "", agent: "A", has_agent: true, status_id: 4, speaking_with_agent_time: "00:01:10" },
      ],
      60,
    );
    expect(r).toEqual({ alos: 2, conexoes: 1 });
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

describe("regras de correção da Acrópole (auditoria 16/11)", () => {
  const P4 = "cmq9wwt6u024441npj37o5f2y";
  const PROPOSTA_PENDENTE = "21f92e96-e550-4c9d-b3c8-5fda04341cf0";
  const PERDA_VENDAS = "cmq9wwt8l024b41npg4os2gru";
  const NO_SHOW_OUT = "7a9b0a1a-d5d5-44fb-91c8-2c13488df211";
  const evt = (deal_id: string, stage_id: string, ocorrido_em: string, tipo = "STAGE_CHANGED", pipeline_id: string | null = null): EventoCrm => ({
    deal_id,
    stage_id,
    ocorrido_em,
    tipo,
    pipeline_id,
  });

  it("proposta que volta para Proposta Pendente deixa de contar; se voltar para proposta, conta na volta", () => {
    const deals = [deal({ deal_id: "p1" }), deal({ deal_id: "p2" })];
    const r = calcularRealizadoCrm(
      deals,
      [
        evt("p1", ST.realizadaVendas, "2026-11-09T17:48:00Z"),
        evt("p1", ST.propostaApresentada, "2026-11-09T17:50:00Z"),
        evt("p1", PROPOSTA_PENDENTE, "2026-11-11T13:42:00Z"),
        evt("p2", ST.realizadaVendas, "2026-11-09T17:48:00Z"),
        evt("p2", ST.propostaApresentada, "2026-11-10T17:50:00Z"),
        evt("p2", PROPOSTA_PENDENTE, "2026-11-11T13:42:00Z"),
        evt("p2", ST.propostaApresentada, "2026-11-18T13:00:00Z"),
      ],
      cfg,
      "2026-11-01",
      "2026-12-01",
      { agora: "2026-11-30T00:00:00Z" },
    );
    expect(total(r, "outbound", "propostas")).toBe(1);
    expect(r.find((x) => x.etapa === "propostas")?.data).toBe("2026-11-18");
    expect(total(r, "outbound", "reunioes_realizadas")).toBe(2);
  });

  it("perder depois da proposta não desfaz a proposta (Perda é neutra)", () => {
    const r = calcularRealizadoCrm(
      [deal({ deal_id: "p3" })],
      [evt("p3", ST.propostaApresentada, "2026-11-12T14:00:00Z"), evt("p3", PERDA_VENDAS, "2026-11-16T14:00:00Z")],
      cfg,
      "2026-11-01",
      "2026-12-01",
      { agora: "2026-11-30T00:00:00Z" },
    );
    expect(total(r, "outbound", "propostas")).toBe(1);
  });

  it("realizada devolvida para No Show deixa de contar; o agendamento continua", () => {
    const r = calcularRealizadoCrm(
      [deal({ deal_id: "n1" })],
      [evt("n1", ST.agendadaOut, "2026-11-05T13:00:00Z"), evt("n1", ST.ganhoOut, "2026-11-06T13:00:00Z"), evt("n1", NO_SHOW_OUT, "2026-11-06T15:00:00Z")],
      cfg,
      "2026-11-01",
      "2026-12-01",
      { agora: "2026-11-30T00:00:00Z" },
    );
    expect(total(r, "outbound", "reunioes_agendadas")).toBe(1);
    expect(total(r, "outbound", "reunioes_realizadas")).toBe(0);
  });

  it("lead criado direto no Funil de Vendas (WhatsApp) não conta reunião realizada pela criação", () => {
    const r = calcularRealizadoCrm(
      [deal({ deal_id: "w1" })],
      [
        evt("w1", ST.realizadaVendas, "2026-11-05T21:11:00Z", "DEAL_CREATED", P4),
        evt("w1", ST.agendadaOut, "2026-11-05T22:18:00Z"),
        evt("w1", ST.ganhoOut, "2026-11-06T19:17:00Z"),
      ],
      cfg,
      "2026-11-01",
      "2026-12-01",
      { agora: "2026-11-30T00:00:00Z" },
    );
    expect(r.find((x) => x.etapa === "reunioes_agendadas")?.data).toBe("2026-11-05");
    expect(r.find((x) => x.etapa === "reunioes_realizadas")?.data).toBe("2026-11-06");
  });

  it("Ganho antes do horário da reunião conta no horário marcado; reunião ainda no futuro não conta", () => {
    const deals = [deal({ deal_id: "c1" }), deal({ deal_id: "c2" }), deal({ deal_id: "c3" })];
    const eventos = [
      // COPILOT moveu para Ganho em 06/11, a reunião estava marcada para 09/11 11h
      evt("c1", ST.agendadaOut, "2026-11-06T19:26:00Z"),
      evt("c1", ST.ganhoOut, "2026-11-06T19:26:30Z"),
      // reunião marcada para 02/12: ainda não aconteceu
      evt("c2", ST.agendadaOut, "2026-11-20T12:00:00Z"),
      evt("c2", ST.ganhoOut, "2026-11-20T12:00:30Z"),
      // proposta apresentada antes do horário marcado prova que a reunião já tinha acontecido
      evt("c3", ST.agendadaOut, "2026-11-09T17:48:00Z"),
      evt("c3", ST.ganhoOut, "2026-11-09T17:48:10Z"),
      evt("c3", ST.propostaApresentada, "2026-11-09T17:50:00Z"),
    ];
    const reunioes = new Map<string, [string, string | null][]>([
      ["c1", [["2026-11-06T18:49:00Z", "2026-11-06T19:00:00Z"], ["2026-11-06T19:25:00Z", "2026-11-09T11:00"]]],
      ["c2", [["2026-11-20T11:59:00Z", "2026-12-02T10:00"]]],
      ["c3", [["2026-11-09T17:48:00Z", "2026-11-12T18:30"]]],
    ]);
    const r = calcularRealizadoCrm(deals, eventos, cfg, "2026-11-01", "2026-12-01", { reunioes, agora: "2026-11-25T00:00:00Z" });
    const realizadas = r.filter((x) => x.etapa === "reunioes_realizadas");
    expect(realizadas).toEqual([{ data: "2026-11-09", canal: "outbound", etapa: "reunioes_realizadas", quantidade: 2 }]);
  });

  it("Galáticos não usa essas regras: voltar de etapa não desfaz", () => {
    const ms = CRM_POR_NEGOCIO.matchsales;
    expect(ms.regressaoDesfaz).toBeFalsy();
    expect(ms.campoReuniao).toBeUndefined();
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
    const semIntegracao = aplicarRealizado(funisDoMes("vorp-finance", 2026, 12), [], etapasIntegradas("vorp-finance"));
    expect(semIntegracao[0].etapas[0].realizado).toBeNull();
  });
});

describe("Galáticos (MatchSales)", () => {
  const ms = CRM_POR_NEGOCIO.matchsales;
  const MS = {
    conectadoIn: "626eef2e-4d84-49ab-ac8b-4d59d1cea87b", // Atendimento Humano
    agendadaIn: "a4252513-8bce-41cd-9fe1-43af1d1cb12f",
    propostaIn: "d40dee61-af9a-459e-8220-0887456a4346",
    ganhoIn: "8c448cb1-7c1a-4244-bb64-690a70f453d0",
    atendimentoIa: "25051def-de7f-4b10-b90b-e4e49e0dc612",
    realizadaOut: "8e2ee4e7-e369-4d57-b9c7-26370d9d48d0",
    ganhoOut: "31aab8a9-79f7-4824-b229-4d1a4eac8319",
  };

  it("tem 3C e Pipefácil próprios e todas as etapas do funil integradas", () => {
    expect(TRESC_POR_NEGOCIO.matchsales.tokenEnv).toBe("TCP_API_TOKEN_MATCH");
    expect(ms.tokenEnv).toBe("PIPEFACIL_API_TOKEN_MATCH");
    const i = etapasIntegradas("matchsales");
    expect(i.has("outbound|alos")).toBe(true);
    expect(i.has("inbound|mql")).toBe(true);
    expect(i.has("indicacao|vendas")).toBe(true);
  });

  it("MQL: faturamento a partir de 50 mil e mais de 2 vendedores (cargo não importa)", () => {
    expect(ehMql({ faturamento: "entre_50_e_100_mil", cargo: null, tamanho_time: "entre_2_e_5_vendedores" }, ms)).toBe(true);
    expect(ehMql({ faturamento: "acima_de_500_mil", cargo: "vendedor", tamanho_time: "mais_de_20_vendedores" }, ms)).toBe(true);
    expect(ehMql({ faturamento: "abaixo_de_50_mil", cargo: "dono_socio", tamanho_time: "mais_de_20_vendedores" }, ms)).toBe(false);
    expect(ehMql({ faturamento: "entre_100_e_150_mil", cargo: "dono_socio", tamanho_time: "ate_2_vendedores" }, ms)).toBe(false);
    expect(ehMql({ faturamento: "entre_100_e_150_mil", cargo: "dono_socio", tamanho_time: null }, ms)).toBe(false);
  });

  it("inbound só Tráfego Pago; indicação de cliente/investidor e parceiros; Google fica fora", () => {
    const deals = [
      deal({ deal_id: "t", canal: "trafego", criado_em: "2026-11-05T13:00:00Z", faturamento: "entre_150_e_300_mil", tamanho_time: "entre_5_e_20_vendedores" }),
      deal({ deal_id: "g", canal: "google", criado_em: "2026-11-05T13:00:00Z" }),
      deal({ deal_id: "i", canal: "indicacao_cliente", criado_em: "2026-11-05T13:00:00Z" }),
      deal({ deal_id: "p", canal: "parceiros", criado_em: "2026-11-06T13:00:00Z" }),
    ];
    const eventos = [
      ev("t", MS.atendimentoIa, "2026-11-05T13:05:00Z"), // conversa com a IA não é conexão
      ev("t", MS.conectadoIn, "2026-11-06T13:00:00Z"),
      ev("t", MS.agendadaIn, "2026-11-07T13:00:00Z"),
      ev("t", MS.propostaIn, "2026-11-10T13:00:00Z"), // sem etapa de realizada: conta junto da proposta
    ];
    const r = calcularRealizadoCrm(deals, eventos, ms, "2026-11-01", "2026-12-01");
    expect(total(r, "inbound", "leads")).toBe(1);
    expect(total(r, "inbound", "mql")).toBe(1);
    expect(total(r, "inbound", "conectados")).toBe(1);
    expect(r.find((x) => x.canal === "inbound" && x.etapa === "conectados")?.data).toBe("2026-11-06");
    expect(total(r, "inbound", "reunioes_realizadas")).toBe(1);
    expect(total(r, "inbound", "propostas")).toBe(1);
    expect(total(r, "indicacao", "leads_indicados")).toBe(2);
  });

  it("Ganho do Inbound e do Outbound viram venda; closer = responsável", () => {
    const deals = [
      deal({ deal_id: "o", status: "won", stage_id: MS.ganhoOut, valor: 715, responsavel_user_id: "r1", produtos: ["plano_solo", "sdr_ia"] }),
      deal({ deal_id: "n", status: "won", stage_id: MS.ganhoIn, canal: "trafego", valor: 890 }),
      deal({ deal_id: "x", status: "won", stage_id: MS.ganhoIn, canal: "google", valor: 179 }),
    ];
    const v = vendasGanhas(deals, [ev("o", MS.ganhoOut, "2026-11-17T15:00:00Z"), ev("n", MS.ganhoIn, "2026-11-18T15:00:00Z")], ms);
    expect(v.map((x) => x.deal_id)).toEqual(["o", "n"]);
    expect(v[0]).toMatchObject({ canal: "outbound", valor: 715, mrr: null, closer_user_id: "r1", produto: "plano_solo, sdr_ia" });
    expect(v[1]).toMatchObject({ canal: "inbound", data: "2026-11-18" });
    expect(ms.inicioVendas).toBe("2026-11-16");
  });
});

describe("Energy (funil Inside Sales do Pipefácil da Sunne)", () => {
  const en = CRM_POR_NEGOCIO["vorp-energy"];
  const funil = en.funilUnico!;
  const IS = {
    leads: "248cd46c-a2c0-45f8-a406-25a25533fa6a",
    conectados: "29f5f805-ad8d-4756-91c3-a00b7aa100ae",
    conta: "c0a372d4-96cc-4ca0-bced-46ffc7a0216e",
    reuniao: "cd9bbaf1-c75a-46b6-bd87-37c511edb788",
    ganho: "6ec9fb40-184f-442b-a0cb-5fc7f0b89bac",
    perda: "fafa2c0f-91d3-4d51-b1c8-30921cc90c12",
  };
  const soma = (r: ReturnType<typeof calcularFunilUnico>, etapa: string) =>
    r.filter((x) => x.etapa === etapa).reduce((s, x) => s + x.quantidade, 0);

  it("um funil só, com as etapas do Inside Sales na ordem do Pipefácil e sem meta", () => {
    const f = funilUnicoDoNegocio("vorp-energy")!;
    expect(f.titulo).toBe("Inside Sales");
    expect(f.etapas.map((e) => e.label)).toEqual([
      "Leads",
      "Leads Conectados",
      "Conta Coletada",
      "Reunião Realizada",
      "Aguardando Assinatura",
      "Validação Comercial",
      "Ganho",
    ]);
    expect(f.etapas.every((e) => e.meta === null && e.conversaoMeta === null)).toBe(true);
    expect(funilUnicoDoNegocio("vorp")).toBeNull();
  });

  it("todas as etapas do funil vêm da integração, e só elas", () => {
    const k = etapasIntegradas("vorp-energy");
    expect(Array.from(k).sort()).toEqual(funil.etapas.map((e) => `outbound|${e.chave}`).sort());
    const f = aplicarRealizado([funilUnicoDoNegocio("vorp-energy")!], [{ canal: "outbound", etapa: "is_leads", quantidade: 40 }], k);
    expect(f[0].etapas[0].realizado).toBe(40);
    expect(f[0].etapas[1].realizado).toBe(0);
  });

  it("lead conta na etapa e em todas as anteriores no dia em que chegou; Leads = criação; Perda não conta", () => {
    const deals = [
      deal({ deal_id: "a", criado_em: "2026-11-03T13:00:00Z" }),
      deal({ deal_id: "b", criado_em: "2026-11-04T13:00:00Z" }),
      deal({ deal_id: "c", criado_em: "2026-10-20T13:00:00Z" }),
    ];
    const eventos = [
      ev("a", IS.leads, "2026-11-03T13:00:00Z"),
      ev("a", IS.conectados, "2026-11-03T15:00:00Z"),
      ev("a", IS.reuniao, "2026-11-05T15:00:00Z"), // pulou Conta Coletada
      ev("a", IS.conta, "2026-11-06T15:00:00Z"), // voltou: não conta de novo
      ev("b", IS.perda, "2026-11-04T15:00:00Z"),
      ev("c", IS.ganho, "2026-11-10T15:00:00Z"), // criado em outubro, ganho em novembro
    ];
    const r = calcularFunilUnico(deals, eventos, funil, "2026-11-01", "2026-12-01");
    expect(soma(r, "is_leads")).toBe(2);
    expect(soma(r, "is_conectados")).toBe(2);
    expect(soma(r, "is_conta_coletada")).toBe(2);
    expect(soma(r, "is_reuniao_realizada")).toBe(2);
    expect(soma(r, "is_aguardando_assinatura")).toBe(1);
    expect(soma(r, "is_ganho")).toBe(1);
    expect(r.find((x) => x.etapa === "is_conta_coletada" && x.data === "2026-11-05")?.quantidade).toBe(1);
    expect(r.every((x) => x.canal === "outbound")).toBe(true);
  });

  it("chegada fora do intervalo não conta; data no fuso de Brasília", () => {
    const deals = [deal({ deal_id: "a", criado_em: "2026-12-01T02:00:00Z" })]; // 30/11 em Brasília
    const r = calcularFunilUnico(deals, [ev("a", IS.conectados, "2026-12-01T12:00:00Z")], funil, "2026-11-01", "2026-12-01");
    expect(r).toEqual([{ data: "2026-11-30", canal: "outbound", etapa: "is_leads", quantidade: 1 }]);
  });

  it("sincroniza à parte, desde novembro", () => {
    expect(en.syncSeparado).toBe(true);
    expect(en.inicioHistorico).toBe("2026-11-01T00:00:00-03:00");
  });

  it("Recebido pelos Ganhos do CRM: valor do Pipefácil no dia do fechamento; sem venda lançada", () => {
    expect(en.recebidoPeloCrm).toBe(true);
    expect(en.stagesGanhoVenda).toEqual([IS.ganho]);
    const linhas = [
      { deal_id: "g1", negocio_id: "n", status: "won", stage_id: IS.ganho, valor: 195.99, nome: "A", empresa: null, fechado_em: "2026-11-16T17:00:05Z" },
      { deal_id: "g2", negocio_id: "n", status: "won", stage_id: IS.ganho, valor: "150.47", nome: null, empresa: "B", fechado_em: "2026-12-01T02:00:00Z" }, // 30/11 em Brasília
      { deal_id: "g3", negocio_id: "n", status: "open", stage_id: IS.ganho, valor: 100, nome: null, empresa: null, fechado_em: null },
      { deal_id: "g4", negocio_id: "n", status: "won", stage_id: IS.conta, valor: 50, nome: null, empresa: null, fechado_em: "2026-11-16T17:00:05Z" },
      { deal_id: "g5", negocio_id: "n", status: "won", stage_id: IS.ganho, valor: 70, nome: null, empresa: null, fechado_em: "2026-10-31T12:00:00Z" },
    ];
    const g = ganhosDoMes(linhas, en.stagesGanhoVenda, "2026-11-01", "2026-12-01");
    expect(g).toEqual([
      { id: "g2", negocio_id: "n", data: "2026-11-30", valor: 150.47, cliente: "B", canal: "outbound" },
      { id: "g1", negocio_id: "n", data: "2026-11-16", valor: 195.99, cliente: "A", canal: "outbound" },
    ]);
    expect(vendasGanhas([deal({ deal_id: "g1", canal: null, status: "won", stage_id: IS.ganho, valor: 1, fechado_em: "2026-11-16T17:00:05Z" })], [], en)).toEqual([]);
  });
});
