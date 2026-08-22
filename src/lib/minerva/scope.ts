import type { SupabaseClient } from "@supabase/supabase-js";

export type Escopo = {
  // null = sem restrição (só o Diretor) — todo o resto (viewer, tools)
  // sempre filtra por essa lista quando ela não é null.
  idsPermitidos: string[] | null;
  role: string;
  viewerId: string;
};

// A Minerva do Diretor enxerga a firma inteira, sem filtro (pedido
// explícito, 2026-08-22). Todo outro papel só vê o que já é visível pra
// ele hoje no resto do Portal: SDR só a si mesmo, Closer a própria Tribo,
// Líder o próprio Exército — mesmo que a RLS da tabela em si seja mais
// aberta (ex.: `vendas`/`producao_funil` são select-all pra qualquer
// autenticado), essa função é quem garante que a Minerva não vaza dado de
// outro time pra quem não deveria ver.
export async function resolverEscopo(supabase: SupabaseClient, viewerId: string, role: string): Promise<Escopo> {
  // Investidor é gestão pura (mesmo acesso de visão do Diretor na Minerva,
  // liberado a pedido, 2026-08-22) — mas nunca aparece como "pessoa" nos
  // agregados de ninguém, porque as tools já filtram por role sdr/closer/
  // lider (ver pessoasNoEscopo em tools.ts), igual o Diretor já não aparecia.
  if (role === "diretor" || role === "investidor") return { idsPermitidos: null, role, viewerId };

  if (role === "sdr") return { idsPermitidos: [viewerId], role, viewerId };

  if (role === "closer") {
    const { data: profile } = await supabase.from("profiles").select("tribo_id").eq("id", viewerId).single();
    if (!profile?.tribo_id) return { idsPermitidos: [viewerId], role, viewerId };
    const { data: membros } = await supabase
      .from("profiles")
      .select("id")
      .eq("tribo_id", profile.tribo_id)
      .in("role", ["sdr", "closer"]);
    return { idsPermitidos: (membros ?? []).map((m) => m.id), role, viewerId };
  }

  if (role === "lider") {
    const { data: exercito } = await supabase.from("exercitos").select("id").eq("legado_id", viewerId).maybeSingle();
    if (!exercito) return { idsPermitidos: [viewerId], role, viewerId };
    const { data: tribos } = await supabase.from("tribos").select("id").eq("exercito_id", exercito.id);
    const triboIds = (tribos ?? []).map((t) => t.id);
    const { data: membros } =
      triboIds.length > 0
        ? await supabase.from("profiles").select("id").in("tribo_id", triboIds).in("role", ["sdr", "closer"])
        : { data: [] };
    return { idsPermitidos: [...(membros ?? []).map((m) => m.id), viewerId], role, viewerId };
  }

  return { idsPermitidos: [viewerId], role, viewerId };
}
