import type { SupabaseClient } from "@supabase/supabase-js";

export type Confronto = { nome: string; valor: number };

// Usa weekly_operacoes (uma linha por venda real, com SDR+Closer juntos) em
// vez de `vendas` — `vendas` credita SDR e Closer em linhas separadas, cada
// uma com o valor cheio, então somar por time duplicaria o crédito sempre
// que os dois forem do mesmo Exército/Tribo (o caso comum).
async function pagosMesPorGrupo(
  supabase: SupabaseClient,
  agrupar: "exercito" | "tribo"
): Promise<Confronto[]> {
  const inicioMes = new Date().toISOString().slice(0, 7) + "-01";
  const { data: ops } = await supabase
    .from("weekly_operacoes")
    .select("sdr_profile_id, closer_profile_id, valor")
    .eq("status", "PAGO")
    .gte("data", inicioMes);
  if (!ops || ops.length === 0) return [];

  const idsEnvolvidos = Array.from(
    new Set(ops.flatMap((o) => [o.sdr_profile_id, o.closer_profile_id]).filter((x): x is string => !!x))
  );
  if (idsEnvolvidos.length === 0) return [];

  const [{ data: pessoas }, { data: exercitos }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, tribo:tribos!profiles_tribo_id_fkey(nome, exercito:exercitos(nome))")
      .in("id", idsEnvolvidos),
    // Legado do Exército não tem Tribo própria — sem isso, uma venda fechada
    // por ele (sozinho ou com um SDR de time diferente) some da Guerra Civil
    // ou vai pro time errado (do parceiro), em vez do time que ele lidera.
    agrupar === "exercito"
      ? supabase.from("exercitos").select("nome, legado_id").in("legado_id", idsEnvolvidos)
      : Promise.resolve({ data: [] }),
  ]);

  const exercitoPorLegadoId = new Map((exercitos ?? []).map((e) => [e.legado_id, e.nome]));

  const grupoPorProfile = new Map<string, string>();
  for (const p of pessoas ?? []) {
    const tribo = p.tribo as unknown as { nome: string; exercito: { nome: string } | null } | null;
    const chave =
      agrupar === "exercito"
        ? tribo?.exercito?.nome ?? exercitoPorLegadoId.get(p.id)
        : tribo?.nome;
    if (chave) grupoPorProfile.set(p.id, chave);
  }

  const totais = new Map<string, number>();
  let foraDoGrupo = 0;
  for (const o of ops) {
    // Time do negócio = time do Closer, com fallback pro SDR — mesma regra da Weekly de Receita.
    const grupo =
      (o.closer_profile_id && grupoPorProfile.get(o.closer_profile_id)) ||
      (o.sdr_profile_id && grupoPorProfile.get(o.sdr_profile_id));
    if (!grupo) {
      // Ninguém dos dois lados pertence a uma Tribo/Exército resolvível (ex.:
      // Legado do Exército fechou sozinho, sem SDR de nenhuma Tribo envolvido).
      // Não descarta o valor — sem isso a soma da Guerra de Tribos fica menor
      // que a da Guerra Civil, que é a mesma grana vista de outro corte.
      foraDoGrupo += Number(o.valor);
      continue;
    }
    totais.set(grupo, (totais.get(grupo) ?? 0) + Number(o.valor));
  }

  const resultado = Array.from(totais.entries())
    .map(([nome, valor]) => ({ nome, valor }))
    .sort((a, b) => b.valor - a.valor);

  // Sempre por último — é uma categoria de acerto de contas, não um
  // concorrente de verdade, então nunca deve ganhar a coroa de 1º lugar.
  if (foraDoGrupo > 0) {
    resultado.push({ nome: agrupar === "exercito" ? "Fora dos Exércitos" : "Fora das Tribos", valor: foraDoGrupo });
  }

  return resultado;
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
