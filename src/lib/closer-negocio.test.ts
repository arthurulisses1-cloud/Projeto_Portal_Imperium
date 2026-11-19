import { describe, expect, it } from "vitest";
import { metaMrrDaPessoa, resumirReunioesCloser, setupDaVenda } from "./closer-negocio";
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
    closer: "Bruno Brito",
    vendedor: null,
    rqa: null,
    reuniaoMarcada: null,
    agendadaEm: null,
    realizadaEm: null,
    noShowEm: null,
    situacao: "a_acontecer",
    tags: [],
    passos: [],
    ...p,
  }) as LeadAuditoria;

describe("resumirReunioesCloser", () => {
  const hoje = "2026-11-18";
  const leads = [
    lead({ nome: "Amanhã", reuniaoMarcada: "19/11/2026 10:00" }),
    lead({ nome: "Hoje tarde", reuniaoMarcada: "18/11/2026 15:30", preVendas: "Marcus Ryquelme" }),
    lead({ nome: "Hoje cedo", reuniaoMarcada: "18/11/2026 09:00" }),
    lead({ nome: "Feita hoje", reuniaoMarcada: "18/11/2026 08:00", situacao: "realizada", realizadaEm: "2026-11-18T12:00:00Z" }),
    lead({ nome: "Feita dia 3", situacao: "realizada", realizadaEm: "2026-11-03T12:00:00Z" }),
    lead({ nome: "Do outro closer", closer: "Outra Pessoa", reuniaoMarcada: "18/11/2026 11:00" }),
    lead({ nome: "Cancelada", situacao: "cancelada", reuniaoMarcada: "18/11/2026 16:00" }),
  ];
  const r = resumirReunioesCloser(leads, "Bruno Brito", 2026, 11, hoje);

  it("previstas: só as a acontecer dele, da mais próxima para a mais distante", () => {
    expect(r.previstas.map((x) => x.nome)).toEqual(["Hoje cedo", "Hoje tarde", "Amanhã"]);
    expect(r.previstas[1].sdr).toBe("Marcus Ryquelme");
  });
  it("do dia: reuniões marcadas para hoje por horário, com o SDR, sem cancelada nem de outro closer", () => {
    expect(r.doDia.map((x) => x.nome)).toEqual(["Feita hoje", "Hoje cedo", "Hoje tarde"]);
    expect(r.doDia[2].sdr).toBe("Marcus Ryquelme");
  });
  it("realizadas no mês e hoje", () => {
    expect(r.realizadasNoMes).toBe(2);
    expect(r.realizadasHoje).toBe(1);
  });
});

describe("metaMrrDaPessoa", () => {
  it("divide a meta de MRR na proporção da meta de recebido da pessoa", () => {
    expect(metaMrrDaPessoa(60000, 25000, 100000)).toBe(15000);
  });
  it("sem meta de MRR ou de recebido, é zero", () => {
    expect(metaMrrDaPessoa(0, 25000, 100000)).toBe(0);
    expect(metaMrrDaPessoa(60000, null, 100000)).toBe(0);
    expect(metaMrrDaPessoa(60000, 25000, 0)).toBe(0);
  });
});

describe("reuniões para reagendar (Match Sales)", () => {
  const hoje = "2026-11-19";
  const leads = [
    lead({ nome: "Hoje", closer: null, preVendas: "Matheus", reuniaoMarcada: "2026-11-19T15:00" }),
    lead({ nome: "Amanhã", closer: null, preVendas: "Matheus", reuniaoMarcada: "2026-11-20T10:00" }),
    lead({ nome: "Passou", closer: null, preVendas: "Matheus", reuniaoMarcada: "2026-11-17T10:00" }),
    lead({ nome: "Sem data", closer: null, preVendas: "Matheus", reuniaoMarcada: null }),
    lead({ nome: "Não veio", closer: null, preVendas: "Matheus", reuniaoMarcada: "2026-11-18T09:00", situacao: "no_show" }),
  ];
  it("separa o que ainda vai acontecer (hoje em diante ou sem data) do que precisa reagendar (data passada ou no-show)", () => {
    const r = resumirReunioesCloser(leads, "Matheus", 2026, 11, hoje, true);
    expect(r.previstas.map((x) => x.nome)).toEqual(["Hoje", "Amanhã", "Sem data"]);
    expect(r.reagendar.map((x) => [x.nome, x.motivo])).toEqual([["Passou", "data_passada"], ["Não veio", "no_show"]]);
    expect(r.doDia.map((x) => x.nome)).toContain("Hoje");
  });
});

describe("resumirReunioesCloser no Match Sales (dono da reunião)", () => {
  const leads = [
    lead({ nome: "Minha, sem closer", closer: null, preVendas: "Arthur Soares", reuniaoMarcada: "18/11/2026 10:00" }),
    lead({ nome: "Minha, levada pelo Davi", closer: "Davi Ximenes", preVendas: "Arthur Soares", reuniaoMarcada: "18/11/2026 11:00" }),
    lead({ nome: "De outro", closer: null, preVendas: "Leonardo", reuniaoMarcada: "18/11/2026 12:00" }),
  ];
  it("conta as reuniões que ele agendou, tocadas por ele ou por outro", () => {
    const r = resumirReunioesCloser(leads, "Arthur Soares", 2026, 11, "2026-11-18", true);
    expect(r.previstas.map((x) => x.nome)).toEqual(["Minha, sem closer", "Minha, levada pelo Davi"]);
    expect(r.doDia).toHaveLength(2);
  });
  it("sem o modo dono (Vorp), só vale o campo closer", () => {
    expect(resumirReunioesCloser(leads, "Arthur Soares", 2026, 11, "2026-11-18").previstas).toHaveLength(0);
  });
});

describe("setupDaVenda", () => {
  it("é o valor da implantação cadastrado na venda", () => {
    expect(setupDaVenda({ valor_implantacao: 2500 })).toBe(2500);
  });
  it("sem valor da implantação, é zero", () => {
    expect(setupDaVenda({})).toBe(0);
    expect(setupDaVenda({ valor_implantacao: null })).toBe(0);
    expect(setupDaVenda({ valor_implantacao: -5 })).toBe(0);
  });
});
