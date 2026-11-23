// Bônus de conduta (R$ 200 do fixo fechado), liberado pelo Diretor no fim do mês. Estritamente Diretor/Investidor.
import type { SupabaseClient } from "@supabase/supabase-js";

/** Situação do bônus de uma pessoa no mês: aplicado, não aplicado, ou ainda não decidido (conta como aplicado na previsão). */
export type EstadoBonus = "aplicado" | "nao" | "pendente";

export const chaveBonus = (profileId: string, negocioId: string) => `${profileId}:${negocioId}`;

/** Quanto do bônus entra no custo do mês: o aplicado e o ainda pendente (previsão conservadora); o não aplicado não (pura). */
export function bonusEfetivo(f: { bonus?: number; bonusEstado?: EstadoBonus }): number {
  return !f.bonus || f.bonusEstado === "nao" ? 0 : f.bonus;
}

/** Decisões já gravadas do mês: chave profile:negocio → aplicado. Sem a tabela (migration 0122), vazio. */
export async function buscarDecisoesBonus(supabase: SupabaseClient, ano: number, mes: number): Promise<Map<string, { aplicado: boolean; decididoEm: string }>> {
  const out = new Map<string, { aplicado: boolean; decididoEm: string }>();
  const { data, error } = await supabase.from("bonus_conduta_mes").select("profile_id, negocio_id, aplicado, decidido_em").eq("ano", ano).eq("mes", mes);
  if (error) return out;
  for (const d of data ?? []) out.set(chaveBonus(d.profile_id as string, d.negocio_id as string), { aplicado: !!d.aplicado, decididoEm: d.decidido_em as string });
  return out;
}

export function estadoDoBonus(decisao: { aplicado: boolean } | undefined): EstadoBonus {
  return !decisao ? "pendente" : decisao.aplicado ? "aplicado" : "nao";
}
