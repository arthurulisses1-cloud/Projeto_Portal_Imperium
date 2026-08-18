import type { SupabaseClient } from "@supabase/supabase-js";

export type MarcoProgresso = {
  id: string;
  nome: string;
  threshold: number;
  icone: string;
  imagemUrl: string | null;
  alcancado: boolean;
  falta: number;
};

// Produção acumulada = soma de vendas desde 1º de janeiro do ano corrente.
// Os marcos (R$350k a R$2M) são muito maiores que a produção de um mês só,
// então a leitura é sempre "ano corrente", não "mês corrente".
export async function buscarProgressoMarcos(
  supabase: SupabaseClient,
  profileId: string
): Promise<{ marcos: MarcoProgresso[]; producaoAno: number }> {
  const inicioAno = `${new Date().getFullYear()}-01-01`;

  const [{ data: marcosRows }, { data: vendasAno }] = await Promise.all([
    supabase.from("marcos").select("id, nome, threshold, icone, imagem_url").order("ordem"),
    supabase.from("vendas").select("valor").eq("profile_id", profileId).gte("data", inicioAno),
  ]);

  const producaoAno = (vendasAno ?? []).reduce((s, v) => s + Number(v.valor), 0);

  const marcos = (marcosRows ?? []).map((m) => ({
    id: m.id,
    nome: m.nome,
    threshold: m.threshold,
    icone: m.icone,
    imagemUrl: m.imagem_url,
    alcancado: producaoAno >= m.threshold,
    falta: Math.max(0, m.threshold - producaoAno),
  }));

  return { marcos, producaoAno };
}
