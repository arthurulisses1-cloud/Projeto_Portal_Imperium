import { describe, expect, it } from "vitest";
import { cobrancaFinance, type LeadFinanceCobravel } from "./leads-cobranca-finance";

const lead: LeadFinanceCobravel = {
  id: "l",
  lead_nome: "Fulano",
  status_followup: "subido",
  data: "2026-11-09",
  status_em: null,
  ultimo_movimento_em: null,
  ultima_atualizacao_em: null,
  sdr_profile_id: null,
  closer_profile_id: "c",
};

describe("cobrancaFinance", () => {
  it("não cobra no fim de semana", () => {
    expect(cobrancaFinance(lead, "2026-11-14", false)).toBeNull(); // sábado
  });
  it("subido parado há 2 dias úteis pede atualização", () => {
    expect(cobrancaFinance({ ...lead, data: "2026-11-16" }, "2026-11-18", false)).toEqual({ tipo: "atualizar_status", dias: 2 });
    expect(cobrancaFinance({ ...lead, data: "2026-11-17" }, "2026-11-18", false)).toBeNull();
  });
  it("entrevista sem avançar há 2 dias pede atualização", () => {
    expect(cobrancaFinance({ ...lead, status_followup: "validacao_entrevista", data: "2026-11-16" }, "2026-11-18", false)).toEqual({ tipo: "atualizar_status", dias: 2 });
  });
  it("há 7 dias ou mais vira estagnado", () => {
    expect(cobrancaFinance({ ...lead, data: "2026-11-09" }, "2026-11-18", false)).toEqual({ tipo: "estagnado", dias: 9 });
  });
  it("movimento recente zera a contagem", () => {
    expect(cobrancaFinance({ ...lead, data: "2026-11-01", ultimo_movimento_em: "2026-11-18T15:00:00Z" }, "2026-11-18", false)).toBeNull();
  });
  it("venda aguardando aprovação só cobra o aprovador", () => {
    const v = { ...lead, status_followup: "venda_pendente", data: "2026-11-16" };
    expect(cobrancaFinance(v, "2026-11-18", true)).toEqual({ tipo: "aprovar_venda", dias: 2 });
    expect(cobrancaFinance(v, "2026-11-18", false)).toBeNull();
  });
});
