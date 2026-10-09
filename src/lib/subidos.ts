import type { SupabaseClient } from "@supabase/supabase-js";

// Volume de subidos (documentação enviada pro compliance, registrada em Meus
// Leads — migration 0089). Fica FORA do funil/pace de propósito (pedido do
// Diretor, 2026-10-09: "não quero complicar o processo, prefiro incentivar o
// time a assinar direto"): aparece só no compromisso do dia e nos reports do
// Mural e da Visão Diária. A pessoa é quem registrou o subido.
export type SubidoRegistro = { pessoaId: string; data: string };

export async function buscarSubidos(
  supabase: SupabaseClient,
  inicio: string,
  fimExclusivo: string,
  ids?: string[]
): Promise<SubidoRegistro[]> {
  if (ids && ids.length === 0) return [];
  let query = supabase
    .from("entrevistas_leads")
    .select("subido_por, closer_profile_id, subido_em")
    .not("subido_em", "is", null)
    .gte("subido_em", inicio)
    .lt("subido_em", fimExclusivo)
    .limit(5000);
  if (ids) query = query.or(`subido_por.in.(${ids.join(",")}),and(subido_por.is.null,closer_profile_id.in.(${ids.join(",")}))`);

  const { data } = await query;
  return (data ?? [])
    .map((r) => ({ pessoaId: (r.subido_por ?? r.closer_profile_id) as string | null, data: r.subido_em as string }))
    .filter((r): r is SubidoRegistro => !!r.pessoaId);
}

export function contarPorPessoa(registros: SubidoRegistro[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const r of registros) mapa.set(r.pessoaId, (mapa.get(r.pessoaId) ?? 0) + 1);
  return mapa;
}
