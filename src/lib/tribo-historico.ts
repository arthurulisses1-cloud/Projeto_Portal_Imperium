import type { SupabaseClient } from "@supabase/supabase-js";

// Histórico de Tribo por pessoa (pedido do Diretor, 2026-10-13: ao trocar o
// Fernando de equipe, o que ele fez antes continua na equipe antiga e só o
// que vier depois conta na nova). `profiles.tribo_id` segue sendo a tribo
// ATUAL; esta tabela diz onde a pessoa estava em cada data.
export type TriboHistorico = {
  profile_id: string;
  tribo_id: string;
  desde: string; // YYYY-MM-DD, inclusivo
  ate: string | null; // YYYY-MM-DD, inclusivo; null = vigente
};

// Tribo em que a pessoa estava naquela data. Sem linha de histórico que cubra
// a data (migration ainda não rodada, pessoa sem registro), cai na tribo atual
// — o comportamento de antes do histórico existir.
export function triboNaData(
  historico: TriboHistorico[],
  profileId: string,
  data: string,
  triboAtualId: string | null
): string | null {
  for (const h of historico) {
    if (h.profile_id !== profileId) continue;
    if (h.desde <= data && (h.ate === null || data <= h.ate)) return h.tribo_id;
  }
  return triboAtualId;
}

// Tolerante: se a tabela ainda não existe (migration 0092 não rodada), devolve
// vazio e tudo segue pela tribo atual.
export async function buscarHistoricoTribos(supabase: SupabaseClient): Promise<TriboHistorico[]> {
  const { data, error } = await supabase.from("profile_tribo_historico").select("profile_id, tribo_id, desde, ate");
  if (error) return [];
  return (data ?? []) as TriboHistorico[];
}
