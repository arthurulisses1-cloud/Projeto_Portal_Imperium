import { describe, expect, it } from "vitest";
import { lerDataReuniao, mesesPagosDaVenda, mesmaPessoa, montarCarteira, resumirReunioes, somaMesesData, somarPreVendas, statusRqa, tabelaDiaria, usuarioCrmDoPerfil } from "./sdr-negocio";
import { calcularPace } from "./pace-negocio";
import type { LeadAuditoria } from "./integracoes/auditoria";

const lead = (p: Partial<LeadAuditoria>): LeadAuditoria =>
  ({
    id: Math.random().toString(36).slice(2),
    seq: null,
    nome: "Lead",
    empresa: null,
    canal: "outbound",
    status: "open",
    etapa: "",
    funil: "",
    responsavel: null,
    preVendas: "Jorge Abudi",
    closer: "Arthur Ulisses",
    vendedor: null,
    faturamento: null,
    cargo: null,
    necessidade: null,
    timing: null,
    rqa: null,
    temperatura: null,
    valor: 0,
    mrr: null,
    produtos: null,
    previsao: null,
    motivoPerda: null,
    tags: [],
    reuniaoMarcada: null,
    agendadaEm: null,
    realizadaEm: null,
    propostaEm: null,
    vendaEm: null,
    noShowEm: null,
    perdidaEm: null,
    situacao: "a_acontecer",
    passos: [],
    ...p,
  }) as LeadAuditoria;

describe("nomes portal x Pipefácil", () => {
  it("casa primeiro nome e último sobrenome, sem acento", () => {
    expect(mesmaPessoa("Vinícius Ferreira", "Vinicius Anastácio Ferreira")).toBe(true);
    expect(mesmaPessoa("Marcus Ryquelme", "Marcus Ryquelme")).toBe(true);
    expect(mesmaPessoa("Marcus Ryquelme", "Marcus Silva")).toBe(false);
  });
  it("prefere o vínculo por e-mail e recusa nome ambíguo", () => {
    const nomes = { u1: "Jorge Abudi", u2: "Jorge da Silva Abudi" };
    expect(usuarioCrmDoPerfil({ u2: "p1" }, nomes, "p1", "Jorge Abudi")).toBe("u2");
    expect(usuarioCrmDoPerfil(null, nomes, "p1", "Jorge Abudi")).toBeNull();
    expect(usuarioCrmDoPerfil(null, { u1: "Jorge Abudi" }, "p1", "Jorge Abudi")).toBe("u1");
  });
});

describe("RQA e no-show", () => {
  it("lê o campo do closer", () => {
    expect(statusRqa("Sim")).toBe("validada");
    expect(statusRqa("true")).toBe("validada");
    expect(statusRqa("Não")).toBe("recusada");
    expect(statusRqa(null)).toBe("aguardando");
  });
  it("conta no-show sobre as reuniões do mês com desfecho e paga RQA validada pelo canal", () => {
    const leads = [
      lead({ agendadaEm: "2026-11-03T13:00:00Z", realizadaEm: "2026-11-05T15:00:00Z", situacao: "realizada", rqa: "sim" }),
      lead({ agendadaEm: "2026-11-04T13:00:00Z", realizadaEm: "2026-11-06T15:00:00Z", situacao: "realizada", canal: "inbound" }),
      lead({ agendadaEm: "2026-11-04T13:00:00Z", situacao: "no_show" }),
      lead({ agendadaEm: "2026-11-10T13:00:00Z", situacao: "a_acontecer" }),
      lead({ agendadaEm: "2026-11-10T13:00:00Z", situacao: "no_show", preVendas: "Outro" }),
      // agendada em outubro, realizada em novembro: entra na RQA de novembro, não no no-show
      lead({ agendadaEm: "2026-10-30T13:00:00Z", realizadaEm: "2026-11-03T15:00:00Z", situacao: "realizada", rqa: "não" }),
    ];
    const r = resumirReunioes(leads, "Jorge Abudi", "vorp", 2026, 11);
    expect(r.noShow).toEqual({ qtd: 1, base: 3, pct: 1 / 3 });
    expect(r.realizadas).toHaveLength(3);
    expect(r.rqa).toEqual({ validadas: 1, aguardando: 1, recusadas: 1, valorValidado: 20, valorAguardando: 10 });
  });
  it("usa a data de Brasília (23h de 30/11 em BRT ainda é novembro)", () => {
    const r = resumirReunioes([lead({ realizadaEm: "2026-12-01T02:00:00Z", situacao: "realizada" })], "Jorge Abudi", "vorp", 2026, 11);
    expect(r.realizadas).toHaveLength(1);
  });
});

describe("reuniões a acontecer", () => {
  it("lê a data da reunião em ISO ou no formato brasileiro", () => {
    expect(lerDataReuniao("2026-11-20T17:00:00.000Z")).toBe("2026-11-20T17:00:00.000Z");
    expect(lerDataReuniao("20/11/2026 14:00")).toBe("2026-11-20T17:00:00.000Z");
    expect(lerDataReuniao("2026-11-20")).toBe("2026-11-20T03:00:00.000Z");
    expect(lerDataReuniao("quinta à tarde")).toBeNull();
  });
  it("lista as dele ainda por acontecer, da mais próxima para a mais distante, sem data por último", () => {
    const r = resumirReunioes(
      [
        lead({ nome: "Sem data", situacao: "a_acontecer", reuniaoMarcada: "a combinar" }),
        lead({ nome: "Dia 25", situacao: "a_acontecer", reuniaoMarcada: "25/11/2026 10:00" }),
        lead({ nome: "Dia 19", situacao: "a_acontecer", reuniaoMarcada: "2026-11-19T13:00:00Z" }),
        lead({ nome: "Realizada", situacao: "realizada" }),
        lead({ nome: "De outro", situacao: "a_acontecer", preVendas: "Outro" }),
      ],
      "Jorge Abudi",
      "vorp",
      2026,
      11,
    );
    expect(r.aAcontecer.map((x) => x.nome)).toEqual(["Dia 19", "Dia 25", "Sem data"]);
    expect(r.aAcontecer[2].quandoTexto).toBe("a combinar");
  });
});

describe("tabela diária", () => {
  it("meta do dia só em dia útil e acumulado corrido até hoje", () => {
    // novembro/2026: 19 dias úteis (feriados 02, 15 (dom) e 20)
    const { linhas, total } = tabelaDiaria([{ chave: "a", label: "A", meta: 19, datas: ["2026-11-03", "2026-11-03", "2026-11-04"] }], 2026, 11, "2026-11-04");
    expect(linhas).toHaveLength(30);
    expect(linhas[0]).toMatchObject({ data: "2026-11-01", util: false });
    expect(linhas[1].celulas[0]).toEqual({ real: 0, meta: 0, acum: 0 }); // 02/11 feriado
    expect(linhas[2].celulas[0]).toEqual({ real: 2, meta: 1, acum: 1 });
    expect(linhas[3].celulas[0]).toEqual({ real: 1, meta: 1, acum: 1 });
    expect(linhas[4].celulas[0].acum).toBeNull(); // futuro
    expect(total[0].real).toBe(3);
    expect(total[0].meta).toBeCloseTo(19);
    expect(total[0].acum).toBe(1);
  });
});

describe("carteira de recorrência", () => {
  it("agrupa por cliente, usa o último MRR e marca ativo pelo último lançamento", () => {
    const base = { crm_deal_id: null, canal: "outbound", primeiro_contrato: true, valor: 1000 };
    const c = montarCarteira(
      [
        { ...base, data: "2026-09-10", cliente: "ACME", mrr: 1000, profile_id: "c", indicador_id: "me" },
        { ...base, data: "2026-11-10", cliente: "Acme ", mrr: 1200, profile_id: "c", indicador_id: "me" },
        { ...base, data: "2026-08-10", cliente: "Velha", mrr: 500, profile_id: "me", indicador_id: null },
        { ...base, data: "2026-11-01", cliente: "De outro", mrr: 500, profile_id: "x", indicador_id: "y" },
      ],
      "me",
      "2026-11-17",
      (papel) => (papel === "sdr" ? 3 : 4),
    );
    expect(c.map((x) => [x.cliente, x.ativo, x.mrr, x.porMes, x.papel])).toEqual([
      ["ACME", true, 1200, 36, "sdr"],
      ["Velha", false, 500, 20, "closer"],
    ]);
    expect(c[0].recebidoNoMes).toBe(1000);
  });
});

describe("somarPreVendas", () => {
  const ind = (meta: number, datas: string[]) => ({
    pace: calcularPace({ meta, recebido: datas.length, hoje: "2026-11-18", ano: 2026, mes: 11 }),
    canais: [],
    leads: datas.map((data) => ({ nome: "L", data, responsavel: null, preVendas: null })),
  });
  const pv = (id: string, a: [number, string[]], r: [number, string[]], v: [number, string[]]) => ({
    id,
    nome: id,
    indicadores: { reunioes_agendadas: ind(...a), reunioes_realizadas: ind(...r), vendas: ind(...v) },
    ideal: { realizadas: null, vendas: null },
  });
  it("soma metas e junta os leads de todos os SDRs", () => {
    const soma = somarPreVendas(
      [pv("a", [10, ["2026-11-03", "2026-11-05"]], [5, ["2026-11-04"]], [1, []]), pv("b", [20, ["2026-11-03"]], [8, []], [2, ["2026-11-10"]])],
      { ano: 2026, mes: 11, hoje: "2026-11-18" },
    );
    expect(soma.indicadores.reunioes_agendadas.pace.meta).toBe(30);
    expect(soma.indicadores.reunioes_agendadas.pace.recebido).toBe(3);
    expect(soma.indicadores.reunioes_agendadas.leads?.map((l) => l.data)).toEqual(["2026-11-03", "2026-11-03", "2026-11-05"]);
    expect(soma.indicadores.vendas.pace.recebido).toBe(1);
  });
});

describe("plano pago de uma vez (Match Sales)", () => {
  it("cruza o valor recebido com o MRR para achar os meses pagos", () => {
    expect(mesesPagosDaVenda({ valor: 715, mrr: 119.2 })).toBe(6);
    expect(mesesPagosDaVenda({ valor: 2700, mrr: 450 })).toBe(6);
    expect(mesesPagosDaVenda({ valor: 1267, mrr: 105 })).toBe(12);
    expect(mesesPagosDaVenda({ valor: 460, mrr: 421.67 })).toBe(1);
    expect(mesesPagosDaVenda({ valor: 179, mrr: 179 })).toBe(1);
  });
  it("tira o setup antes de comparar e aceita a dica do nome do plano", () => {
    expect(mesesPagosDaVenda({ valor: 3100 + 600 * 5, mrr: 600, valor_implantacao: 2500 })).toBe(6);
    expect(mesesPagosDaVenda({ valor: 650, mrr: 119.2, produto: "plano_solo semestral" })).toBe(6);
    expect(mesesPagosDaVenda({ valor: 1000, mrr: null })).toBe(1);
  });
  it("soma meses a uma data", () => {
    expect(somaMesesData("2026-11-09", 6)).toBe("2027-05-09");
    expect(somaMesesData("2026-08-31", 6)).toBe("2027-02-28");
  });
  it("carteira: contrato semestral pago à vista não gera recorrência até o fim do período", () => {
    const venda = { data: "2026-11-09", cliente: "JM Veiculos", crm_deal_id: "d", mrr: 119.2, valor: 715, canal: "outbound", profile_id: "p", indicador_id: "p", primeiro_contrato: true };
    const [c] = montarCarteira([venda], "p", "2026-11-18", () => 10, true);
    expect(c.mesesPagos).toBe(6);
    expect(c.antecipado).toBe(true);
    expect(c.ativo).toBe(false);
    expect(c.pagoAte).toBe("2027-05-09");
    // Depois do período pago, volta ao critério normal (lançamento no mês atual ou anterior).
    const [depois] = montarCarteira([venda, { ...venda, data: "2027-05-10" }], "p", "2027-05-12", () => 10, true);
    expect(depois.antecipado).toBe(false);
    expect(depois.ativo).toBe(true);
    // Sem a detecção (Vorp), nada muda.
    expect(montarCarteira([venda], "p", "2026-11-18", () => 10)[0].antecipado).toBe(false);
  });
});

describe("Tipo de Contrato manda no plano", () => {
  it("Semestral/Anual só contam como pagos se o recebido cobre o período", () => {
    expect(mesesPagosDaVenda({ valor: 715, mrr: 119.2, tipo_contrato: "Semestral" })).toBe(6);
    expect(mesesPagosDaVenda({ valor: 119.2, mrr: 119.2, tipo_contrato: "Semestral" })).toBe(1); // semestral pago mês a mês
    expect(mesesPagosDaVenda({ valor: 1267, mrr: 105, tipo_contrato: "Anual" })).toBe(12);
  });
  it("Mensal é sempre 1, mesmo que o valor lembre um semestre", () => {
    expect(mesesPagosDaVenda({ valor: 715, mrr: 119.2, tipo_contrato: "Mensal" })).toBe(1);
  });
});
