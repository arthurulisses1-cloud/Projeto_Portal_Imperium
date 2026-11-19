import { describe, expect, it } from "vitest";
import { resumirDesfechoAgendadas } from "./desfecho-agendadas";
import type { LeadAuditoria } from "./integracoes/auditoria";
import type { LeadEtapa } from "./funil-negocio";

const aud = (p: Partial<LeadAuditoria>): LeadAuditoria =>
  ({ id: "x", nome: "Lead", canal: "outbound", agendadaEm: "2026-11-05T13:00:00Z", reuniaoMarcada: null, situacao: "a_acontecer", ...p }) as LeadAuditoria;
const ag = (p: Partial<LeadEtapa>): LeadEtapa => ({ nome: "Lead", responsavel: null, preVendas: null, data: "2026-11-05", ...p });
const HOJE = "2026-11-19";

describe("desfecho das agendadas", () => {
  it("conta cada situação pelo id e calcula o no-show sobre as que tiveram desfecho", () => {
    const auditoria = [
      aud({ id: "1", situacao: "realizada" }),
      aud({ id: "2", situacao: "realizada" }),
      aud({ id: "3", situacao: "no_show" }),
      aud({ id: "4", situacao: "cancelada" }),
      aud({ id: "5", reuniaoMarcada: "25/11/2026 10:00" }),
      aud({ id: "6", reuniaoMarcada: "10/11/2026 10:00" }),
      aud({ id: "7" }),
      aud({ id: "fora", situacao: "no_show" }),
    ];
    const r = resumirDesfechoAgendadas(["1", "2", "3", "4", "5", "6", "7", "sumiu"].map((id) => ag({ id })), auditoria, HOJE);
    expect(r).toEqual({ total: 8, realizadas: 2, noShow: 1, canceladas: 1, aAcontecer: 2, reagendar: 1, semInfo: 1, pctNoShow: 1 / 3 });
  });

  it("lista antiga (sem id): casa pelo nome, preferindo o mesmo dia, e cada lead uma vez só", () => {
    const auditoria = [
      aud({ id: "a", nome: "Ana", agendadaEm: "2026-10-30T13:00:00Z", situacao: "realizada" }),
      aud({ id: "b", nome: "Ana", agendadaEm: "2026-11-07T13:00:00Z", situacao: "no_show" }),
    ];
    const r = resumirDesfechoAgendadas([ag({ nome: "Ana", data: "2026-11-07" }), ag({ nome: "Ana", data: "2026-11-07" })], auditoria, HOJE);
    expect(r).toMatchObject({ noShow: 1, realizadas: 1, semInfo: 0, pctNoShow: 0.5 });
  });

  it("sem agendadas ou sem Auditoria: nada a mostrar", () => {
    expect(resumirDesfechoAgendadas([], [aud({})], HOJE)).toBeNull();
    expect(resumirDesfechoAgendadas([ag({ id: "1" })], [], HOJE)).toBeNull();
    expect(resumirDesfechoAgendadas([ag({ id: "1" })], [aud({ id: "2" })], HOJE)).toBeNull();
  });
});
