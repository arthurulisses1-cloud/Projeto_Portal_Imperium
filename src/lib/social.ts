import type { SupabaseClient } from "@supabase/supabase-js";

export type AlvoTipo = "mural_post" | "campanha";

export type Comentario = {
  id: string;
  texto: string;
  createdAt: string;
  autorId: string;
  autorNome: string;
  mencionados: string[]; // nomes das pessoas marcadas nesse comentário
};

export type ReacaoResumo = {
  porEmoji: { emoji: string; qtd: number }[];
  minhaReacao: string | null;
};

export const EMOJIS_REACAO = ["👍", "❤️", "🔥", "👏"];

export async function buscarComentarios(
  supabase: SupabaseClient,
  alvoTipo: AlvoTipo,
  alvoIds: string[]
): Promise<Map<string, Comentario[]>> {
  if (alvoIds.length === 0) return new Map();

  const { data: rows } = await supabase
    .from("post_comentarios")
    .select("id, alvo_id, texto, created_at, autor_id, autor:profiles!post_comentarios_autor_id_fkey(full_name)")
    .eq("alvo_tipo", alvoTipo)
    .in("alvo_id", alvoIds)
    .order("created_at", { ascending: true });

  const comentarioIds = (rows ?? []).map((r) => r.id);
  const { data: mencoesRows } =
    comentarioIds.length > 0
      ? await supabase
          .from("post_mencoes")
          .select("comentario_id, profile:profiles!post_mencoes_profile_id_fkey(full_name)")
          .in("comentario_id", comentarioIds)
      : { data: [] };

  const mencoesPorComentario = new Map<string, string[]>();
  for (const m of mencoesRows ?? []) {
    const nome = (m.profile as unknown as { full_name: string } | null)?.full_name;
    if (!nome) continue;
    const atual = mencoesPorComentario.get(m.comentario_id) ?? [];
    atual.push(nome);
    mencoesPorComentario.set(m.comentario_id, atual);
  }

  const porAlvo = new Map<string, Comentario[]>();
  for (const r of rows ?? []) {
    const autor = r.autor as unknown as { full_name: string } | null;
    const lista = porAlvo.get(r.alvo_id) ?? [];
    lista.push({
      id: r.id,
      texto: r.texto,
      createdAt: r.created_at,
      autorId: r.autor_id,
      autorNome: autor?.full_name ?? "—",
      mencionados: mencoesPorComentario.get(r.id) ?? [],
    });
    porAlvo.set(r.alvo_id, lista);
  }
  return porAlvo;
}

export async function buscarReacoes(
  supabase: SupabaseClient,
  alvoTipo: AlvoTipo,
  alvoIds: string[],
  meId: string
): Promise<Map<string, ReacaoResumo>> {
  if (alvoIds.length === 0) return new Map();

  const { data: rows } = await supabase
    .from("post_reacoes")
    .select("alvo_id, profile_id, emoji")
    .eq("alvo_tipo", alvoTipo)
    .in("alvo_id", alvoIds);

  const porAlvo = new Map<string, ReacaoResumo>();
  for (const r of rows ?? []) {
    const atual = porAlvo.get(r.alvo_id) ?? { porEmoji: [], minhaReacao: null };
    const existente = atual.porEmoji.find((e) => e.emoji === r.emoji);
    if (existente) existente.qtd++;
    else atual.porEmoji.push({ emoji: r.emoji, qtd: 1 });
    if (r.profile_id === meId) atual.minhaReacao = r.emoji;
    porAlvo.set(r.alvo_id, atual);
  }
  return porAlvo;
}

export async function contarMencoesNaoLidas(supabase: SupabaseClient, profileId: string): Promise<number> {
  const { count } = await supabase
    .from("post_mencoes")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("lido", false);
  return count ?? 0;
}

export type MencaoPendente = {
  id: string;
  comentarioTexto: string;
  autorNome: string;
  alvoTipo: AlvoTipo;
  alvoId: string;
  createdAt: string;
};

export async function buscarMencoesPendentes(supabase: SupabaseClient, profileId: string): Promise<MencaoPendente[]> {
  const { data } = await supabase
    .from("post_mencoes")
    .select(
      "id, created_at, comentario:post_comentarios!post_mencoes_comentario_id_fkey(texto, alvo_tipo, alvo_id, autor:profiles!post_comentarios_autor_id_fkey(full_name))"
    )
    .eq("profile_id", profileId)
    .eq("lido", false)
    .order("created_at", { ascending: false })
    .limit(20);

  return (data ?? [])
    .map((r) => {
      const c = r.comentario as unknown as {
        texto: string;
        alvo_tipo: AlvoTipo;
        alvo_id: string;
        autor: { full_name: string } | null;
      } | null;
      if (!c) return null;
      return {
        id: r.id,
        comentarioTexto: c.texto,
        autorNome: c.autor?.full_name ?? "—",
        alvoTipo: c.alvo_tipo,
        alvoId: c.alvo_id,
        createdAt: r.created_at,
      };
    })
    .filter((x): x is MencaoPendente => x !== null);
}
