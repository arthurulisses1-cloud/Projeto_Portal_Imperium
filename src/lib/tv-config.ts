import type { SupabaseClient } from "@supabase/supabase-js";

// Chaves fixas de cada tela do Painel TV — a tela "duelo" só entra de fato
// no rodízio quando existem 2 Exércitos pra comparar (ver TvDisplay.tsx);
// as outras 9 são sempre exibidas.
export const TV_SLIDES: { chave: string; label: string }[] = [
  { chave: "ligacoes", label: "Ligações do dia" },
  { chave: "duelo", label: "Duelo de Funis" },
  { chave: "entrevistas-hoje", label: "Entrevistas do Dia" },
  { chave: "conexoes", label: "Top 10 Conexões do dia" },
  { chave: "tribos", label: "Guerra de Tribos" },
  { chave: "credito", label: "Top 10 Crédito do mês" },
  { chave: "exercitos", label: "Guerra de Exércitos" },
  { chave: "campanhas", label: "Campanhas do Senatus" },
  { chave: "entrevistas-mes", label: "Top 5 Entrevistas do mês" },
  { chave: "lendas", label: "Lendas do Império" },
];

const ORDEM_PADRAO = TV_SLIDES.map((s) => s.chave);

// Sempre retorna as 10 chaves, mesmo que o banco tenha uma ordem
// desatualizada (chave nova ainda não salva, chave removida) — chaves
// salvas e ainda válidas mantêm a ordem escolhida; o resto (novo ou
// esquecido) cai no fim, na ordem padrão.
export async function buscarOrdemSlides(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase.from("tv_config").select("ordem_slides").eq("id", true).maybeSingle();
  const salva = (data?.ordem_slides ?? []).filter((c: string) => ORDEM_PADRAO.includes(c));
  const faltando = ORDEM_PADRAO.filter((c) => !salva.includes(c));
  return [...salva, ...faltando];
}
