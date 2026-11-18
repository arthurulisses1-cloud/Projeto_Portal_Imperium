import { describe, expect, it } from "vitest";
import { contarEsforcoFinance, metasEsforcoFinance, montarFunilFinance, type LeadFinance } from "./finance-time";

const lead = (o: Partial<LeadFinance>): LeadFinance => ({
  id: "x",
  lead_nome: "Lead",
  data: "2026-11-17",
  status_followup: "validacao_entrevista",
  sdr_profile_id: "ana",
  closer_profile_id: null,
  subido_em: null,
  subido_por: null,
  sub_comissao_prevista: null,
  venda_valor_recebido: null,
  recusada_em: null,
  ultimo_movimento_em: null,
  ...o,
});
const membros = new Set(["ana", "bia"]);

describe("metasEsforcoFinance", () => {
  it("divide a meta do forecast igualmente entre os executivos", () => {
    const m = metasEsforcoFinance(2026, 11, 4);
    expect(m.entrevistasTime).toBeGreaterThan(0);
    expect(m.subidosTime).toBeGreaterThan(0);
    expect(Math.abs(m.entrevistasPessoa - m.entrevistasTime / 4)).toBeLessThanOrEqual(1);
  });
});

describe("contarEsforcoFinance", () => {
  it("conta entrevistas do mês por executivo (sem recusadas) e subidos por quem subiu", () => {
    const leads = [
      lead({ id: "1", sdr_profile_id: "ana" }),
      lead({ id: "2", sdr_profile_id: "ana", recusada_em: "2026-11-18" }),
      lead({ id: "3", sdr_profile_id: "bia", data: "2026-10-30", subido_em: "2026-11-02", subido_por: "ana" }),
      lead({ id: "4", sdr_profile_id: "fora", closer_profile_id: "bia", subido_em: "2026-11-05" }),
    ];
    const c = contarEsforcoFinance(leads, membros, "2026-11-01", "2026-12-01");
    expect(c.entrevistas.get("ana")).toBe(1);
    expect(c.entrevistas.get("bia")).toBe(1);
    expect(c.subidos.get("ana")).toBe(1);
    expect(c.subidos.get("bia")).toBe(1);
  });
});

describe("montarFunilFinance", () => {
  it("soma o R$ por etapa e ordena por valor", () => {
    const nomes = new Map([["ana", "Ana Silva"], ["bia", "Bia"]]);
    const f = montarFunilFinance(
      [
        lead({ id: "a", status_followup: "subido", sub_comissao_prevista: 1000 }),
        lead({ id: "b", status_followup: "subido", sub_comissao_prevista: 3000, sdr_profile_id: "bia" }),
        lead({ id: "c", status_followup: "venda_pendente", venda_valor_recebido: 500, sub_comissao_prevista: 900 }),
        lead({ id: "d", status_followup: "validacao_entrevista" }),
        lead({ id: "e", status_followup: "venda_aprovada", sub_comissao_prevista: 99999 }),
      ],
      membros,
      nomes,
      "2026-11-18",
    );
    const por = Object.fromEntries(f.map((e) => [e.chave, e]));
    expect(por.subido.total).toBe(4000);
    expect(por.subido.leads.map((l) => l.id)).toEqual(["b", "a"]);
    expect(por.subido.leads[0].quem).toBe("Bia");
    expect(por.venda.total).toBe(500);
    expect(por.entrevista.leads).toHaveLength(1);
    expect(por.entrevista.total).toBe(0);
  });
});
