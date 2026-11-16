import { afterEach, describe, expect, it, vi } from "vitest";
import { lerLigacoesSunne, resumirLigacoes, RAMAIS_SUNNE, type Ligacao } from "./api4com";

vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T) => fn }));

// Dados fictícios: nenhum telefone, e-mail ou id vem da Api4Com real.
const [ramalA, ramalB] = Object.keys(RAMAIS_SUNNE);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function respostaJson(corpo: unknown) {
  return new Response(JSON.stringify(corpo), { headers: { "content-type": "application/json" } });
}

function chamadaApi(id: string, from: string, started_at: string, duration: number) {
  return { id, from, started_at, duration, to: "00000000000", email: "ficticio@exemplo.com", record_url: "https://exemplo.com/gravacao.mp3", first_name: "apelido" };
}

describe("resumirLigacoes", () => {
  it("conta alôs (houve fala) e conexões (90 s ou mais) por responsável, ignorando ramal de fora", () => {
    const ligacoes: Ligacao[] = [
      { id: "1", ramal: ramalA, quando: "2026-11-03T10:00:00", falado: 0 },
      { id: "2", ramal: ramalA, quando: "2026-11-03T10:05:00", falado: 89 },
      { id: "3", ramal: ramalA, quando: "2026-11-03T10:10:00", falado: 90 },
      { id: "4", ramal: ramalB, quando: "2026-11-04T09:00:00", falado: 300 },
      { id: "5", ramal: "9999", quando: "2026-11-04T09:00:00", falado: 300 },
    ];
    const r = resumirLigacoes(ligacoes);
    expect(r).toMatchObject({ ligacoes: 4, alos: 3, conexoes: 2 });
    expect(r.porPessoa.map((p) => [p.ramal, p.ligacoes, p.alos, p.conexoes])).toEqual([
      [ramalA, 3, 2, 1],
      [ramalB, 1, 1, 1],
    ]);
  });

  it("liga o responsável à pessoa do portal pelo nome completo ou apelido", () => {
    const perfis = [
      { id: "p1", full_name: "Pessoa Um", nomes_planilha: [RAMAIS_SUNNE[ramalA]] },
      { id: "p2", full_name: "Pessoa Dois", nomes_planilha: [] },
    ];
    const r = resumirLigacoes(
      [
        { id: "1", ramal: ramalA, quando: "2026-11-03T10:00:00", falado: 90 },
        { id: "2", ramal: ramalB, quando: "2026-11-03T10:00:00", falado: 90 },
      ],
      perfis,
    );
    const porRamal = new Map(r.porPessoa.map((p) => [p.ramal, p]));
    expect(porRamal.get(ramalA)).toMatchObject({ profileId: "p1", pessoa: "Pessoa Um" });
    expect(porRamal.get(ramalB)).toMatchObject({ profileId: null, pessoa: null, nome: RAMAIS_SUNNE[ramalB] });
  });
});

describe("lerLigacoesSunne", () => {
  it("exige a chave e não chama a API sem ela", async () => {
    vi.stubEnv("API4COM_API_TOKEN_SUNNE", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(lerLigacoesSunne(2026, 11)).rejects.toThrow("Api4Com da Sunne não configurada");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("filtra o mês e os ramais na API, pagina, deduplica e descarta telefone, e-mail e gravação", async () => {
    vi.stubEnv("API4COM_API_TOKEN_SUNNE", "teste");
    const fetchMock = vi.fn(async (url: URL) => {
      const pagina = Number(url.searchParams.get("page"));
      const meta = { totalPageCount: 2 };
      return pagina === 1
        ? respostaJson({ data: [chamadaApi("a", ramalA, "2026-11-30T23:10:00.000Z", 70)], meta })
        : respostaJson({
            data: [chamadaApi("a", ramalA, "2026-11-30T23:10:00.000Z", 70), chamadaApi("b", Number(ramalB) as unknown as string, "2026-11-01T00:01:00.000Z", 0), chamadaApi("c", "9999", "2026-11-02T10:00:00.000Z", 90)],
            meta,
          });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { ligacoes } = await lerLigacoesSunne(2026, 11);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("teste");
    const filtro = JSON.parse(url.searchParams.get("filter") ?? "{}");
    expect(filtro.where.started_at.between).toEqual(["2026-11-01T00:00:00", "2026-11-30T23:59:59"]);
    expect(filtro.where.or).toEqual(Object.keys(RAMAIS_SUNNE).map((from) => ({ from })));

    // A hora vem com "Z" mas é a de Brasília: 30/11 23:10 continua em novembro.
    expect(ligacoes).toEqual([
      { id: "a", ramal: ramalA, quando: "2026-11-30T23:10:00", falado: 70 },
      { id: "b", ramal: ramalB, quando: "2026-11-01T00:01:00", falado: 0 },
    ]);
    expect(JSON.stringify(ligacoes)).not.toMatch(/0000000|ficticio|gravacao/);
  });

  it("não transforma uma falha da API em mês vazio", async () => {
    vi.stubEnv("API4COM_API_TOKEN_SUNNE", "teste");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await expect(lerLigacoesSunne(2026, 11)).rejects.toThrow("Api4Com HTTP 401");
  });

  it("usa o último dia certo do mês (fevereiro)", async () => {
    vi.stubEnv("API4COM_API_TOKEN_SUNNE", "teste");
    const fetchMock = vi.fn(async () => respostaJson({ data: [], meta: { totalPageCount: 1 } }));
    vi.stubGlobal("fetch", fetchMock);
    await lerLigacoesSunne(2027, 2);
    const [url] = fetchMock.mock.calls[0] as unknown as [URL];
    expect(JSON.parse(url.searchParams.get("filter") ?? "{}").where.started_at.between[1]).toBe("2027-02-28T23:59:59");
  });
});
