import { describe, expect, it } from "vitest";
import { resumirDesfechoAgendadas } from "./desfecho-agendadas";
import type { LeadAuditoria } from "./integracoes/auditoria";
import type { LeadEtapa } from "./funil-negocio";

const aud = (p: Partial<LeadAuditoria>): LeadAuditoria =>
  ({ id: "x", nome: "Lead", canal: "outbound", status: "open", agendadaEm: "2026-11-05T13:00:00Z", reuniaoMarcada: null, realizadaEm: null, noShowEm: null, situacao: "a_acontecer", ...p }) as LeadAuditoria;
const ag = (p: Partial<LeadEtapa>): LeadEtapa => ({ nome: "Lead", responsavel: null, preVendas: null, data: "2026-11-05", ...p });
const HOJE = "2026-11-19";
const NS = "2026-11-08T13:00:00Z";

describe("desfecho das agendadas", () => {
  // Um lead de cada caso da regra do gestor comercial (19/11/2026).
  const auditoria = [
    aud({ id: "real", situacao: "realizada", realizadaEm: "2026-11-10T13:00:00Z" }),
    aud({ id: "ns-real", situacao: "realizada", noShowEm: NS, realizadaEm: "2026-11-12T13:00:00Z" }),
    aud({ id: "ns-parado", situacao: "no_show", noShowEm: NS }),
    aud({ id: "ns-perdido", situacao: "no_show", status: "lost", noShowEm: NS }),
    aud({ id: "ns-reag", situacao: "a_acontecer", noShowEm: NS, reuniaoMarcada: "25/11/2026 10:00" }),
    aud({ id: "futura", reuniaoMarcada: "25/11/2026 10:00" }),
    aud({ id: "sem-data" }),
    aud({ id: "vencida", reuniaoMarcada: "10/11/2026 10:00", preVendas: "Ana" }),
    aud({ id: "cancelada", situacao: "cancelada", status: "lost" }),
    aud({ id: "ns-antigo", situacao: "cancelada", status: "lost", noShowEm: "2026-10-01T13:00:00Z" }),
  ];
  const ids = [...auditoria.map((l) => l.id), "sumiu"];
  const r = resumirDesfechoAgendadas(ids.map((id) => ag({ id })), auditoria, HOJE)!;

  it("distribuição: cada lead em uma categoria só, e a soma fecha com as agendadas", () => {
    expect(r.qtd).toEqual({ realizadas: 2, noShow: 2, aAcontecer: 3, vencidas: 1, canceladas: 2, semInfo: 1 });
    expect(Object.values(r.qtd).reduce((s, n) => s + n, 0)).toBe(r.total);
    expect(r.leads.vencidas).toEqual([{ nome: "Lead", preVendas: "Ana", reuniao: "2026-11-10T13:00:00.000Z" }]);
  });

  it("No-Show Não Recuperado: parado no No Show ou perdido após no-show, sobre o total de agendadas", () => {
    expect(r.naoRecuperado.qtd).toBe(2);
    expect(r.naoRecuperado.pct).toBeCloseTo(2 / 11);
    expect(r.naoRecuperado.leads.map((l) => l.depois)).toEqual(["parado no No Show", "perdido"]);
  });

  it("No-Show Histórico: todo lead que passou pelo No Show depois de agendar, qualquer que seja a situação atual", () => {
    expect(r.historico.qtd).toBe(4);
    expect(r.historico.pct).toBeCloseTo(4 / 11);
    expect(r.historico.leads.map((l) => l.depois)).toEqual(["realizada depois", "parado no No Show", "perdido", "reagendado"]);
    expect(r.historico.qtd).toBeGreaterThanOrEqual(r.naoRecuperado.qtd);
  });

  it("lista antiga (sem id): casa pelo nome, preferindo o mesmo dia, e cada lead uma vez só", () => {
    const aud2 = [
      aud({ id: "a", nome: "Ana", agendadaEm: "2026-10-30T13:00:00Z", situacao: "realizada", realizadaEm: "2026-11-01T13:00:00Z" }),
      aud({ id: "b", nome: "Ana", agendadaEm: "2026-11-07T13:00:00Z", situacao: "no_show", noShowEm: NS }),
    ];
    const r2 = resumirDesfechoAgendadas([ag({ nome: "Ana", data: "2026-11-07" }), ag({ nome: "Ana", data: "2026-11-07" })], aud2, HOJE);
    expect(r2?.qtd).toMatchObject({ noShow: 1, realizadas: 1, semInfo: 0 });
  });

  it("sem agendadas ou sem Auditoria: nada a mostrar", () => {
    expect(resumirDesfechoAgendadas([], [aud({})], HOJE)).toBeNull();
    expect(resumirDesfechoAgendadas([ag({ id: "1" })], [], HOJE)).toBeNull();
    expect(resumirDesfechoAgendadas([ag({ id: "1" })], [aud({ id: "2" })], HOJE)).toBeNull();
  });
});
