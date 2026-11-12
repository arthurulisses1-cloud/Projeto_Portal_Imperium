import { afterEach, describe, expect, it, vi } from "vitest";
import { casarOrganizacao, lerRedeSunne, resumirSunne, vendedoresSunne, type SunneDeal } from "./sunne";

// Dados fictícios: nenhum identificador, nome ou valor vem da Sunne real.
const base: SunneDeal = {
  id: "n1",
  organizationId: "org-a",
  product: "gd",
  funnel: "sales",
  stage: "Validação",
  stageKey: "validation",
  isClosed: false,
  isLost: false,
  createdAt: "2026-11-01T12:00:00Z",
  closedAt: null,
  averageConsumption: null,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("resumirSunne", () => {
  it("conta o mês no horário de Brasília, só GD e só fechados não perdidos", () => {
    const resumo = resumirSunne(
      [
        base,
        // 01/11 00:30 em Brasília (03:30 UTC): conta em novembro
        { ...base, id: "n2", createdAt: "2026-11-01T03:30:00Z", isClosed: true, closedAt: "2026-11-03T12:00:00Z", averageConsumption: 500 },
        // 31/10 23:00 em Brasília: fica em outubro
        { ...base, id: "n3", createdAt: "2026-11-01T02:00:00Z" },
        { ...base, id: "n4", isClosed: true, isLost: true, closedAt: "2026-11-03T12:00:00Z", averageConsumption: 1000 },
        { ...base, id: "n5", product: "alugsol", isClosed: true, closedAt: "2026-11-03T12:00:00Z", averageConsumption: 900 },
      ],
      2026,
      11,
    );
    expect(resumo.criados).toBe(3);
    expect(resumo.fechados).toBe(1);
    expect(resumo.consumoMedioFechado).toBe(500);
    expect(resumo.fechadosComConsumo).toBe(1);
    expect(resumo.etapas).toEqual([{ chave: "sales:validation", nome: "Validação", quantidade: 3 }]);
  });

  it("separa por organização e usa o nome da pessoa casada", () => {
    const vendedores = vendedoresSunne(
      [
        { id: "org-a", nome: "Jose da Silva" },
        { id: "org-b", nome: "Nome Sem Par" },
      ],
      [{ id: "p-a", full_name: "José da Silva", nomes_planilha: null }],
    );
    const resumo = resumirSunne(
      [
        { ...base, id: "a1", isClosed: true, closedAt: "2026-11-05T12:00:00Z", averageConsumption: 300 },
        { ...base, id: "b1", organizationId: "org-b", isClosed: true, closedAt: "2026-11-05T12:00:00Z", averageConsumption: 700 },
        { ...base, id: "c1", organizationId: "org-c-123456" },
      ],
      2026,
      11,
      vendedores,
    );
    expect(resumo.porOrganizacao.map((o) => [o.nome, o.pessoa, o.profileId, o.kwh, o.criados])).toEqual([
      ["Nome Sem Par", null, null, 700, 1],
      ["Jose da Silva", "José da Silva", "p-a", 300, 1],
      ["Organização org-c-", null, null, 0, 1],
    ]);
  });
});

describe("casarOrganizacao", () => {
  const perfis = [
    { id: "p1", full_name: "José da Silva", nomes_planilha: null },
    { id: "p2", full_name: "Maria Souza", nomes_planilha: ["Mari Souza"] },
    { id: "p3", full_name: "Ana Lima", nomes_planilha: null },
    { id: "p4", full_name: "Ana  Lima", nomes_planilha: null },
  ];
  it("casa nome sem acento, caixa ou espaço extra, e por apelido", () => {
    expect(casarOrganizacao("jose da silva ", perfis)).toBe("p1");
    expect(casarOrganizacao("Mari Souza", perfis)).toBe("p2");
  });
  it("não adivinha quando o nome é ambíguo ou não existe", () => {
    expect(casarOrganizacao("Ana Lima", perfis)).toBeNull();
    expect(casarOrganizacao("Fulano", perfis)).toBeNull();
    expect(casarOrganizacao(null, perfis)).toBeNull();
  });
});

function respostaJson(corpo: unknown) {
  return new Response(JSON.stringify(corpo), { headers: { "content-type": "application/json" } });
}

const dealApi = {
  ...base,
  id: "d1",
  updatedAt: "2026-11-02T12:00:00Z",
  averageConsumption: 400,
  cpf: "000.000.000-00",
  contactName: "Cliente Fictício",
  phone: "00000000000",
};

describe("lerRedeSunne", () => {
  it("exige a chave e não chama a API sem ela", async () => {
    vi.stubEnv("SUNNE_SYS_API_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(lerRedeSunne()).rejects.toThrow("Sunne não configurada");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pagina, filtra GD, deduplica e descarta dados pessoais do cliente", async () => {
    vi.stubEnv("SUNNE_SYS_API_TOKEN", "teste");
    const fetchMock = vi.fn(async (url: URL) => {
      const offset = Number(url.searchParams.get("offset"));
      if (url.pathname.endsWith("/deals")) {
        return offset === 0
          ? respostaJson({ deals: [dealApi], hasMore: true })
          : respostaJson({ deals: [dealApi, { ...dealApi, id: "d2", organizationId: "org-b" }], hasMore: false });
      }
      return respostaJson({ commissions: [{ id: "c1", organizationId: "org-a", organizationName: " Vendedor A " }], hasMore: false });
    });
    vi.stubGlobal("fetch", fetchMock);

    const rede = await lerRedeSunne();
    const dealsChamadas = fetchMock.mock.calls.map(([u]) => u as URL).filter((u) => u.pathname.endsWith("/deals"));
    expect(dealsChamadas.map((u) => u.searchParams.get("product"))).toEqual(["gd", "gd"]);
    expect(rede.deals.map((d) => d.id)).toEqual(["d1", "d2"]);
    expect(rede.deals[0]).not.toHaveProperty("cpf");
    expect(JSON.stringify(rede)).not.toContain("Cliente Fictício");
    expect(rede.organizacoes).toEqual([
      { id: "org-a", nome: "Vendedor A" },
      { id: "org-b", nome: null },
    ]);
  });

  it("não transforma uma falha da API em dados vazios", async () => {
    vi.stubEnv("SUNNE_SYS_API_TOKEN", "teste");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await expect(lerRedeSunne()).rejects.toThrow("Sunne HTTP 401");
  });
});
