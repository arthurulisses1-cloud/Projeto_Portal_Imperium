// Ligações da Api4Com do Inside Sales da Sunne (Energy), lidas direto da API,
// sem espelho no banco. Só roda no servidor (a chave nunca vai ao navegador) e
// fica em cache por alguns minutos, como a rede da Sunne.
//
// A conta da Api4Com (grupogx) é do grupo todo, com ramais da Vorp, da Matriext
// e de outros. Os da Sunne são os dos responsáveis do funil Inside Sales do
// Pipefácil da Sunne. A Api4Com não liga ramal a pessoa (os ramais usam
// apelidos e e-mails pessoais), então o vínculo é a lista abaixo, conferida em
// 16/11/2026. Responsável novo no Inside Sales = ramal novo aqui.
//
// Contrato visto na API em 16/11/2026:
//   - token no header `Authorization` (sem "Bearer");
//   - `GET /calls`, até 1000 por página, `meta.totalPageCount`;
//   - `filter` é JSON do LoopBack: `where` com `started_at.between` e `or` de
//     `{ from: ramal }` (o `inq` é recusado com HTTP 400);
//   - `started_at` vem com "Z", mas é a hora de Brasília, e o filtro compara
//     esse mesmo texto: o mês sai do texto, sem converter fuso;
//   - `duration` é o tempo falado em segundos (0 quando ninguém atendeu).
// Telefone, gravação e e-mail são descartados na leitura e não entram no cache.
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { casarOrganizacao, type PerfilParaCasar } from "@/lib/sunne";

const BASE = "https://api.api4com.com/api/v1";
const MAX_PAGINAS = 30;
export const CACHE_API4COM_SEGUNDOS = 300;
/** Conexão: ligação com 90 s ou mais falados. */
export const LIMIAR_CONEXAO_S = 90;

/** Ramal da Api4Com → responsável no Inside Sales (casado com a pessoa do portal pelo nome ou apelido). */
export const RAMAIS_SUNNE: Record<string, string> = {
  "1068": "Rafael Saboya",
  "1118": "Alexander Silveira",
  "1119": "Silvio de Azevedo Rocha Filho",
  "1129": "Mikael Oliveira",
  "1136": "Iago Guilherme Martins dos Santos",
  "1146": "Vinicius Pereira",
};

/** Só o que o portal usa de cada ligação. `quando` é a hora de Brasília, sem fuso. */
export type Ligacao = { id: string; ramal: string; quando: string; falado: number };

export type LigacoesPessoa = {
  ramal: string;
  nome: string;
  profileId: string | null;
  pessoa: string | null;
  ligacoes: number;
  alos: number;
  conexoes: number;
};

export type LigacoesResumo = {
  ligacoes: number;
  /** Atendidas: houve tempo falado. */
  alos: number;
  /** 90 s ou mais falados. */
  conexoes: number;
  porPessoa: LigacoesPessoa[];
  lidoEm: string;
};

// ---------------------------------------------------------------- leitura da API

function lerLigacao(bruto: unknown): Ligacao {
  const c = (bruto ?? {}) as Record<string, unknown>;
  const ramal = typeof c.from === "string" || typeof c.from === "number" ? String(c.from) : "";
  if (typeof c.id !== "string" || !ramal || typeof c.started_at !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(c.started_at)) {
    throw new Error("Ligação Api4Com inválida");
  }
  const falado = Number(c.duration);
  return { id: c.id, ramal, quando: c.started_at.slice(0, 19), falado: Number.isFinite(falado) && falado > 0 ? Math.round(falado) : 0 };
}

function ultimoDia(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Ligações dos ramais da Sunne no mês, todas as páginas, sem repetir. */
export async function lerLigacoesSunne(ano: number, mes: number): Promise<{ ligacoes: Ligacao[]; lidoEm: string }> {
  const token = process.env.API4COM_API_TOKEN_SUNNE?.trim();
  if (!token) throw new Error("Api4Com da Sunne não configurada");
  const mm = String(mes).padStart(2, "0");
  const where = {
    started_at: { between: [`${ano}-${mm}-01T00:00:00`, `${ano}-${mm}-${String(ultimoDia(ano, mes)).padStart(2, "0")}T23:59:59`] },
    or: Object.keys(RAMAIS_SUNNE).map((ramal) => ({ from: ramal })),
  };
  const porId = new Map<string, Ligacao>();
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const url = new URL(`${BASE}/calls`);
    url.searchParams.set("page", String(pagina));
    url.searchParams.set("filter", JSON.stringify({ where }));
    const resposta = await fetch(url, { headers: { Authorization: token }, cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!resposta.ok) throw new Error(`Api4Com HTTP ${resposta.status} em /calls`);
    const corpo = (await resposta.json()) as { data?: unknown; meta?: { totalPageCount?: unknown } } | null;
    if (!Array.isArray(corpo?.data)) throw new Error("Resposta Api4Com inválida em /calls");
    for (const bruto of corpo.data) {
      const ligacao = lerLigacao(bruto);
      // Garante o recorte mesmo se a API ignorar parte do filtro.
      if (RAMAIS_SUNNE[ligacao.ramal] && ligacao.quando.startsWith(`${ano}-${mm}-`)) porId.set(ligacao.id, ligacao);
    }
    const total = Number(corpo.meta?.totalPageCount ?? 1);
    if (!Number.isFinite(total) || pagina >= total) return { ligacoes: Array.from(porId.values()), lidoEm: new Date().toISOString() };
  }
  throw new Error("Api4Com: ligações demais no mês");
}

const ligacoesEmCache = unstable_cache(lerLigacoesSunne, ["api4com-sunne-v1"], { revalidate: CACHE_API4COM_SEGUNDOS, tags: ["api4com"] });

// ---------------------------------------------------------------- resumo do mês

/**
 * Ligações, alôs (atendidas) e conexões (90 s ou mais) no total e por
 * responsável. A pessoa do portal sai do nome do responsável (nome completo ou
 * apelidos de Gestão de Pessoas), como na Sunne.
 */
export function resumirLigacoes(ligacoes: Ligacao[], perfis: PerfilParaCasar[] = []): Omit<LigacoesResumo, "lidoEm"> {
  const nomePor = new Map(perfis.map((p) => [p.id, p.full_name]));
  const porRamal = new Map<string, LigacoesPessoa>();
  let total = 0;
  let alos = 0;
  let conexoes = 0;
  for (const l of ligacoes) {
    const nome = RAMAIS_SUNNE[l.ramal];
    if (!nome) continue;
    let p = porRamal.get(l.ramal);
    if (!p) {
      const profileId = casarOrganizacao(nome, perfis);
      p = { ramal: l.ramal, nome, profileId, pessoa: profileId ? nomePor.get(profileId) ?? null : null, ligacoes: 0, alos: 0, conexoes: 0 };
      porRamal.set(l.ramal, p);
    }
    total++;
    p.ligacoes++;
    if (l.falado > 0) {
      alos++;
      p.alos++;
    }
    if (l.falado >= LIMIAR_CONEXAO_S) {
      conexoes++;
      p.conexoes++;
    }
  }
  return {
    ligacoes: total,
    alos,
    conexoes,
    porPessoa: Array.from(porRamal.values()).sort(
      (a, b) => b.conexoes - a.conexoes || b.alos - a.alos || b.ligacoes - a.ligacoes || (a.pessoa ?? a.nome).localeCompare(b.pessoa ?? b.nome, "pt-BR"),
    ),
  };
}

/** Resumo do mês para o Dashboard do Energy: Api4Com (em cache) + pessoas do portal. */
export async function buscarLigacoesSunne(supabase: SupabaseClient, ano: number, mes: number): Promise<LigacoesResumo> {
  const [lido, { data: perfis, error }] = await Promise.all([ligacoesEmCache(ano, mes), supabase.from("profiles").select("id, full_name, nomes_planilha").eq("ativo", true)]);
  if (error) throw new Error("Erro lendo profiles: " + error.message);
  return { ...resumirLigacoes(lido.ligacoes, perfis ?? []), lidoEm: lido.lidoEm };
}
