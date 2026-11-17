import { describe, expect, it, vi } from "vitest";
import { identidadesDosDeals, telefoneDoObjeto } from "./contatos";
import type { DealPipefacil } from "./pipefacil";

const deal = (id: string, extra: Partial<DealPipefacil>): DealPipefacil => ({
  id,
  seq: 1,
  name: "Lead " + id,
  value: null,
  status: "open",
  pipelineId: "p",
  stageId: "s",
  responsibleUserId: null,
  properties: null,
  createdAt: "2026-11-01T00:00:00Z",
  closedAt: null,
  ...extra,
});

describe("telefoneDoObjeto", () => {
  it("lê as chaves usuais e a lista phones", () => {
    expect(telefoneDoObjeto({ phone: "85999990000" })).toBe("85999990000");
    expect(telefoneDoObjeto({ telefone: "(85) 99999-0000" })).toBe("(85) 99999-0000");
    expect(telefoneDoObjeto({ phones: [{ number: "85999990001" }] })).toBe("85999990001");
    expect(telefoneDoObjeto({ name: "x" })).toBeNull();
    expect(telefoneDoObjeto(null)).toBeNull();
  });
});

describe("identidadesDosDeals", () => {
  it("usa o telefone do próprio lead e só busca contatos se faltar", async () => {
    const buscar = vi.fn(async () => []);
    const r = await identidadesDosDeals([deal("a", { contact: { phone: "85999990000" } })], buscar);
    expect(buscar).not.toHaveBeenCalled();
    expect(r.cobertura).toEqual({ total: 1, comTelefone: 1, viaLead: 1, viaContatos: 0 });
    expect(r.lista[0].telefoneHash).toBeTruthy();
  });

  it("completa pelo contato (id) quando o lead não traz o telefone", async () => {
    const buscar = vi.fn(async () => [{ id: "c1", phone: "85999990002", name: "Maria Souza" }]);
    const r = await identidadesDosDeals([deal("a", { contact: { id: "c1" } }), deal("b", { contact: null })], buscar);
    expect(buscar).toHaveBeenCalledOnce();
    expect(r.cobertura).toEqual({ total: 2, comTelefone: 1, viaLead: 0, viaContatos: 1 });
    expect(r.lista[0].telefoneHash).toBeTruthy();
    expect(r.lista[1].telefoneHash).toBeNull();
  });

  it("falha na lista de contatos não derruba: segue sem telefone", async () => {
    const r = await identidadesDosDeals([deal("a", { contact: { id: "c1" } })], async () => {
      throw new Error("boom");
    });
    expect(r.cobertura.comTelefone).toBe(0);
  });
});
