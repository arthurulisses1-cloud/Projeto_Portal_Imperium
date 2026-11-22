import { describe, expect, it } from "vitest";
import { agregar, enxugar, origemDaLista, type Ligacao } from "./esforco-3c";
import { contarAlosConexoes } from "./integracoes/tresc";

const bruta = (p: Record<string, unknown>) => ({
  call_date: "2026-11-10 10:15:00",
  agent: "Marcus Ryquelme",
  campaign: "Marcus Ryquelme",
  list: "Lista 1 - Ryquelme - Base Vorp - Base_Vorp_Pronta_3C_Plus.csv",
  status_id: 7,
  readable_status_text: "Finalizada",
  has_agent: true,
  speaking_with_agent_time: "00:01:10",
  qualification: "Conectado",
  is_conversion: false,
  is_dmc: false,
  number: "5585999999999",
  recording: "https://gravacao",
  ...p,
});

describe("esforço 3C Plus", () => {
  const brutas = [
    bruta({}),
    bruta({ speaking_with_agent_time: "00:00:20", qualification: "-" }),
    bruta({ agent: "Vinicius Ferreira", campaign: "Vinicius Ferreira", list: "Lista 1 - Vinicius - Advocacia (site #25).csv", call_date: "2026-11-11 14:00:00", is_conversion: true, is_dmc: true, speaking_with_agent_time: "00:03:00" }),
    // manual não atendida e falha: não são alô (regra do funil)
    bruta({ status_id: 5, readable_status_text: "Não Atendida", speaking_with_agent_time: "00:00:00" }),
    bruta({ status_id: 8, readable_status_text: "Falha", sip_cause: 480, speaking_with_agent_time: "00:00:00" }),
    // discador sem agente: ligação da campanha
    bruta({ agent: "-", has_agent: false, speaking_with_agent_time: "00:00:00", qualification: "-" }),
  ];
  const ligs: Ligacao[] = brutas.map(enxugar);

  it("não guarda telefone nem gravação", () => {
    expect(Object.keys(ligs[0])).not.toContain("number");
    expect(JSON.stringify(ligs)).not.toContain("5585999999999");
    expect(JSON.stringify(ligs)).not.toContain("gravacao");
  });

  it("alôs e conexões batem com a regra do funil (tresc.ts)", () => {
    const p = agregar("vorp", ligs, "2026-11-10", "2026-11-11", {}, 60);
    const funil = contarAlosConexoes(brutas as never, 60);
    expect(p.totais.alos).toBe(funil.alos);
    expect(p.totais.conexoes).toBe(funil.conexoes);
    expect(p.totais).toMatchObject({ ligacoes: 6, alos: 3, conexoes: 2, conversoes: 1, dmc: 1 });
    expect(p.porDia.map((d) => [d.dia, d.alos])).toEqual([["2026-11-10", 2], ["2026-11-11", 1]]);
    expect(p.porMotivoFalha).toEqual([{ nome: "Tocou e ninguém atendeu", ligacoes: 1 }]);
    expect(p.qualificacaoConexoes).toEqual([{ nome: "Conectado", ligacoes: 2 }]);
  });

  it("filtra por pré-vendas e mantém as opções do período", () => {
    const p = agregar("vorp", ligs, "2026-11-10", "2026-11-11", { agentes: ["Vinicius Ferreira"] }, 60);
    expect(p.totais).toMatchObject({ ligacoes: 1, alos: 1, conexoes: 1 });
    expect(p.porAgente.map((a) => a.agente)).toEqual(["Vinicius Ferreira"]);
    expect(p.opcoes.agentes).toEqual(["Marcus Ryquelme", "Vinicius Ferreira"]);
  });

  it("ranking por conexões, com mediana e média do tempo falado", () => {
    const p = agregar("vorp", ligs, "2026-11-10", "2026-11-11", {}, 60);
    const m = p.porAgente.find((a) => a.agente === "Marcus Ryquelme")!;
    expect(m).toMatchObject({ alos: 2, conexoes: 1, faladoTotal: 90, faladoMedio: 45, faladoMediano: 45 });
  });

  it("marca a origem da lista por B.U.", () => {
    expect(origemDaLista("vorp", "Lista 1 - Ryquelme - Base Vorp - x.csv")).toBe("Tráfego Pago");
    expect(origemDaLista("matchsales", "Lista 2 - Leonardo - Base Vorp - x.csv")).toBe("Tráfego Pago Vorp");
    expect(origemDaLista("matchsales", "[Reciclada] Lista 1 - Leonardo - Leads Perdidos Inbound Match Sales")).toBe("Tráfego Pago");
    expect(origemDaLista("vorp", "Lista 1 - Vinicius - Advocacia (site #25).csv")).toBeNull();
  });
});

describe("utilização do pré-vendas", () => {
  it("tempo ativo = esperando + falando + pós-ligação, filtrando pelos agentes", async () => {
    const { somarAtividade } = await import("./esforco-3c");
    const linhas = [
      { agenteId: 1, esperando: 600, falando: 1200, pos: 300 },
      { agenteId: 2, esperando: 100, falando: 50, pos: 10 },
    ];
    expect(somarAtividade(linhas, null)).toEqual({ esperando: 700, falando: 1250, pos: 310, ativo: 2260 });
    expect(somarAtividade(linhas, new Set([1]))).toEqual({ esperando: 600, falando: 1200, pos: 300, ativo: 2100 });
  });
});

describe("performance por pré-vendas e diagnóstico (versão nova do painel antigo)", () => {
  it("dono da campanha pelo nome", async () => {
    const { donoDaCampanha } = await import("./esforco-3c");
    const ag = ["Jorge Abudi", "Marcus Ryquelme", "Matheus", "Vinicius Ferreira"];
    expect(donoDaCampanha("Jorge Abudi - Rastreamento", ag)).toBe("Jorge Abudi");
    expect(donoDaCampanha("Matheus Mesquita", ag)).toBe("Matheus");
    expect(donoDaCampanha("Vinícius Ferreira", ag)).toBe("Vinicius Ferreira");
    expect(donoDaCampanha("Campanha Geral", ag)).toBeNull();
  });

  it("tentativa sem agente vai para o dono da campanha; filtro de pré-vendas leva as tentativas dele", async () => {
    const { agregar, enxugar } = await import("./esforco-3c");
    const b = (p: Record<string, unknown>) =>
      enxugar({ call_date: "2026-11-10 10:00:00", agent: "Marcus Ryquelme", agent_id: 1, campaign: "Marcus Ryquelme", campaign_id: 10, status_id: 7, has_agent: true, speaking_with_agent_time: "00:01:30", ...p });
    const ligs = [
      b({}),
      b({ agent: "-", agent_id: null, has_agent: false, status_id: 9, speaking_with_agent_time: "00:00:00" }),
      b({ agent: "-", agent_id: null, has_agent: false, status_id: 8, sip_cause: 603, speaking_with_agent_time: "00:00:00" }),
      b({ agent: "Jorge Abudi", agent_id: 2, campaign: "Jorge Abudi - Eventos", campaign_id: 11, speaking_with_agent_time: "00:00:20" }),
      b({ agent: "-", agent_id: null, has_agent: false, campaign: "Jorge Abudi - Eventos", campaign_id: 11, status_id: 5, speaking_with_agent_time: "00:00:00" }),
    ];
    const p = agregar("vorp", ligs, "2026-11-10", "2026-11-10", {}, 60);
    expect(p.porPreVendas.map((x) => [x.nome, x.ligacoes, x.alos, x.conexoes])).toEqual([
      ["Marcus Ryquelme", 3, 1, 1],
      ["Jorge Abudi", 2, 1, 0],
    ]);
    const diag = Object.fromEntries(p.porDiagnostico.map((d) => [d.id, d.ligacoes]));
    expect(diag).toMatchObject({ atendida: 2, caixa_postal: 1, recusada: 1, nao_atendida: 1 });
    const so = agregar("vorp", ligs, "2026-11-10", "2026-11-10", { agentes: ["Jorge Abudi"] }, 60);
    expect(so.totais).toMatchObject({ ligacoes: 2, alos: 1, conexoes: 0 });
  });
});

describe("tentativas por pré-vendas por dia", () => {
  it("soma por pessoa e dia, e o total do dia bate com as tentativas", async () => {
    const { agregar, enxugar } = await import("./esforco-3c");
    const b = (p: Record<string, unknown>) => enxugar({ call_date: "2026-11-10 10:00:00", agent: "-", has_agent: false, campaign: "Marcus Ryquelme", status_id: 9, speaking_with_agent_time: "00:00:00", ...p });
    const ligs = [
      b({ agent: "Marcus Ryquelme", agent_id: 1, has_agent: true, status_id: 7 }),
      b({}),
      b({ call_date: "2026-11-11 09:00:00" }),
      b({ campaign: "Jorge Abudi", agent: "Jorge Abudi", agent_id: 2, has_agent: true, status_id: 7 }),
    ];
    const p = agregar("vorp", ligs, "2026-11-10", "2026-11-11", {}, 60);
    expect(p.tentativasPorPessoaDia).toEqual({ "Marcus Ryquelme": { "2026-11-10": 2, "2026-11-11": 1 }, "Jorge Abudi": { "2026-11-10": 1 } });
    const total = Object.values(p.tentativasPorPessoaDia).reduce((s, d) => s + Object.values(d).reduce((a, n) => a + n, 0), 0);
    expect(total).toBe(p.totais.ligacoes);
  });
});

describe("listas ao longo do tempo por pré-vendas", () => {
  it("separa por pessoa, dia e lista, e bate com a tabela por pré-vendas", async () => {
    const { agregar, enxugar, SEM_LISTA } = await import("./esforco-3c");
    const b = (p: Record<string, unknown>) =>
      enxugar({ call_date: "2026-11-10 10:00:00", agent: "-", has_agent: false, campaign: "Marcus Ryquelme", list: "Lista X1", status_id: 9, speaking_with_agent_time: "00:00:00", ...p });
    const ligs = [
      b({}),
      b({ agent: "Marcus Ryquelme", has_agent: true, status_id: 7, speaking_with_agent_time: "00:01:30" }),
      b({ agent: "Marcus Ryquelme", has_agent: true, status_id: 7, speaking_with_agent_time: "00:00:10", list: "-" }),
      b({ call_date: "2026-11-11 09:00:00", list: "Lista X2" }),
    ];
    const p = agregar("vorp", ligs, "2026-11-10", "2026-11-11", {}, 60);
    expect(p.porPessoaDiaLista).toEqual({
      "Marcus Ryquelme": {
        "2026-11-10": { "Lista X1": { ligacoes: 2, alos: 1, conexoes: 1 }, [SEM_LISTA]: { ligacoes: 1, alos: 1, conexoes: 0 } },
        "2026-11-11": { "Lista X2": { ligacoes: 1, alos: 0, conexoes: 0 } },
      },
    });
    const linha = p.porPreVendas.find((x) => x.nome === "Marcus Ryquelme")!;
    const soma = Object.values(p.porPessoaDiaLista["Marcus Ryquelme"]).flatMap((d) => Object.values(d));
    expect([linha.ligacoes, linha.alos, linha.conexoes]).toEqual([
      soma.reduce((s, f) => s + f.ligacoes, 0),
      soma.reduce((s, f) => s + f.alos, 0),
      soma.reduce((s, f) => s + f.conexoes, 0),
    ]);
  });

  it("lista principal do dia vira faixa; dia sem ligação não corta a faixa; fim de semana só entra se discou", async () => {
    const { linhaDoTempoListas } = await import("./esforco-3c");
    const f = (ligacoes: number, alos = 0, conexoes = 0) => ({ ligacoes, alos, conexoes });
    // 05/11 qui (sem ligação, antes do primeiro dia: fica fora), 06 sex, 07 sáb, 08 dom, 09 seg, 10 ter, 11 qua, 12 qui
    const periodo = ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"];
    const t = linhaDoTempoListas(
      {
        "2026-11-06": { X1: f(100, 10, 1) },
        "2026-11-08": { X1: f(20, 2, 0) },
        // 09 sem ligação
        "2026-11-10": { X1: f(50, 5, 1), X2: f(10, 3, 2) },
        "2026-11-11": { X2: f(200, 50, 30) },
        "2026-11-12": { X2: f(150, 40, 20) },
      },
      periodo,
    );
    expect(t.dias.map((d) => [d.dia, d.lista, d.ligacoes])).toEqual([
      ["2026-11-06", "X1", 100],
      ["2026-11-08", "X1", 20],
      ["2026-11-09", null, 0],
      ["2026-11-10", "X1", 60],
      ["2026-11-11", "X2", 200],
      ["2026-11-12", "X2", 150],
    ]);
    expect(t.faixas).toEqual([
      { lista: "X1", inicio: 0, fim: 3 },
      { lista: "X2", inicio: 4, fim: 5 },
    ]);
    expect(t.listas).toEqual([
      { lista: "X2", dias: 3, ligacoes: 360, alos: 93, conexoes: 52 },
      { lista: "X1", dias: 3, ligacoes: 170, alos: 17, conexoes: 2 },
    ]);
    expect(linhaDoTempoListas({}, periodo)).toEqual({ dias: [], faixas: [], listas: [] });
  });
});
