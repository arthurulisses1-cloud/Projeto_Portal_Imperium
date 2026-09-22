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
  // Pôster da "série" no Imperioflix (2026-09-21) — sem capa, cai no
  // gradiente/ícone padrão da trilha (visualDaTrilha).
  capaUrl: string | null;
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
  // Escritos pelo instrutor DEPOIS de dar a aula (2026-09-21) — alimentam
  // a "Netflix" de Trilhas de Formação (resumo do que rolou + gravação).
  resumo: string | null;
  videoUrl: string | null;
};

// Visão de cobrança do Diretor em "Aulas para Ministrar" (2026-09-22): só
// aulas já vencidas (data <= hoje) e ainda não fechadas, pra saber com quem
// cobrar — a mesma regra de "pode fechar" (material + presença) usada no
// card do próprio instrutor.
export type AulaComCobranca = Aula & { trilhaNome: string; temMaterial: boolean; temPresenca: boolean };

export type Material = {
  id: string;
  nome: string;
  url: string;
  enviadoPorNome: string | null;
  createdAt: string;
};

// "Prateleira" alternativa (Netflix) — conteúdo solto, sem agenda,
// criado livremente pelo Diretor (2026-09-21). `ranksLiberados` vazio =
// liberado pra todo mundo; com rank(s), quem não tem ainda VÊ o módulo
// (cadeado na UI), só não abre.
export type Modulo = {
  id: string;
  titulo: string;
  descricao: string | null;
  capaUrl: string | null;
  ordem: number;
  ativo: boolean;
  ranksLiberados: Rank[];
  // Categoria livre pra agrupar em prateleiras temáticas no Imperioflix
  // (ex: "marketing", "vendas") — null cai na prateleira "Outros".
  categoria: string | null;
  // Aparece também na prateleira "Top 5", curada manualmente pelo Diretor.
  destaque: boolean;
};

export type ModuloItem = {
  id: string;
  moduloId: string;
  titulo: string;
  resumo: string | null;
  tipo: "video" | "arquivo";
  videoUrl: string | null;
  arquivoUrl: string | null;
  ordem: number;
};

// Categorias fixas pré-criadas (migration 0086) pra organizar os módulos
// alternativos em prateleiras temáticas no Imperioflix — Diretor pode
// deixar um módulo fora de todas (cai em "Outros").
export const CATEGORIAS_MODULO: { value: string; label: string }[] = [
  { value: "marketing", label: "Marketing" },
  { value: "vendas", label: "Vendas" },
  { value: "mentalidade", label: "Mentalidade" },
  { value: "gestao", label: "Gestão" },
  { value: "podcast", label: "Podcasts" },
];

// Diretor/Analista/Legado não têm rank de trilha (fora do RANK_ORDER
// legionario..legado) — trata como "sem rank", só entra em módulo aberto
// pra todo mundo. `rank` null cobre esse caso e qualquer papel sem rank.
export function moduloLiberadoPara(modulo: Pick<Modulo, "ranksLiberados">, rank: Rank | null): boolean {
  if (modulo.ranksLiberados.length === 0) return true;
  return rank !== null && modulo.ranksLiberados.includes(rank);
}

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
    capaUrl: t.capa_url ?? null,
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
    resumo: a.resumo ?? null,
    videoUrl: a.video_url ?? null,
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAulas(data: any[] | null): Aula[] {
  return (data ?? []).map(mapAula);
}

export type AlunoAudiencia = { id: string; nome: string };

// Quem "deveria" assistir uma aula, dado o {tipo, rank} da trilha dela —
// mesmo recorte que já era usado (embutido, não reaproveitável) em
// sincronizarTasksDaAula (src/app/(app)/academy/actions.ts): Arena é
// cross-rank (todo SDR/Closer ativo); trilha normal é só quem tem o rank
// exato dela. Extraído pra cá pra a lista de presença (2026-09-21) usar a
// MESMA regra da geração de tarefas-lembrete, sem duplicar a lógica.
// Recebe {tipo, rank} já carregados (em vez de trilhaId) pra quem já tem a
// trilha em mãos não precisar buscar de novo — ver resolverAudienciaDaAula
// abaixo pra quem só tem o id.
export async function resolverAudienciaDaTrilha(
  supabase: SupabaseClient,
  trilha: { tipo: string; rank: string | null }
): Promise<AlunoAudiencia[]> {
  let query = supabase.from("profiles").select("id, full_name").eq("ativo", true);
  query = trilha.tipo === "arena" ? query.in("role", ["sdr", "closer"]) : query.eq("rank", trilha.rank);
  const { data } = await query.order("full_name");
  return (data ?? []).map((p) => ({ id: p.id, nome: p.full_name }));
}

export async function resolverAudienciaDaAula(supabase: SupabaseClient, trilhaId: string): Promise<AlunoAudiencia[]> {
  const { data: trilha } = await supabase.from("academy_trilhas").select("tipo, rank").eq("id", trilhaId).maybeSingle();
  if (!trilha) return [];
  return resolverAudienciaDaTrilha(supabase, trilha);
}

// Presença já marcada (aluno_id -> presente) pra um lote de aulas — usado
// na página "Aulas para Ministrar" pra pré-marcar os checkboxes de quem
// já foi confirmado antes.
export async function buscarPresencasPorAulas(
  supabase: SupabaseClient,
  aulaIds: string[]
): Promise<Record<string, Record<string, boolean>>> {
  if (aulaIds.length === 0) return {};
  const { data } = await supabase.from("academy_presencas").select("aula_id, aluno_id, presente").in("aula_id", aulaIds);
  const porAula: Record<string, Record<string, boolean>> = {};
  for (const p of data ?? []) {
    (porAula[p.aula_id] ??= {})[p.aluno_id] = p.presente;
  }
  return porAula;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapModulo(m: any): Modulo {
  return {
    id: m.id,
    titulo: m.titulo,
    descricao: m.descricao,
    capaUrl: m.capa_url,
    ordem: m.ordem,
    ativo: m.ativo,
    ranksLiberados: m.ranks_liberados ?? [],
    categoria: m.categoria ?? null,
    destaque: m.destaque ?? false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapModuloItem(i: any): ModuloItem {
  return {
    id: i.id,
    moduloId: i.modulo_id,
    titulo: i.titulo,
    resumo: i.resumo,
    tipo: i.tipo,
    videoUrl: i.video_url,
    arquivoUrl: i.arquivo_url,
    ordem: i.ordem,
  };
}

export async function buscarModulos(supabase: SupabaseClient, { soAtivos = false }: { soAtivos?: boolean } = {}): Promise<Modulo[]> {
  let query = supabase.from("academy_modulos").select("*").order("ordem");
  if (soAtivos) query = query.eq("ativo", true);
  const { data } = await query;
  return (data ?? []).map(mapModulo);
}

export async function buscarItensDoModulo(supabase: SupabaseClient, moduloId: string): Promise<ModuloItem[]> {
  const { data } = await supabase.from("academy_modulo_itens").select("*").eq("modulo_id", moduloId).order("ordem");
  return (data ?? []).map(mapModuloItem);
}

// Batched — evita 1 query por módulo na Netflix (várias prateleiras de
// uma vez) e na Academy Geral (lista de módulos com contagem de itens).
export async function buscarItensPorModulos(supabase: SupabaseClient, moduloIds: string[]): Promise<Record<string, ModuloItem[]>> {
  if (moduloIds.length === 0) return {};
  const { data } = await supabase.from("academy_modulo_itens").select("*").in("modulo_id", moduloIds).order("ordem");
  const porModulo: Record<string, ModuloItem[]> = {};
  for (const i of data ?? []) {
    (porModulo[i.modulo_id] ??= []).push(mapModuloItem(i));
  }
  return porModulo;
}

// "Assistido" no Imperioflix — set de `alvo_id`s que ESSE aluno já marcou
// como vistos, pra um lote de aulas + itens de módulo de uma vez.
export async function buscarAssistidos(
  supabase: SupabaseClient,
  alunoId: string,
  idsAulas: string[],
  idsItens: string[]
): Promise<Set<string>> {
  const todosIds = [...idsAulas, ...idsItens];
  if (todosIds.length === 0) return new Set();
  // alvo_id é UUID gerado pelo banco — não precisa distinguir por alvo_tipo
  // aqui, colisão entre uma aula e um item de módulo é praticamente impossível.
  const { data } = await supabase.from("academy_progresso").select("alvo_id").eq("aluno_id", alunoId).in("alvo_id", todosIds);
  return new Set((data ?? []).map((r) => r.alvo_id));
}
