import { describe, expect, it } from "vitest";
import { montarAlternativas } from "./dashboard-negocio";
import { funisDoMes, funisOcasionais } from "./funil-negocio";
import { CRM_POR_NEGOCIO } from "./integracoes/config";
import { leadsDoRealizado, vendasGanhas, type DealCrm, type EventoCrm } from "./integracoes/realizado";
import { montarAuditoria } from "./integracoes/auditoria";
import { montarEsforco } from "./pace-esforco";
import { resumirDesfechoAgendadas } from "./desfecho-agendadas";
import { RQA_VALOR, resumirReunioes } from "./sdr-negocio";

const cfg = CRM_POR_NEGOCIO.vorp;
const MARCUS = "7d0660e3-9acb-4266-93db-cfdee71e2289";
const EV = { agendada: "e55c62a2-f796-4cfb-b6bb-49d8cca75b5a", noShow: "ccfe944e-0d1e-4626-9cde-a5b1f6cbf387", ganho: "e153adab-aef7-44ca-a4b6-669b2e630b1d", reuniaoVendas: "cmq9wwt8l024541npexvflx5e" };
const lead = (x: Partial<DealCrm>): DealCrm => ({
  deal_id: "a", canal: "eventos", faturamento: null, cargo: null, status: "open", stage_id: EV.agendada, valor: 0, mrr: null, nome: "Lead Teste", empresa: null, produtos: null,
  responsavel_user_id: MARCUS, closer_user_id: null, sdr_user_id: MARCUS, criado_em: "2026-11-19T15:00:00Z", fechado_em: null, ...x,
});
const ev = (deal_id: string, stage_id: string, ocorrido_em: string): EventoCrm => ({ deal_id, stage_id, ocorrido_em, tipo: "STAGE_CHANGED" });
const deals = [lead({ stage_id: EV.reuniaoVendas }), lead({ deal_id: "b", nome: "Faltou", stage_id: EV.noShow })];
const eventos = [
  ev("a", EV.agendada, "2026-11-19T15:09:00Z"), ev("a", EV.ganho, "2026-11-23T14:49:49Z"), ev("a", EV.reuniaoVendas, "2026-11-23T14:49:51Z"),
  ev("b", EV.agendada, "2026-11-19T16:00:00Z"), ev("b", EV.noShow, "2026-11-20T16:00:00Z"),
];
const etapas = new Map([[EV.noShow, { nome: "No Show", funil: "[Vorp] Listas Eventos" }], [EV.reuniaoVendas, { nome: "Reunião Realizada", funil: "[Vorp] Funil de Vendas" }]]);

describe("canal Eventos (Acrópole)", () => {
  const itens = leadsDoRealizado(deals, eventos, cfg, "2026-11-01", "2026-12-01");
  const auditoria = montarAuditoria({ deals, eventos, cfg, etapas, extras: new Map([["a", { properties: { rqa_validada: "sim" } }]]), responsaveis: new Map(), vendedores: new Map(), nomes: { [MARCUS]: "Marcus Ryquelme" } });

  it("conta agendadas e realizadas no próprio canal, sem tocar no Outbound", () => {
    expect(itens.filter((i) => i.etapa === "reunioes_agendadas").map((i) => i.canal)).toEqual(["eventos", "eventos"]);
    expect(itens.filter((i) => i.etapa === "reunioes_realizadas").map((i) => i.deal.nome)).toEqual(["Lead Teste"]);
  });
  it("entra na Auditoria, no no-show e na RQA de quem agendou", () => {
    const r = resumirReunioes(auditoria, "Marcus Ryquelme", "vorp", 2026, 11, "2026-11-23");
    expect(r.noShow).toEqual({ qtd: 1, base: 2, pct: 0.5 });
    expect(r.rqa.validadas).toBe(1);
    const d = resumirDesfechoAgendadas(itens.filter((i) => i.etapa === "reunioes_agendadas").map((i) => ({ id: i.deal.deal_id, nome: i.deal.nome!, responsavel: null, preVendas: null, data: i.data })), auditoria, "2026-11-23");
    expect(d?.qtd).toMatchObject({ realizadas: 1, noShow: 1 });
  });
  it("soma no pace do time e da pessoa, sem mudar a meta", () => {
    const linhas = [{ canal: "eventos", etapa: "reunioes_agendadas", quantidade: 2 }, { canal: "outbound", etapa: "reunioes_agendadas", quantidade: 1 }];
    const l = (canal: string) => ({ nome: "x", data: "2026-11-19", canal });
    const ranking = { reunioes_agendadas: [{ nome: "Marcus Ryquelme", total: 3, leads: [l("eventos"), l("eventos"), l("outbound")] }] };
    const ctx = { ano: 2026, mes: 11, hoje: "2026-11-23" };
    const com = montarEsforco("vorp", ctx, linhas, ranking, { [MARCUS]: "Marcus Ryquelme" });
    const sem = montarEsforco("vorp", ctx, [], null, { [MARCUS]: "Marcus Ryquelme" });
    const pessoa = (e: typeof com) => e.preVendas.find((p) => p.id === MARCUS)!.indicadores.reunioes_agendadas;
    expect(com.time.reunioes_agendadas.pace.recebido).toBe(3);
    expect(pessoa(com).pace.recebido).toBe(3);
    expect(pessoa(com).canais.find((c) => c.canal === "eventos")).toEqual({ canal: "eventos", meta: null, realizado: 2 });
    expect(pessoa(com).pace.meta).toBe(pessoa(sem).pace.meta);
  });
  it("venda do evento tem canal próprio", () => {
    const g = vendasGanhas([lead({ status: "won", stage_id: cfg.stagesGanhoVenda[0], fechado_em: "2026-11-25T12:00:00Z", valor: 100 })], [], cfg);
    expect(g[0]).toMatchObject({ canal: "eventos", canal_origem: null, valor: 100 });
  });
  it("o funil recolhido só existe no negócio que mapeia o canal e não entra no forecast", () => {
    expect(funisOcasionais("vorp").map((f) => f.canal)).toEqual(["eventos"]);
    expect(funisOcasionais("matchsales")).toEqual([]);
    expect(funisDoMes("vorp", 2026, 11).some((f) => f.canal === "eventos")).toBe(false);
  });
  it("o funil parte de todos os leads da lista, inclusive os sem contato ou sem conexão", () => {
    const ENTRADA = "9f148d6c-7ff5-43c9-b40a-895ba3e0fb66", SEM_CONEXAO = "150aa133-a018-406d-9d1f-7ab2acb514b7", CONECTADOS = "5c57fc8e-816e-413a-927d-07a4ecedd076";
    const lista = [...deals, lead({ deal_id: "c", stage_id: ENTRADA }), lead({ deal_id: "d", stage_id: SEM_CONEXAO }), lead({ deal_id: "e", stage_id: CONECTADOS })];
    const evs = [...eventos, ev("d", SEM_CONEXAO, "2026-11-20T12:00:00Z"), ev("e", CONECTADOS, "2026-11-20T12:00:00Z")];
    const todos = leadsDoRealizado(lista, evs, cfg, "2026-11-01", "2026-12-01");
    const n = (etapa: string) => todos.filter((i) => i.canal === "eventos" && i.etapa === etapa).length;
    expect(["leads", "conectados", "reunioes_agendadas", "reunioes_realizadas", "propostas", "vendas"].map(n)).toEqual([5, 3, 2, 1, 0, 0]);
    expect(funisOcasionais("vorp")[0].etapas.map((e) => e.chave)).toEqual(["leads", "conectados", "reunioes_agendadas", "reunioes_realizadas", "propostas", "vendas"]);
  });
  it("a venda do canal recolhido também aparece nas vendas alternativas", () => {
    const v = (id: string, canal: string | null, canal_origem: string | null = null) => ({ id, canal, canal_origem, valor: 100, mrr: 10, data: "2026-11-20", cliente: id, profile_id: null });
    const a = montarAlternativas([v("1", "outbound"), v("2", "alternativo", "network"), v("3", "eventos"), v("4", "alternativo", "eventos"), v("5", null)], new Map());
    expect(a).toMatchObject({ qtd: 3, valor: 300, mrr: 30 });
    expect(a.porCanal.map((c) => [c.canal, c.qtd])).toEqual([["eventos", 2], ["network", 1]]);
  });
  it("a RQA de Eventos vale o mesmo que a do inbound", () => {
    expect(RQA_VALOR.vorp.eventos).toBe(RQA_VALOR.vorp.inbound);
  });
});
