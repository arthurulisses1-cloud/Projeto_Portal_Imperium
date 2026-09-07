import type { SupabaseClient } from "@supabase/supabase-js";
import { RANK_ORDER, type Rank } from "@/lib/carreira";

export type Trilha = {
  id: string;
  nome: string;
  rank: Rank | null; // null = Arena (cross-rank)
  tipo: "trilha" | "arena";
  diaSemana: number; // 0=domingo
  horaInicio: string;
  horaFim: string;
  ordem: number;
  ativa: boolean;
};

export type Aula = {
  id: string;
  trilhaId: string;
  ordem: number;
  tema: string;
  descricao: string | null;
  data: string | null;
  instrutorId: string | null;
  instrutorNome: string | null;
  marco: boolean;
  realizada: boolean;
  numMateriais: number;
};

export type Material = {
  id: string;
  nome: string;
  url: string;
  enviadoPorNome: string | null;
  createdAt: string;
};

export async function buscarTrilhas(supabase: SupabaseClient): Promise<Trilha[]> {
  const { data } = await supabase.from("academy_trilhas").select("*").order("ordem");
  return (data ?? []).map((t) => ({
    id: t.id,
    nome: t.nome,
    rank: t.rank,
    tipo: t.tipo,
    diaSemana: t.dia_semana,
    horaInicio: t.hora_inicio,
    horaFim: t.hora_fim,
    ordem: t.ordem,
    ativa: t.ativa,
  }));
}

export async function buscarAulasDaTrilha(supabase: SupabaseClient, trilhaId: string): Promise<Aula[]> {
  const { data } = await supabase
    .from("academy_aulas")
    .select("*, instrutor:profiles(full_name), academy_materiais(count)")
    .eq("trilha_id", trilhaId)
    .order("ordem");
  return mapAulas(data);
}

// Todas as aulas de todas as trilhas — usado na Academy Geral (visão do
// Diretor) pra montar as seções sem N idas ao banco.
export async function buscarTodasAulas(supabase: SupabaseClient): Promise<Aula[]> {
  const { data } = await supabase
    .from("academy_aulas")
    .select("*, instrutor:profiles(full_name), academy_materiais(count)")
    .order("trilha_id")
    .order("ordem");
  return mapAulas(data);
}

export async function buscarAulasParaMinistrar(supabase: SupabaseClient, profileId: string): Promise<(Aula & { trilhaNome: string })[]> {
  const { data } = await supabase
    .from("academy_aulas")
    .select("*, instrutor:profiles(full_name), academy_materiais(count), trilha:academy_trilhas(nome)")
    .eq("instrutor_id", profileId)
    .order("data", { ascending: true, nullsFirst: false });
  return (data ?? []).map((a) => ({
    ...mapAula(a),
    trilhaNome: (a.trilha as unknown as { nome: string } | null)?.nome ?? "—",
  }));
}

export async function buscarMateriais(supabase: SupabaseClient, aulaId: string): Promise<Material[]> {
  const { data } = await supabase
    .from("academy_materiais")
    .select("id, nome, url, created_at, enviado:profiles(full_name)")
    .eq("aula_id", aulaId)
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapMaterial);
}

// Batched — evita 1 query por aula na página (Trilha de Formação e Aulas
// pra Ministrar mostram os materiais de várias aulas de uma vez).
export async function buscarMateriaisPorAulas(
  supabase: SupabaseClient,
  aulaIds: string[]
): Promise<Record<string, Material[]>> {
  if (aulaIds.length === 0) return {};
  const { data } = await supabase
    .from("academy_materiais")
    .select("id, aula_id, nome, url, created_at, enviado:profiles(full_name)")
    .in("aula_id", aulaIds)
    .order("created_at", { ascending: false });
  const porAula: Record<string, Material[]> = {};
  for (const m of data ?? []) {
    (porAula[m.aula_id] = porAula[m.aula_id] ?? []).push(mapMaterial(m));
  }
  return porAula;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapMaterial(m: any): Material {
  return {
    id: m.id,
    nome: m.nome,
    url: m.url,
    enviadoPorNome: (m.enviado as { full_name: string } | null)?.full_name ?? null,
    createdAt: m.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAula(a: any): Aula {
  return {
    id: a.id,
    trilhaId: a.trilha_id,
    ordem: a.ordem,
    tema: a.tema,
    descricao: a.descricao,
    data: a.data,
    instrutorId: a.instrutor_id,
    instrutorNome: (a.instrutor as { full_name: string } | null)?.full_name ?? null,
    marco: a.marco,
    realizada: a.realizada,
    numMateriais: Array.isArray(a.academy_materiais) ? (a.academy_materiais[0]?.count ?? 0) : 0,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAulas(data: any[] | null): Aula[] {
  return (data ?? []).map(mapAula);
}

// Quem pode dar aula pra um rank (ou pra Arena, quando rank é null): todo
// mundo com rank ESTRITAMENTE acima na trilha (RANK_ORDER), mais o Diretor
// sempre elegível pra qualquer trilha (é o topo do ecossistema). Arena
// (rank null) abre pra qualquer um acima de Legionário — mesma régua usada
// no rascunho, cross-rank de propósito.
export async function buscarInstrutoresElegiveis(
  supabase: SupabaseClient,
  rank: Rank | null
): Promise<{ id: string; nome: string }[]> {
  const { data: pessoas } = await supabase
    .from("profiles")
    .select("id, full_name, rank, role")
    .eq("ativo", true);

  const minIdx = rank ? RANK_ORDER.indexOf(rank) : 0;
  const elegiveis = (pessoas ?? []).filter((p) => {
    if (p.role === "diretor") return true;
    const idx = RANK_ORDER.indexOf(p.rank as Rank);
    return idx > minIdx;
  });

  return elegiveis
    .map((p) => ({ id: p.id, nome: p.full_name }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}
