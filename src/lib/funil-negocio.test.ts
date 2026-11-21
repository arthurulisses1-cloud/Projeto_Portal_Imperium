import { describe, expect, it } from "vitest";
import { funisDoMes } from "./funil-negocio";

describe("funisDoMes", () => {
  it("MatchSales e Energy têm 3 canais (com indicação); Finance tem 2", () => {
    expect(funisDoMes("matchsales", 2026, 12).map((f) => f.canal)).toEqual(["outbound", "inbound", "indicacao"]);
    expect(funisDoMes("vorp-finance", 2026, 12).map((f) => f.canal)).toEqual(["outbound", "inbound"]);
    expect(funisDoMes("vorp-energy", 2026, 12).map((f) => f.canal)).toEqual(["outbound", "inbound", "indicacao"]);
  });
  it("volume inicial e conversões do forecast (outbound MatchSales, mês cheio)", () => {
    const e = funisDoMes("matchsales", 2026, 12)[0].etapas;
    expect(e[1]).toMatchObject({ label: "Alôs", meta: 5280 });
    expect(e[2].meta).toBeCloseTo(792);
    expect(e[e.length - 1].label).toBe("Vendas");
  });
  it("novembro aplica ramp-up de 50%", () => {
    expect(funisDoMes("vorp", 2026, 11)[0].etapas[1].meta).toBe(1980);
  });
  it("com discador (Acrópole e Galáticos): Tentativas antes de Alôs, meta = alôs ÷ 15% e conversão ideal de 15%", () => {
    for (const slug of ["vorp", "matchsales"]) {
      const [t, a] = funisDoMes(slug, 2026, 11)[0].etapas;
      expect(t).toMatchObject({ chave: "tentativas", label: "Tentativas", conversaoMeta: null });
      expect(a).toMatchObject({ chave: "alos", conversaoMeta: 0.15 });
      expect(t.meta).toBeCloseTo((a.meta as number) / 0.15);
    }
    expect(funisDoMes("matchsales", 2026, 11)[0].etapas[0].meta).toBeCloseTo(17600); // 2.640 alôs ÷ 15%
    // Sem discador, o funil não muda
    expect(funisDoMes("vorp-finance", 2026, 12)[0].etapas.map((x) => x.chave)).not.toContain("tentativas");
    expect(funisDoMes("vorp-energy", 2026, 12)[0].etapas[0].chave).toBe("alos");
  });
  it("rótulos próprios: Finance com Entrevistas/Subidos, Energy com Contas subidas", () => {
    expect(funisDoMes("vorp-finance", 2026, 12)[0].etapas.map((x) => x.label)).toEqual(["Entrevistas", "Subidos", "Vendas"]);
    const fin = funisDoMes("vorp-finance", 2026, 12)[0].etapas;
    expect(fin[0].conversaoMeta).toBeNull();
    expect(fin[0].meta).toBeCloseTo(3960 * 0.15 * 0.25 * 0.7); // 104,0 entrevistas
    expect(fin[1].conversaoMeta).toBe(0.7);
    expect(fin[2].conversaoMeta).toBe(0.2);
    expect(funisDoMes("vorp-energy", 2026, 12)[1].etapas.map((x) => x.label)).toContain("Contas subidas");
  });
  it("sem forecast antes de novembro", () => {
    expect(funisDoMes("vorp", 2026, 10)).toEqual([]);
  });
});

describe("funil por pré-vendas", () => {
  it("com pessoa escolhida, só os números dela (inclusive alôs do 3C) e a meta dividida pelo time do canal", async () => {
    const { montarFunisDaVisao, etapasIntegradas, pessoasDoCanal, leadsPorQualificacao } = await import("./funil-negocio");
    const linhas = [
      { canal: "outbound", etapa: "alos", quantidade: 30 },
      { canal: "outbound", etapa: "pv:marcus:alos", quantidade: 20 },
      { canal: "outbound", etapa: "pv:vini:alos", quantidade: 10 },
      { canal: "outbound", etapa: "reunioes_agendadas", quantidade: 5 },
      { canal: "outbound", etapa: "pv:marcus:reunioes_agendadas", quantidade: 3 },
      { canal: "outbound", etapa: "pv:vini:reunioes_agendadas", quantidade: 2 },
      { canal: "inbound", etapa: "leads", quantidade: 7 },
      { canal: "inbound", etapa: "pv:jorge:leads", quantidade: 7 },
      { canal: "inbound", etapa: "mql:leads", quantidade: 2 },
      { canal: "inbound", etapa: "pv:jorge:mql:leads", quantidade: 2 },
    ];
    const base = funisDoMes("vorp", 2026, 11);
    const time = montarFunisDaVisao(base, linhas, etapasIntegradas("vorp"), new Map(), "todos", "completo");
    const marcus = montarFunisDaVisao(base, linhas, etapasIntegradas("vorp"), new Map(), "todos", "completo", { outbound: { id: "marcus", divisor: 3 } });
    const out = (f: typeof time, k: string) => f.find((x) => x.canal === "outbound")!.etapas.find((e) => e.chave === k)!;
    expect(out(time, "alos").realizado).toBe(30);
    expect(out(marcus, "alos").realizado).toBe(20);
    expect(out(marcus, "reunioes_agendadas").realizado).toBe(3);
    expect(out(marcus, "alos").meta).toBeCloseTo(1980 / 3);
    // o Inbound continua do time quando só o Outbound tem pessoa escolhida
    expect(marcus.find((x) => x.canal === "inbound")!.etapas[0].realizado).toBe(7);
    expect(pessoasDoCanal(linhas, "outbound").sort()).toEqual(["marcus", "vini"]);
    expect(pessoasDoCanal(linhas, "inbound")).toEqual(["jorge"]);
    expect(leadsPorQualificacao(linhas, "todos", "jorge")).toEqual({ completo: 7, mql: 2, nao_mql: 0 });
    // Visão do time: tentativas, alôs e conexões trazem o realizado de cada pré-vendas, do maior para o menor;
    // etapas do CRM não (já têm a lista de leads). Com a pessoa escolhida, não há lista por pessoa.
    expect(out(time, "alos").porPessoa).toEqual([
      { id: "marcus", quantidade: 20 },
      { id: "vini", quantidade: 10 },
    ]);
    expect(out(time, "reunioes_agendadas").porPessoa).toBeUndefined();
    expect(out(marcus, "alos").porPessoa).toBeUndefined();
  });

  it("funil completo do Inbound: metas proporcionais (referência) a partir dos Leads; Não MQL compara com o MQL", async () => {
    const { montarFunisDaVisao, etapasIntegradas } = await import("./funil-negocio");
    for (const slug of ["matchsales", "vorp"]) {
      const base = funisDoMes(slug, 2026, 11);
      const visao = (q: "completo" | "mql" | "nao_mql") =>
        montarFunisDaVisao(base, [], etapasIntegradas(slug), new Map(), "todos", q).find((f) => f.canal === "inbound")!.etapas;
      const et = (q: "completo" | "mql" | "nao_mql", k: string) => visao(q).find((e) => e.chave === k)!;
      const leads = et("completo", "leads").meta!;
      // MQL: a meta oficial do forecast, sem marcação de referência.
      expect(et("mql", "conectados").metaReferencia).toBeUndefined();
      expect(et("mql", "conectados").conversaoReferencia).toBeUndefined();
      // Completo: leads e MQL do forecast; de conectados em diante, as conversões do MQL aplicadas a todos os leads.
      expect(et("completo", "mql").meta).toBe(et("mql", "leads").meta);
      expect(et("completo", "mql").metaReferencia).toBeUndefined();
      const conv = (k: string) => et("mql", k).conversaoMeta!;
      expect(et("completo", "conectados").conversaoDe).toBe("leads");
      expect(et("completo", "conectados").conversaoMeta).toBe(conv("conectados"));
      expect(et("completo", "conectados").meta).toBeCloseTo(leads * conv("conectados"));
      expect(et("completo", "reunioes_agendadas").meta).toBeCloseTo(leads * conv("conectados") * conv("reunioes_agendadas"));
      expect(et("completo", "vendas").metaReferencia).toBe(true);
      expect(et("completo", "vendas").meta!).toBeGreaterThan(et("mql", "vendas").meta!);
      // Não MQL: sem meta de volume; conversões do MQL só para comparação.
      expect(visao("nao_mql").every((e) => e.meta === null)).toBe(true);
      expect(et("nao_mql", "conectados").conversaoMeta).toBe(conv("conectados"));
      expect(et("nao_mql", "conectados").conversaoReferencia).toBe(true);
    }
    // Galáticos, novembro (rampa de 50%): 220 leads → 176 conectados → 52,8 agendadas.
    const ms = montarFunisDaVisao(funisDoMes("matchsales", 2026, 11), [], etapasIntegradas("matchsales"), new Map(), "todos", "completo").find((f) => f.canal === "inbound")!;
    expect(ms.etapas.find((e) => e.chave === "conectados")!.meta).toBeCloseTo(176);
    expect(ms.etapas.find((e) => e.chave === "reunioes_agendadas")!.meta).toBeCloseTo(52.8);
  });
});
