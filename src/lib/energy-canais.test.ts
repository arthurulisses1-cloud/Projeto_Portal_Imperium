import { describe, expect, it } from "vitest";
import { casarCanais } from "./energy-canais";
import { identidadeDe } from "./identidade";
import { funilDasContas, type SunneDeal } from "./sunne";

const deal = (id: string, extra: Partial<SunneDeal>): SunneDeal => ({
  id,
  organizationId: "org-a",
  product: "gd",
  funnel: "sales",
  stage: "x",
  stageKey: "validation",
  isClosed: false,
  isLost: false,
  createdAt: "2026-11-02T12:00:00Z",
  closedAt: null,
  averageConsumption: null,
  ...extra,
});
const lead = (id: string, tel: string, nome: string, status = "open", fechado: string | null = null) => {
  const i = identidadeDe(tel, nome);
  return { deal_id: id, status, fechado_em: fechado, telefone_hash: i.telefoneHash, nome_tokens: i.nomeTokens };
};

describe("casarCanais", () => {
  const deals = [
    deal("s1", { identidade: identidadeDe("(85) 99999-0001", "José da Silva"), isClosed: true, funnel: "connection", stageKey: "send_to_plant", closedAt: "2026-11-05T12:00:00Z" }),
    deal("s2", { identidade: identidadeDe("85999990002", "Maria Souza"), isClosed: true, funnel: "connection", stageKey: "send_to_plant", closedAt: "2026-11-06T12:00:00Z" }),
    deal("s3", { identidade: identidadeDe("85999990003", "Ana Lima") }),
  ];
  const leads = [
    lead("p1", "+55 85 99999-0001", "Jose Silva", "won", "2026-11-04T12:00:00Z"), // é o s1
    lead("p2", "85999990003", "Carlos Pereira"), // telefone igual ao s3, nome outro: não casa
    lead("p3", "85999990009", "Pedro Alves", "won", "2026-11-07T12:00:00Z"), // ganho sem negócio na Sunne
    lead("p4", "85999990010", "Antiga Venda", "won", "2026-10-07T12:00:00Z"), // ganho de outro mês
  ];

  it("casa por telefone e nome e conta o ganho do Pipefácil que não está na Sunne", () => {
    const c = casarCanais(deals, leads, "2026-11");
    expect(Array.from(c.viaPipefacil)).toEqual(["s1"]);
    expect(c.ganhosPipefacilSemSunne).toBe(1);
    expect(c.leadsComTelefone).toBe(4);
  });

  it("separa o funil por canal sem duplicar contas", () => {
    const c = casarCanais(deals, leads, "2026-11");
    const f = funilDasContas(deals, 2026, 11, new Map(), c.viaPipefacil);
    expect(f.subidas).toBe(3);
    expect(f.porCanal?.pipefacil).toMatchObject({ subidas: 1, ganho: 1 });
    expect(f.porCanal?.plataforma).toMatchObject({ subidas: 2, ganho: 1 });
    expect(f.porCanal!.pipefacil.subidas + f.porCanal!.plataforma.subidas).toBe(f.subidas);
  });
});
