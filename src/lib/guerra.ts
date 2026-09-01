import type { SupabaseClient } from "@supabase/supabase-js";

export type Confronto = { nome: string; valor: number };

// Uma operação PAGA já resolvida pro grupo (Exército/Tribo) dela, com a
// `data` junto — base tanto pra agregação do mês corrente (Guerra Civil/
// Guerra de Tribos no Mural) quanto pra varredura histórica mês a mês (ver
// buscarRecordesAuto em src/lib/recordes.ts).
export type OperacaoPagaPorGrupo = { data: string; chave: string; nome: string; exercitoNome: string | null; valor: number };

const CHAVE_FORA = "__fora__";

// Usa weekly_operacoes (uma linha por venda real, com SDR+Closer juntos) em
// vez de `vendas` — `vendas` credita SDR e Closer em linhas separadas, cada
// uma com o valor cheio, então somar por time duplicaria o crédito sempre
// que os dois forem do mesmo Exército/Tribo (o caso comum).
//
// Resolve cada operação paga pro grupo dela (sem agregar ainda) — extraído
// pra função própria pra recordes.ts poder reaproveitar a MESMA regra de
// fallback do Legado sem Tribo e a regra "mesma Tribo, senão Fora da Tribo"
// ao invés de duplicá-la (achado 2026-08-27: evitar 2 implementações da
// mesma regra divergindo com o tempo, como já aconteceu antes — ver memória
// "Pegadinha: Legado do Exército não tem Tribo própria").
async function resolverOperacoesPagasPorGrupo(
  supabase: SupabaseClient,
  agrupar: "exercito" | "tribo",
  filtro?: { desde?: string; ate?: string }
): Promise<OperacaoPagaPorGrupo[]> {
  let query = supabase.from("weekly_operacoes").select("sdr_profile_id, closer_profile_id, valor, data").eq("status", "PAGO");
  if (filtro?.desde) query = query.gte("data", filtro.desde);
  if (filtro?.ate) query = query.lte("data", filtro.ate);
  const { data: ops } = await query;
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

  // Pro agrupamento por Tribo, a CHAVE precisa ser namespaced por Exército
  // ("Exército|Tribo") — existem Tribos com o MESMO NOME em Exércitos
  // diferentes (ex.: "Inbound" no Maximus e "Inbound" nos Templários), e sem
  // isso a produção das duas se mistura numa única barra na Guerra de Tribos.
  const grupoPorProfile = new Map<string, { chave: string; nome: string; exercitoNome: string | null }>();
  for (const p of pessoas ?? []) {
    const tribo = p.tribo as unknown as { nome: string; exercito: { nome: string } | null } | null;
    if (agrupar === "exercito") {
      const nome = tribo?.exercito?.nome ?? exercitoPorLegadoId.get(p.id);
      if (nome) grupoPorProfile.set(p.id, { chave: nome, nome, exercitoNome: null });
    } else {
      if (tribo?.nome) {
        const exercitoNome = tribo.exercito?.nome ?? null;
        grupoPorProfile.set(p.id, { chave: `${exercitoNome ?? "?"}|${tribo.nome}`, nome: tribo.nome, exercitoNome });
      }
    }
  }

  const resultado: OperacaoPagaPorGrupo[] = [];
  for (const o of ops) {
    if (agrupar === "tribo") {
      // Regra do Diretor (2026-08-25, mesma de Minha Produção): só conta pra
      // uma Tribo quando SDR e Closer são da MESMA Tribo (inclusive quando é
      // a mesma pessoa nos dois papéis) — senão vai pro "Fora das Tribos",
      // mesmo que os dois lados sejam de Tribos válidas, só que diferentes
      // (ex.: Closer da Tribo A fechou com SDR da Tribo B).
      const sdrGrupo = o.sdr_profile_id ? grupoPorProfile.get(o.sdr_profile_id) : undefined;
      const closerGrupo = o.closer_profile_id ? grupoPorProfile.get(o.closer_profile_id) : undefined;
      if (sdrGrupo && closerGrupo && sdrGrupo.chave === closerGrupo.chave) {
        resultado.push({ data: o.data, chave: sdrGrupo.chave, nome: sdrGrupo.nome, exercitoNome: sdrGrupo.exercitoNome, valor: Number(o.valor) });
      } else {
        resultado.push({ data: o.data, chave: CHAVE_FORA, nome: "Fora das Tribos", exercitoNome: null, valor: Number(o.valor) });
      }
      continue;
    }
    // Exército (Guerra Civil): time do negócio = time do Closer, com
    // fallback pro SDR — a regra "mesma Tribo" é só pro corte de Tribo.
    const grupo =
      (o.closer_profile_id && grupoPorProfile.get(o.closer_profile_id)) ||
      (o.sdr_profile_id && grupoPorProfile.get(o.sdr_profile_id));
    if (!grupo) {
      // Ninguém dos dois lados pertence a um Exército resolvível (ex.:
      // Legado do Exército fechou sozinho, sem SDR de nenhuma Tribo envolvido).
      // Não descarta o valor — sem isso a soma da Guerra Civil fica menor
      // que a grana real paga no mês.
      resultado.push({ data: o.data, chave: CHAVE_FORA, nome: "Fora dos Exércitos", exercitoNome: null, valor: Number(o.valor) });
      continue;
    }
    resultado.push({ data: o.data, chave: grupo.chave, nome: grupo.nome, exercitoNome: grupo.exercitoNome, valor: Number(o.valor) });
  }

  return resultado;
}

// Agrega uma lista de operações já resolvidas (ver acima) num ranking de
// grupos, igual ao Confronto do Mural — usado tanto pro mês corrente quanto,
// em recordes.ts, por bucket de mês do histórico inteiro.
function agregarPorGrupo(operacoes: OperacaoPagaPorGrupo[]): Confronto[] {
  const totais = new Map<string, { nome: string; exercitoNome: string | null; valor: number }>();
  let foraDoGrupo = 0;
  let nomeFora = "Fora";
  for (const o of operacoes) {
    if (o.chave === CHAVE_FORA) {
      foraDoGrupo += o.valor;
      nomeFora = o.nome;
      continue;
    }
    const atual = totais.get(o.chave);
    totais.set(o.chave, { nome: o.nome, exercitoNome: o.exercitoNome, valor: (atual?.valor ?? 0) + o.valor });
  }

  // Só desambigua o nome exibido (acrescenta "(Exército)") quando duas
  // entradas diferentes têm o mesmo nome de Tribo — no caso comum (nomes
  // únicos) mantém o nome puro, sem mudar o visual de hoje.
  const contagemPorNome = new Map<string, number>();
  Array.from(totais.values()).forEach(({ nome }) => contagemPorNome.set(nome, (contagemPorNome.get(nome) ?? 0) + 1));

  const resultado = Array.from(totais.values())
    .map(({ nome, exercitoNome, valor }) => ({
      nome: (contagemPorNome.get(nome) ?? 0) > 1 && exercitoNome ? `${nome} (${exercitoNome})` : nome,
      valor,
    }))
    .sort((a, b) => b.valor - a.valor);

  // Sempre por último — é uma categoria de acerto de contas, não um
  // concorrente de verdade, então nunca deve ganhar a coroa de 1º lugar.
  if (foraDoGrupo > 0) {
    resultado.push({ nome: nomeFora, valor: foraDoGrupo });
  }

  return resultado;
}

// inicioMes/fimMes (ambos inclusive) — o mês visto no Mural, que pode ser um
// mês passado (pedido do Diretor, 2026-09-01: "onde vejo como finalizaram as
// competições de Tribo/Exército/pessoa do mês passado" — o Mural já tinha
// seletor de mês pras metas, mas a Guerra Civil/Ranking ficavam sempre
// travadas no mês corrente, por decisão de escopo anterior que não se
// sustentou: olhar Agosto de novo mostrava tudo zerado).
async function pagosMesPorGrupo(
  supabase: SupabaseClient,
  agrupar: "exercito" | "tribo",
  inicioMes: string,
  fimMes: string
): Promise<Confronto[]> {
  const operacoes = await resolverOperacoesPagasPorGrupo(supabase, agrupar, { desde: inicioMes, ate: fimMes });
  return agregarPorGrupo(operacoes);
}

export function buscarConfrontoExercitos(supabase: SupabaseClient, inicioMes: string, fimMes: string) {
  return pagosMesPorGrupo(supabase, "exercito", inicioMes, fimMes);
}
export function buscarConfrontoTribos(supabase: SupabaseClient, inicioMes: string, fimMes: string) {
  return pagosMesPorGrupo(supabase, "tribo", inicioMes, fimMes);
}

// Todo o histórico de operações pagas já resolvidas pro grupo — pra
// recordes.ts bucketar por mês e achar o melhor mês de cada Exército/Tribo,
// sem duplicar a lógica de resolução de grupo acima.
export function buscarOperacoesPagasPorGrupoHistorico(supabase: SupabaseClient, agrupar: "exercito" | "tribo") {
  return resolverOperacoesPagasPorGrupo(supabase, agrupar);
}
export { agregarPorGrupo };

// Mapa nome da Tribo -> logo_url (só as que já subiram uma logo própria em /tribo).
// Inclui também a chave desambiguada "Tribo (Exército)" — pagosMesPorGrupo usa
// esse formato quando duas Tribos de Exércitos diferentes têm o mesmo nome.
export async function buscarCrestsTribos(supabase: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await supabase.from("tribos").select("nome, logo_url, exercito:exercitos(nome)").not("logo_url", "is", null);
  const mapa: Record<string, string> = {};
  for (const t of data ?? []) {
    if (!t.logo_url) continue;
    mapa[t.nome] = t.logo_url;
    const exercitoNome = (t.exercito as unknown as { nome: string } | null)?.nome;
    if (exercitoNome) mapa[`${t.nome} (${exercitoNome})`] = t.logo_url;
  }
  return mapa;
}

export async function buscarTopCredito(
  supabase: SupabaseClient,
  inicioMes: string,
  fimMes: string,
  limite = 5
): Promise<Confronto[]> {
  const { data: pessoas } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("role", ["sdr", "closer"]);
  const nomePorId = new Map((pessoas ?? []).map((p) => [p.id, p.full_name]));
  const ids = Array.from(nomePorId.keys());
  if (ids.length === 0) return [];

  const { data: vendas } = await supabase
    .from("vendas")
    .select("profile_id, valor")
    .in("profile_id", ids)
    .gte("data", inicioMes)
    .lte("data", fimMes);

  const totais = new Map<string, number>();
  for (const v of vendas ?? []) {
    totais.set(v.profile_id, (totais.get(v.profile_id) ?? 0) + Number(v.valor));
  }

  return Array.from(totais.entries())
    .map(([id, valor]) => ({ nome: nomePorId.get(id) ?? "—", valor }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, limite);
}
