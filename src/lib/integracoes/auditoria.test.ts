import { describe, expect, it } from "vitest";
import { CRM_POR_NEGOCIO } from "./config";
import { dataDaReuniao, montarAuditoria } from "./auditoria";
import type { DealCrm, EventoCrm } from "./realizado";

const cfg = CRM_POR_NEGOCIO.vorp;
const AG = "722cd95f-5518-4fcf-8229-3bb4aea55a7d";
const NS = "7a9b0a1a-d5d5-44fb-91c8-2c13488df211";
const GANHO = "966ae249-0035-4120-ba6d-a3ff6db881ad";
const CONECTADO = "88feb540-1cf4-40df-858c-ea52be78ad42";
const etapas = new Map([
  [AG, { nome: "Reunião Agendada", funil: "[Vorp] Outbound" }],
  [NS, { nome: "No Show", funil: "[Vorp] Outbound" }],
  [GANHO, { nome: "Ganho", funil: "[Vorp] Outbound" }],
  [CONECTADO, { nome: "Conectado", funil: "[Vorp] Outbound" }],
]);
const deal = (p: Partial<DealCrm> & { deal_id: string }): DealCrm & { seq: number } => ({
  canal: "outbound", faturamento: null, cargo: null, status: "open", stage_id: null, valor: 0, mrr: null, nome: p.deal_id, empresa: null,
  produtos: null, responsavel_user_id: "u-jorge", closer_user_id: null, sdr_user_id: null, criado_em: "2026-11-01T12:00:00Z", fechado_em: null, seq: 1, ...p,
});
const ev = (deal_id: string, stage_id: string, ocorrido_em: string): EventoCrm => ({ deal_id, stage_id, ocorrido_em, tipo: "STAGE_CHANGED" });

describe("dataDaReuniao", () => {
  it("Acrópole: reuniao_agendada", () => {
    expect(dataDaReuniao({ reuniao_agendada: "19/11/2026 14:00" })).toBe("19/11/2026 14:00");
  });
  it("Match: Data da Reunião (data_da_reuniao_1) e a mais recente quando há mais de uma", () => {
    expect(dataDaReuniao({ data_da_reuniao_1: "2026-11-19T16:00" })).toBe("2026-11-19T16:00");
    expect(dataDaReuniao({ data_da_reuniao_1: "2026-11-10T16:00", data_da_reuniao_2: "2026-11-19T10:00" })).toBe("2026-11-19T10:00");
    expect(dataDaReuniao({ data_da_reuniao_1: "2026-11-10T16:00", data_da_reuniao_2: "" })).toBe("2026-11-10T16:00");
    expect(dataDaReuniao({})).toBeNull();
  });
});

describe("base da auditoria", () => {
  const deals = [
    deal({ deal_id: "real", stage_id: GANHO }),
    deal({ deal_id: "ns", stage_id: NS }),
    deal({ deal_id: "cancel", status: "lost", stage_id: "perda" }),
    deal({ deal_id: "futura", stage_id: AG }),
    deal({ deal_id: "so-conectado", stage_id: CONECTADO }),
    deal({ deal_id: "outro-canal", canal: "social_selling", stage_id: AG }),
  ];
  const eventos = [
    ev("real", AG, "2026-11-05T13:00:00Z"),
    ev("real", NS, "2026-11-06T13:00:00Z"),
    ev("real", AG, "2026-11-08T13:00:00Z"),
    ev("real", GANHO, "2026-11-09T13:00:00Z"),
    ev("ns", AG, "2026-11-05T13:00:00Z"),
    ev("ns", NS, "2026-11-06T13:00:00Z"),
    ev("cancel", AG, "2026-11-05T13:00:00Z"),
    ev("futura", AG, "2026-11-15T13:00:00Z"),
    ev("so-conectado", CONECTADO, "2026-11-05T13:00:00Z"),
    ev("outro-canal", AG, "2026-11-05T13:00:00Z"),
  ];
  const leads = montarAuditoria({
    deals,
    extras: new Map([["real", { properties: { temperatura: "quente", reuniao_agendada: "2026-11-09T10:00" }, tags: [{ name: "Outbound" }] }]]),
    eventos,
    cfg,
    etapas,
    responsaveis: new Map([["real", [["2026-11-05T13:00:00Z", "u-vini"], ["2026-11-09T13:00:01Z", "u-jorge"]]]]),
    vendedores: new Map(),
    nomes: { "u-vini": "Vinícius", "u-jorge": "Jorge" },
  });
  const por = (id: string) => leads.find((l) => l.id === id);

  it("só leads de canal do negócio que chegaram a Reunião Agendada", () => {
    expect(leads.map((l) => l.id).sort()).toEqual(["cancel", "futura", "ns", "real"]);
  });

  it("situação: realizada vence o no-show; no-show sem realizar; perdido antes = cancelada; senão a acontecer", () => {
    expect(por("real")?.situacao).toBe("realizada");
    expect(por("ns")?.situacao).toBe("no_show");
    expect(por("cancel")?.situacao).toBe("cancelada");
    expect(por("futura")?.situacao).toBe("a_acontecer");
  });

  it("marcos com a regra do Dashboard, pré-vendas de quem agendou e o caminho com o responsável de cada passo", () => {
    const r = por("real")!;
    expect(r.agendadaEm).toBe("2026-11-05T13:00:00Z"); // primeira vez (remarcar não conta de novo)
    expect(r.realizadaEm).toBe("2026-11-09T13:00:00Z");
    expect(r.preVendas).toBe("Vinícius");
    expect(r.temperatura).toBe("quente");
    expect(r.tags).toEqual(["Outbound"]);
    expect(r.passos.map((p) => `${p.etapa}:${p.quem}`)).toEqual(["Reunião Agendada:Vinícius", "No Show:Vinícius", "Reunião Agendada:Vinícius", "Ganho:Vinícius"]);
  });
});

describe("base da auditoria: Inbound completo, sem lead falso, venda só com ganho", () => {
  it("inclui o lead do Inbound que só entrou, tira o lead falso e não conta venda desfeita", async () => {
    const { montarAuditoria } = await import("./auditoria");
    const { CRM_POR_NEGOCIO } = await import("./config");
    const cfg = CRM_POR_NEGOCIO.vorp;
    const base = { faturamento: null, cargo: null, valor: 0, mrr: null, empresa: null, produtos: null, closer_user_id: null, sdr_user_id: null, fechado_em: null, stage_id: null };
    const deals = [
      { ...base, deal_id: "novo", nome: "Só entrou", canal: "trafego", status: "open", criado_em: "2026-11-05T12:00:00Z", responsavel_user_id: "jorge", faturamento: "entre_400_mil_e_1_milhao", cargo: "diretor" },
      { ...base, deal_id: "falso", nome: "Falso", canal: "trafego", status: "lost", criado_em: "2026-11-05T12:00:00Z", responsavel_user_id: "jorge", motivo_perda: "Lead Falso" },
      { ...base, deal_id: "frio", nome: "Outbound sem reunião", canal: "outbound", status: "open", criado_em: "2026-11-05T12:00:00Z", responsavel_user_id: "ryq" },
      { ...base, deal_id: "desfeita", nome: "Venda desfeita", canal: "outbound", status: "open", criado_em: "2026-11-01T12:00:00Z", responsavel_user_id: "ryq" },
    ];
    const eventos = [
      { deal_id: "desfeita", stage_id: "722cd95f-5518-4fcf-8229-3bb4aea55a7d", ocorrido_em: "2026-11-02T12:00:00Z" },
      { deal_id: "desfeita", stage_id: "cmq9wwt8l024a41npns90puld", ocorrido_em: "2026-11-10T12:00:00Z" },
    ];
    const leads = montarAuditoria({ deals: deals as never, extras: new Map(), eventos, cfg, etapas: new Map(), responsaveis: new Map(), vendedores: new Map(), nomes: { jorge: "Jorge", ryq: "Marcus" } });
    expect(leads.map((l) => l.nome).sort()).toEqual(["Só entrou", "Venda desfeita"]);
    const novo = leads.find((l) => l.nome === "Só entrou")!;
    expect(novo).toMatchObject({ agendadaEm: null, criadoEm: "2026-11-05T12:00:00Z", mql: true, preVendas: "Jorge" });
    expect(leads.find((l) => l.nome === "Venda desfeita")!.vendaEm).toBeNull();
  });
});

describe("BANT com o texto do CRM", () => {
  it("usa o rótulo da opção (com acento e descrição) quando a sincronização passa os rótulos", async () => {
    const { montarAuditoria } = await import("./auditoria");
    const { CRM_POR_NEGOCIO } = await import("./config");
    const cfg = CRM_POR_NEGOCIO.vorp;
    const deal = { deal_id: "x", nome: "Lead", canal: "outbound", status: "open", criado_em: "2026-11-01T12:00:00Z", responsavel_user_id: "r", faturamento: "entre_30_e_100_mil", cargo: "proprietario", valor: 0, mrr: null, empresa: null, produtos: null, closer_user_id: null, sdr_user_id: null, fechado_em: null, stage_id: null };
    const eventos = [{ deal_id: "x", stage_id: "722cd95f-5518-4fcf-8229-3bb4aea55a7d", ocorrido_em: "2026-11-02T12:00:00Z" }];
    const extras = new Map([["x", { properties: { bant_timing: "alta_prioridade", bant_necessidade: "Gerar demanda" } }]]);
    const rotulos = {
      quanto_sua_empresa_fatura_por_mes: { entre_30_e_100_mil: "Entre 30 e 100 mil" },
      qual_seu_cargo_atual: { proprietario: "Proprietário" },
      bant_timing: { alta_prioridade: "Alta prioridade (agora ou até 15 dias)" },
    };
    const [l] = montarAuditoria({ deals: [deal] as never, extras, eventos, cfg, etapas: new Map(), responsaveis: new Map(), vendedores: new Map(), nomes: {}, rotulos });
    expect(l).toMatchObject({ faturamentoRotulo: "Entre 30 e 100 mil", cargoRotulo: "Proprietário", necessidade: "Gerar demanda", timingRotulo: "Alta prioridade (agora ou até 15 dias)" });
  });
});
