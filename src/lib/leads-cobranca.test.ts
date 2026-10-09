import { describe, expect, it } from "vitest";
import {
  cobrancaDoLead,
  deveRotacionar,
  escolherProximoCloser,
  type LeadCobravel,
  type LeadRotacionavel,
} from "./leads-cobranca";

// 2026-10-07 é quarta; 2026-10-10 é sábado.
const base: LeadCobravel = {
  id: "l1",
  lead_nome: "Fulano",
  status_followup: "subido",
  em_reanalise: false,
  closer_profile_id: "c1",
  rot_responsavel_id: null,
  rot_fase: null,
  rot_etapa: null,
  rot_desde: null,
  rot_primeiro_toque_em: null,
  subido_em: "2026-10-05",
  status_em: "2026-10-05T15:00:00Z",
  ultima_atualizacao_em: null,
  ultimo_movimento_em: null,
  compliance_comportamento: null,
  pendencia_prazo: null,
};

describe("cobrancaDoLead", () => {
  it("cobra 1 dia depois de subir", () => {
    expect(cobrancaDoLead(base, "2026-10-05")).toBeNull();
    expect(cobrancaDoLead(base, "2026-10-06")?.tipo).toBe("atualizar_status");
  });

  it("depois da primeira atualização, cobra a cada 2 dias", () => {
    const l = { ...base, ultima_atualizacao_em: "2026-10-06T15:00:00Z" };
    expect(cobrancaDoLead(l, "2026-10-07")).toBeNull();
    expect(cobrancaDoLead(l, "2026-10-08")?.tipo).toBe("atualizar_status");
  });

  it("pendência com prazo vencido vira pendencia_vencida", () => {
    const l = { ...base, compliance_comportamento: "pendencia", pendencia_prazo: "2026-10-04", ultima_atualizacao_em: "2026-10-06T15:00:00Z" };
    expect(cobrancaDoLead(l, "2026-10-07")).toEqual({ tipo: "pendencia_vencida", dias: 3 });
  });

  it("não cobra queda, reanálise nem fim de semana", () => {
    expect(cobrancaDoLead({ ...base, compliance_comportamento: "queda" }, "2026-10-08")).toBeNull();
    expect(cobrancaDoLead({ ...base, em_reanalise: true }, "2026-10-08")).toBeNull();
    expect(cobrancaDoLead(base, "2026-10-10")).toBeNull();
  });

  it("não cobra etapas sem acompanhamento nem terminais", () => {
    expect(cobrancaDoLead({ ...base, status_followup: "entrevista_validada" }, "2026-10-08")).toBeNull();
    expect(cobrancaDoLead({ ...base, status_followup: "pago" }, "2026-10-08")).toBeNull();
  });

  it("lead recém-chegado pra recuperação é cobrado até o primeiro toque", () => {
    const l = { ...base, status_followup: "entrevista_validada", rot_fase: "diagnostico", rot_desde: "2026-10-05" };
    expect(cobrancaDoLead(l, "2026-10-07")).toEqual({ tipo: "recuperacao_nova", dias: 2 });
    expect(cobrancaDoLead({ ...l, rot_primeiro_toque_em: "2026-10-06T12:00:00Z" }, "2026-10-07")).toBeNull();
  });
});

const rot: LeadRotacionavel = {
  status_followup: "fechamento",
  em_reanalise: false,
  compliance_comportamento: null,
  closer_profile_id: "c1",
  ultimo_movimento_em: "2026-09-01T12:00:00Z",
  rot_desde: null,
  rot_fase: null,
  rot_etapa: null,
  rot_tentaram: [],
};

describe("deveRotacionar", () => {
  it("rotaciona com 30 dias sem movimento", () => {
    expect(deveRotacionar(rot, "2026-10-01")).toBe(true);
    expect(deveRotacionar(rot, "2026-09-30")).toBe(false);
  });

  it("o relógio reinicia quando a fase da rotação muda", () => {
    expect(deveRotacionar({ ...rot, rot_desde: "2026-09-25" }, "2026-10-10")).toBe(false);
    expect(deveRotacionar({ ...rot, rot_desde: "2026-09-25" }, "2026-10-25")).toBe(true);
  });

  it("lead travado em não faz sentido nunca mais rotaciona", () => {
    expect(deveRotacionar({ ...rot, rot_etapa: "nao_faz_sentido" }, "2027-01-01")).toBe(false);
  });

  it("não rotaciona terminal, reanálise nem queda", () => {
    expect(deveRotacionar({ ...rot, status_followup: "assinado" }, "2026-12-01")).toBe(false);
    expect(deveRotacionar({ ...rot, em_reanalise: true }, "2026-12-01")).toBe(false);
    expect(deveRotacionar({ ...rot, compliance_comportamento: "queda" }, "2026-12-01")).toBe(false);
  });
});

describe("escolherProximoCloser", () => {
  const closers = ["c1", "c2", "c3", "c4"];

  it("ignora o original e escolhe o de menor carga", () => {
    const carga = new Map([["c2", 3], ["c3", 1], ["c4", 2]]);
    expect(escolherProximoCloser({ closer_profile_id: "c1", rot_tentaram: [] }, closers, carga)).toEqual({ id: "c3", zerouTentativas: false });
  });

  it("pula quem já tentou e zera quando todos tentaram", () => {
    expect(escolherProximoCloser({ closer_profile_id: "c1", rot_tentaram: ["c2", "c3"] }, closers, new Map())?.id).toBe("c4");
    expect(escolherProximoCloser({ closer_profile_id: "c1", rot_tentaram: ["c2", "c3", "c4"] }, closers, new Map())).toEqual({
      id: "c2",
      zerouTentativas: true,
    });
  });

  it("sem outro closer disponível não rotaciona", () => {
    expect(escolherProximoCloser({ closer_profile_id: "c1", rot_tentaram: [] }, ["c1"], new Map())).toBeNull();
  });
});
