import type { SupabaseClient } from "@supabase/supabase-js";

export type Confronto = { nome: string; valor: number };

async function pagosMesPorGrupo(
  supabase: SupabaseClient,
  agrupar: "exercito" | "tribo"
): Promise<Confronto[]> {
  const { data: pessoas } = await supabase
    .from("profiles")
    .select("id, tribo:tribos!profiles_tribo_id_fkey(nome, exercito:exercitos(nome))")
    .in("role", ["sdr", "closer"]);

  const grupoPorProfile = new Map<string, string>();
  for (const p of pessoas ?? []) {
    const tribo = p.tribo as unknown as { nome: string; exercito: { nome: string } | null } | null;
    const chave = agrupar === "exercito" ? tribo?.exercito?.nome : tribo?.nome;
    if (chave) grupoPorProfile.set(p.id, chave);
  }

  const ids = Array.from(grupoPorProfile.keys());
  if (ids.length === 0) return [];

  const inicioMes = new Date().toISOString().slice(0, 7) + "-01";
  const { data: vendas } = await supabase
    .from("vendas")
    .select("profile_id, valor")
    .in("profile_id", ids)
    .gte("data", inicioMes);

  const totais = new Map<string, number>();
  for (const v of vendas ?? []) {
    const grupo = grupoPorProfile.get(v.profile_id);
    if (!grupo) continue;
    totais.set(grupo, (totais.get(grupo) ?? 0) + Number(v.valor));
  }

  return Array.from(totais.entries())
    .map(([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor);
}

export function buscarConfrontoExercitos(supabase: SupabaseClient) {
  return pagosMesPorGrupo(supabase, "exercito");
}
export function buscarConfrontoTribos(supabase: SupabaseClient) {
  return pagosMesPorGrupo(supabase, "tribo");
}

// Mapa nome da Tribo -> logo_url (só as que já subiram uma logo própria em /tribo)
export async function buscarCrestsTribos(supabase: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await supabase.from("tribos").select("nome, logo_url").not("logo_url", "is", null);
  const mapa: Record<string, string> = {};
  for (const t of data ?? []) {
    if (t.logo_url) mapa[t.nome] = t.logo_url;
  }
  return mapa;
}

export async function buscarTopCredito(supabase: SupabaseClient, limite = 5): Promise<Confronto[]> {
  const { data: pessoas } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("role", ["sdr", "closer"]);
  const nomePorId = new Map((pessoas ?? []).map((p) => [p.id, p.full_name]));
  const ids = Array.from(nomePorId.keys());
  if (ids.length === 0) return [];

  const inicioMes = new Date().toISOString().slice(0, 7) + "-01";
  const { data: vendas } = await supabase
    .from("vendas")
    .select("profile_id, valor")
    .in("profile_id", ids)
    .gte("data", inicioMes);

  const totais = new Map<string, number>();
  for (const v of vendas ?? []) {
    totais.set(v.profile_id, (totais.get(v.profile_id) ?? 0) + Number(v.valor));
  }

  return Array.from(totais.entries())
    .map(([id, valor]) => ({ nome: nomePorId.get(id) ?? "—", valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, limite);
}
