import type { SupabaseClient } from "@supabase/supabase-js";

// Cada "área" corresponde a um link/grupo da lateral esquerda — pedido do
// Diretor, 2026-09-21: permissão customizável "por aba/grupo do menu",
// não por ação individual dentro da página. `verPadrao` é o que o Analista
// enxerga HOJE sem nenhuma configuração especial (ver migration 0080 —
// mesma visão do Diretor, exceto Financeiro/Validações/Pessoas).
export const AREAS_ANALISTA = [
  { key: "mural", label: "Mural", verPadrao: true },
  { key: "tarefas", label: "Tarefas", verPadrao: true },
  { key: "leads", label: "Meus Leads", verPadrao: true },
  { key: "forecast", label: "Forecast", verPadrao: true },
  { key: "legado", label: "Legado (Ranking/Recordes)", verPadrao: true },
  { key: "academy", label: "Imperium Academy", verPadrao: true },
  { key: "dados", label: "Dados (Pace/Compromissos/Weekly/Visão Diária/Metas)", verPadrao: true },
  { key: "financeiro", label: "Financeiro", verPadrao: false },
  { key: "pessoas", label: "Pessoas", verPadrao: false },
  { key: "validacoes", label: "Validações", verPadrao: false },
] as const;

export type AreaAnalista = (typeof AREAS_ANALISTA)[number]["key"];

export type PermissoesAnalista = Record<AreaAnalista, { ver: boolean; editar: boolean }>;

function permissoesPadrao(): PermissoesAnalista {
  return Object.fromEntries(AREAS_ANALISTA.map((a) => [a.key, { ver: a.verPadrao, editar: false }])) as PermissoesAnalista;
}

// Sempre devolve as 10 áreas, mesmo sem nenhuma linha configurada (usa o
// padrão do papel) — quem chama nunca precisa tratar "ausente" separado.
export async function buscarPermissoesAnalista(supabase: SupabaseClient, profileId: string): Promise<PermissoesAnalista> {
  const { data } = await supabase.from("analista_permissoes").select("area, pode_ver, pode_editar").eq("profile_id", profileId);
  const resultado = permissoesPadrao();
  for (const row of data ?? []) {
    if (row.area in resultado) resultado[row.area as AreaAnalista] = { ver: row.pode_ver, editar: row.pode_editar };
  }
  return resultado;
}

// Mesma coisa que buscarPermissoesAnalista, mas pra vários Analistas de
// uma vez (1 query em vez de N) — usado em Gestão de Pessoas, que lista
// todo mundo numa página só.
export async function buscarPermissoesAnalistaEmLote(
  supabase: SupabaseClient,
  profileIds: string[]
): Promise<Map<string, PermissoesAnalista>> {
  const resultado = new Map<string, PermissoesAnalista>();
  for (const id of profileIds) resultado.set(id, permissoesPadrao());
  if (profileIds.length === 0) return resultado;

  const { data } = await supabase
    .from("analista_permissoes")
    .select("profile_id, area, pode_ver, pode_editar")
    .in("profile_id", profileIds);
  for (const row of data ?? []) {
    const permissoes = resultado.get(row.profile_id);
    if (permissoes && row.area in permissoes) permissoes[row.area as AreaAnalista] = { ver: row.pode_ver, editar: row.pode_editar };
  }
  return resultado;
}

// Checagem pronta pra usar no gate de uma página — Diretor sempre passa;
// qualquer outro papel (que não seja Analista) sempre falha aqui (essa
// função é só pro caso "área normalmente exclusiva do Diretor, mas o
// Analista pode ter sido liberado nela"). Quem já libera SDR/Closer/Líder
// numa página continua checando o role deles do jeito de sempre, sem
// passar por aqui.
export async function podeVerArea(supabase: SupabaseClient, userId: string, role: string, area: AreaAnalista): Promise<boolean> {
  if (role === "diretor") return true;
  if (role !== "analista") return false;
  const permissoes = await buscarPermissoesAnalista(supabase, userId);
  return permissoes[area].ver;
}
