import type { SupabaseClient } from "@supabase/supabase-js";
import { FUNNEL_STAGES, FUNNEL_LABELS, type FunilEtapa } from "@/lib/funil";
import { hojeBR } from "@/lib/data-br";

export type Transicao = { de: FunilEtapa; para: FunilEtapa; label: string };

export const TRANSICOES: Transicao[] = FUNNEL_STAGES.slice(0, -1).map((etapa, i) => {
  const proxima = FUNNEL_STAGES[i + 1];
  return { de: etapa, para: proxima, label: `${FUNNEL_LABELS[etapa]} → ${FUNNEL_LABELS[proxima]}` };
});

export const MESES_LABEL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Deriva a meta de CADA etapa do funil a partir da meta de crédito + ticket
// médio (dá a meta de Pagos) e das taxas de conversão esperadas (anda de
// trás pra frente até Tentativas). Etapa sem taxa cadastrada fica null —
// não dá pra estimar sem esse dado.
export function calcularFunilMeta(
  metaCredito: number,
  metaTicketMedio: number,
  taxas: Map<string, number>
): Record<FunilEtapa, number | null> {
  const resultado = Object.fromEntries(
    FUNNEL_STAGES.map((e) => [e, null])
  ) as Record<FunilEtapa, number | null>;

  if (metaTicketMedio > 0) {
    resultado.pagos = metaCredito / metaTicketMedio;
  }

  for (let i = FUNNEL_STAGES.length - 2; i >= 0; i--) {
    const etapa = FUNNEL_STAGES[i];
    const proxima = FUNNEL_STAGES[i + 1];
    const proximoValor = resultado[proxima];
    const taxa = taxas.get(`${etapa}_${proxima}`);
    resultado[etapa] = proximoValor !== null && taxa ? proximoValor / taxa : null;
  }

  return resultado;
}

// Meta de crédito individual do mês: meta da TRIBO (já com a regra especial
// de Inbound = metade de uma Tribo lógica — ver mapaMetaCreditoPorTribo)
// dividida pelos membros dela. Também devolve a tabela de taxas de
// conversão esperadas e a meta de ticket médio, pra reaproveitar em várias
// telas.
//
// Achado 2026-08-24: essa função tinha sua PRÓPRIA divisão (firma ÷
// Exércitos ÷ Tribos do Exército ÷ membros), separada da de
// mapaMetaCreditoPorTribo/buscarMetaTribo — ignorava a regra do Inbound
// por completo. Pra alguém sozinho numa Tribo Inbound (ex.: Cristina em
// Inbound Templários), isso mostrava R$ 833k de meta pessoal em vez dos
// R$ 500k corretos (Inbound Templários tratada como 1 de 3 Tribos normais
// do Exército, não como metade de UMA Tribo lógica dividida com a outra
// metade do Inbound). Agora reaproveita a mesma fonte, garantindo que
// "Tribo" e "Individual" nunca mais divirjam.
export async function buscarMetaIndividual(supabase: SupabaseClient, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("tribo_id")
    .eq("id", userId)
    .single();

  const [anoAgora, mesAgora] = hojeBR().split("-").map(Number);
  const { data: metaMes } = await supabase
    .from("metas_mensais")
    .select("id, meta_credito_total, meta_ticket_medio")
    .eq("ano", anoAgora)
    .eq("mes", mesAgora)
    .maybeSingle();

  const { data: conversoes } = metaMes
    ? await supabase
        .from("metas_conversao")
        .select("etapa_de, etapa_para, taxa_esperada")
        .eq("meta_mensal_id", metaMes.id)
    : { data: [] };
  const taxas = new Map((conversoes ?? []).map((c) => [`${c.etapa_de}_${c.etapa_para}`, c.taxa_esperada]));

  let metaIndividual = 0;
  if (profile?.tribo_id && metaMes?.meta_credito_total) {
    const [mapaPorTribo, { count: numMembros }] = await Promise.all([
      mapaMetaCreditoPorTribo(supabase, metaMes.meta_credito_total),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("tribo_id", profile.tribo_id).in("role", ["sdr", "closer"]),
    ]);
    const metaTribo = mapaPorTribo.get(profile.tribo_id) ?? 0;
    if (numMembros) metaIndividual = metaTribo / numMembros;
  }

  return {
    metaCreditoIndividual: metaIndividual,
    metaTicketMedio: metaMes?.meta_ticket_medio ?? 0,
    taxas,
  };
}

// Divide a meta de crédito da firma igualmente entre Tribos — TRATANDO
// "Inbound Maximus"/"Inbound Templários" como METADE de UMA Tribo lógica só
// (regra explícita do Diretor, 2026-08-19: "divida a meta por 5, e subdivida
// o inbound por 2" — com 4 Tribos normais + Inbound, 5M vira 1M cada Tribo
// normal e 500K cada metade do Inbound). Provisório até existir um esquema
// de meta por Tribo mais elaborado — por ora é só divisão igual.
export async function mapaMetaCreditoPorTribo(
  supabase: SupabaseClient,
  metaCreditoTotal: number
): Promise<Map<string, number>> {
  const { data: todasTribos } = await supabase.from("tribos").select("id, nome");
  const mapa = new Map<string, number>();
  if (!todasTribos || todasTribos.length === 0 || metaCreditoTotal <= 0) return mapa;

  const inbound = todasTribos.filter((t) => t.nome.startsWith("Inbound"));
  const normais = todasTribos.filter((t) => !t.nome.startsWith("Inbound"));
  const numGruposLogicos = normais.length + (inbound.length > 0 ? 1 : 0);
  if (numGruposLogicos === 0) return mapa;

  const metaPorGrupo = metaCreditoTotal / numGruposLogicos;
  for (const t of normais) mapa.set(t.id, metaPorGrupo);
  for (const t of inbound) mapa.set(t.id, metaPorGrupo / inbound.length);
  return mapa;
}

// Meta de crédito da TRIBO inteira (soma dos membros) — usada pra "Produção
// coletiva do mês" em /tribo e /exercito, e pro "Meta do mês" do Closer no
// Mural (meta do TIME, não só a fatia pessoal — comparar a produção coletiva
// com a meta de UMA pessoa deixaria a barra sempre "muito acima da meta").
export async function buscarMetaTribo(supabase: SupabaseClient, triboId: string) {
  const [anoAgora, mesAgora] = hojeBR().split("-").map(Number);
  const { data: metaMes } = await supabase
    .from("metas_mensais")
    .select("id, meta_credito_total, meta_ticket_medio")
    .eq("ano", anoAgora)
    .eq("mes", mesAgora)
    .maybeSingle();

  const { data: conversoes } = metaMes
    ? await supabase
        .from("metas_conversao")
        .select("etapa_de, etapa_para, taxa_esperada")
        .eq("meta_mensal_id", metaMes.id)
    : { data: [] };
  const taxas = new Map((conversoes ?? []).map((c) => [`${c.etapa_de}_${c.etapa_para}`, c.taxa_esperada]));

  const mapa = await mapaMetaCreditoPorTribo(supabase, metaMes?.meta_credito_total ?? 0);

  return {
    metaCreditoTribo: mapa.get(triboId) ?? 0,
    metaTicketMedio: metaMes?.meta_ticket_medio ?? 0,
    taxas,
  };
}

export type EscopoTime =
  | { tipo: "exercito"; exercitoId: string }
  | { tipo: "tribo"; triboId: string }
  | { tipo: "individual"; profileId: string }
  | null;

// Meta de crédito do escopo (Tribo/Exército/firma inteira) + ticket médio e
// taxas esperadas do mês — usado pra derivar a meta de CADA etapa do funil
// via calcularFunilMeta, no mesmo escopo. Ticket médio e taxas vêm de
// metas_mensais/metas_conversao, que não são por Tribo/Exército (só a meta
// de crédito é dividida) — por isso busca ela uma vez só, direto, pros
// casos que buscarMetaTribo não cobre (Exército/firma só devolvem o número).
export async function buscarMetaComTaxas(
  supabase: SupabaseClient,
  escopo: EscopoTime
): Promise<{ metaCredito: number; metaTicketMedio: number; taxas: Map<string, number> }> {
  if (escopo?.tipo === "tribo") {
    const r = await buscarMetaTribo(supabase, escopo.triboId);
    return { metaCredito: r.metaCreditoTribo, metaTicketMedio: r.metaTicketMedio, taxas: r.taxas };
  }

  if (escopo?.tipo === "individual") {
    const r = await buscarMetaIndividual(supabase, escopo.profileId);
    return { metaCredito: r.metaCreditoIndividual, metaTicketMedio: r.metaTicketMedio, taxas: r.taxas };
  }

  const [anoAgora, mesAgora] = hojeBR().split("-").map(Number);
  const { data: metaMes } = await supabase
    .from("metas_mensais")
    .select("id, meta_credito_total, meta_ticket_medio")
    .eq("ano", anoAgora)
    .eq("mes", mesAgora)
    .maybeSingle();
  const { data: conversoes } = metaMes
    ? await supabase.from("metas_conversao").select("etapa_de, etapa_para, taxa_esperada").eq("meta_mensal_id", metaMes.id)
    : { data: [] };
  const taxas = new Map((conversoes ?? []).map((c) => [`${c.etapa_de}_${c.etapa_para}`, c.taxa_esperada]));

  if (escopo?.tipo === "exercito") {
    const metaCredito = await buscarMetaExercito(supabase, escopo.exercitoId);
    return { metaCredito, metaTicketMedio: metaMes?.meta_ticket_medio ?? 0, taxas };
  }

  // null = firma inteira (Diretor)
  return { metaCredito: metaMes?.meta_credito_total ?? 0, metaTicketMedio: metaMes?.meta_ticket_medio ?? 0, taxas };
}

// Meta de crédito do EXÉRCITO inteiro = soma da meta de cada Tribo dele
// (mesma divisão igual-por-Tribo-lógica de buscarMetaTribo) — pro "Meta do
// mês" do líder no Mural, mesmo card que SDR/Closer já tinham com a própria
// meta pessoal.
export async function buscarMetaExercito(supabase: SupabaseClient, exercitoId: string): Promise<number> {
  const [anoAgora, mesAgora] = hojeBR().split("-").map(Number);
  const [{ data: metaMes }, { data: tribosDoExercito }] = await Promise.all([
    supabase
      .from("metas_mensais")
      .select("meta_credito_total")
      .eq("ano", anoAgora)
      .eq("mes", mesAgora)
      .maybeSingle(),
    supabase.from("tribos").select("id").eq("exercito_id", exercitoId),
  ]);
  const mapa = await mapaMetaCreditoPorTribo(supabase, metaMes?.meta_credito_total ?? 0);
  return (tribosDoExercito ?? []).reduce((s, t) => s + (mapa.get(t.id) ?? 0), 0);
}

// Produção PAGA do mês de UM Exército, com a mesma regra de atribuição de
// time do resto do sistema: o time DONO da operação é o do Closer, com o SDR
// como fallback só quando o Closer não resolve time nenhum (inclui o Legado
// do Exército, que não tem tribo_id) — precisa resolver o time de TODO MUNDO
// envolvido nas operações do mês, não só de quem já é dessa Tribo, senão uma
// operação cujo Closer é de outro Exército "vaza" pra cá pelo lado do SDR.
export async function buscarProducaoPagaExercito(
  supabase: SupabaseClient,
  exercitoId: string,
  inicioMes: string
): Promise<number> {
  const { data: opsPagas } = await supabase
    .from("weekly_operacoes")
    .select("valor, sdr_profile_id, closer_profile_id")
    .eq("status", "PAGO")
    .gte("data", inicioMes);

  const idsEnvolvidos = Array.from(
    new Set((opsPagas ?? []).flatMap((o) => [o.sdr_profile_id, o.closer_profile_id]).filter((x): x is string => !!x))
  );
  if (idsEnvolvidos.length === 0) return 0;

  const [{ data: pessoas }, { data: exercitos }] = await Promise.all([
    supabase.from("profiles").select("id, tribo:tribos!profiles_tribo_id_fkey(exercito_id)").in("id", idsEnvolvidos),
    supabase.from("exercitos").select("id, legado_id"),
  ]);
  const exercitoIdPorLegadoId = new Map((exercitos ?? []).map((e) => [e.legado_id, e.id]));
  const exercitoPorProfileId = new Map(
    (pessoas ?? []).map((p) => [
      p.id,
      (p.tribo as unknown as { exercito_id: string } | null)?.exercito_id ?? exercitoIdPorLegadoId.get(p.id) ?? null,
    ])
  );

  return (opsPagas ?? [])
    .filter((o) => {
      const timeDaOperacao =
        (o.closer_profile_id && exercitoPorProfileId.get(o.closer_profile_id)) ||
        (o.sdr_profile_id && exercitoPorProfileId.get(o.sdr_profile_id));
      return timeDaOperacao === exercitoId;
    })
    .reduce((s, o) => s + Number(o.valor), 0);
}

// Resolve o time (Tribo ou Exército) de cada profile_id — mesmo padrão de
// buscarProducaoPagaTribo/Exercito, extraído aqui pra reaproveitar em
// buscarRealizadoHoje sem duplicar a lógica de fallback do Legado.
async function resolverTimeId(
  supabase: SupabaseClient,
  profileIds: string[],
  tipo: "tribo" | "exercito"
): Promise<Map<string, string | null>> {
  if (profileIds.length === 0) return new Map();
  const [{ data: pessoas }, { data: exercitos }] = await Promise.all([
    supabase.from("profiles").select("id, tribo_id, tribo:tribos!profiles_tribo_id_fkey(exercito_id)").in("id", profileIds),
    tipo === "exercito" ? supabase.from("exercitos").select("id, legado_id") : Promise.resolve({ data: [] }),
  ]);
  const exercitoIdPorLegadoId = new Map((exercitos ?? []).map((e) => [e.legado_id, e.id]));
  return new Map(
    (pessoas ?? []).map((p) => {
      const tribo = p.tribo as unknown as { exercito_id: string } | null;
      const timeId = tipo === "tribo" ? p.tribo_id : (tribo?.exercito_id ?? exercitoIdPorLegadoId.get(p.id) ?? null);
      return [p.id, timeId];
    })
  );
}

// "Até agora seu time está fazendo" / "Ontem seu time fez" (Central de
// Notificações) — realizado de UM dia (hoje ou ontem), pro escopo dado.
// Cuidado que já custou 2 bugs achados nesta sessão (campanhas e a barra
// do Mural do Closer): SDR e Closer recebem crédito PRÓPRIO pra mesma
// entrevista/venda (um agenda/vende, o outro conduz/fecha) — somar todo
// mundo do time sem cuidado conta a MESMA coisa duas vezes sempre que os
// dois são do mesmo time (o caso normal).
//
// Assinaturas/Pagos: recalculado de weekly_operacoes (1 linha por
// OPERAÇÃO, não por papel) com dono = time do Closer, SDR de fallback —
// mesma convenção de buscarProducaoPagaTribo/Exercito, sem duplicar.
// Entrevistas: producao_funil não tem id de evento pra dedupear de
// verdade (só agregado por pessoa/dia/papel) — conta só o lado SDR/ambos
// (quem AGENDOU, ver src/lib/sync/entrevistas.ts), que dá 1 crédito por
// entrevista real na prática.
//
// Escopo "individual" (SDR vendo o PRÓPRIO dia, não o time): não tem risco
// de duplicar entre PESSOAS diferentes, então conta todo o papel (SDR e
// Closer) da própria pessoa — é a mesma produção dela, exercida nos dois
// papéis possíveis, igual ao Ranking individual já faz.
export async function buscarRealizadoDia(
  supabase: SupabaseClient,
  escopo: EscopoTime,
  idsEquipe: string[],
  data: string
): Promise<{ entrevistas: number; assinaturas: number; pagos: number }> {
  const individual = escopo?.tipo === "individual";

  const [{ data: entrevistasRows }, { data: assinadasDia }, { data: pagasDia }] = await Promise.all([
    idsEquipe.length > 0
      ? (() => {
          let q = supabase.from("producao_funil").select("realizado").in("profile_id", idsEquipe).eq("etapa", "entrevistas").eq("data", data);
          if (!individual) q = q.neq("papel", "closer");
          return q;
        })()
      : Promise.resolve({ data: [] }),
    supabase.from("weekly_operacoes").select("sdr_profile_id, closer_profile_id").eq("data", data),
    supabase.from("weekly_operacoes").select("sdr_profile_id, closer_profile_id").eq("status", "PAGO").eq("pago_em", data),
  ]);
  const entrevistas = (entrevistasRows ?? []).reduce((s, r) => s + r.realizado, 0);

  if (!escopo) {
    // Firma inteira: toda operação do dia conta, sem filtro de dono.
    return { entrevistas, assinaturas: (assinadasDia ?? []).length, pagos: (pagasDia ?? []).length };
  }

  if (escopo.tipo === "individual") {
    const meuId = escopo.profileId;
    const contarIndividual = (ops: { sdr_profile_id: string | null; closer_profile_id: string | null }[]) =>
      ops.filter((o) => o.sdr_profile_id === meuId || o.closer_profile_id === meuId).length;
    return { entrevistas, assinaturas: contarIndividual(assinadasDia ?? []), pagos: contarIndividual(pagasDia ?? []) };
  }

  const idsEnvolvidos = Array.from(
    new Set(
      [...(assinadasDia ?? []), ...(pagasDia ?? [])]
        .flatMap((o) => [o.sdr_profile_id, o.closer_profile_id])
        .filter((x): x is string => !!x)
    )
  );
  const timePorProfileId = await resolverTimeId(supabase, idsEnvolvidos, escopo.tipo);
  const idAlvo = escopo.tipo === "tribo" ? escopo.triboId : escopo.exercitoId;

  const contar = (ops: { sdr_profile_id: string | null; closer_profile_id: string | null }[]) =>
    ops.filter((o) => {
      const dono =
        (o.closer_profile_id && timePorProfileId.get(o.closer_profile_id)) ||
        (o.sdr_profile_id && timePorProfileId.get(o.sdr_profile_id));
      return dono === idAlvo;
    }).length;

  return { entrevistas, assinaturas: contar(assinadasDia ?? []), pagos: contar(pagasDia ?? []) };
}

// Meta de crédito da FIRMA inteira do mês — é só o valor bruto cadastrado
// pelo Diretor em metas_mensais, sem nenhuma divisão (a mesma base que as
// funções de Exército/Tribo dividem entre si).
export async function buscarMetaFirma(supabase: SupabaseClient): Promise<number> {
  const [anoAgora, mesAgora] = hojeBR().split("-").map(Number);
  const { data: metaMes } = await supabase
    .from("metas_mensais")
    .select("meta_credito_total")
    .eq("ano", anoAgora)
    .eq("mes", mesAgora)
    .maybeSingle();
  return metaMes?.meta_credito_total ?? 0;
}

// Produção PAGA do mês da FIRMA inteira — soma direta, sem filtrar por
// Exército/Tribo (é o "Meta do mês" que o Diretor vê no Mural).
export async function buscarProducaoPagaFirma(supabase: SupabaseClient, inicioMes: string): Promise<number> {
  const { data: opsPagas } = await supabase
    .from("weekly_operacoes")
    .select("valor")
    .eq("status", "PAGO")
    .gte("data", inicioMes);
  return (opsPagas ?? []).reduce((s, o) => s + Number(o.valor), 0);
}

export type PainelFinanceiro = {
  paraPagar: number;
  pendencia: number;
  previsaoCredito: number;
  pagoMaisParaPagar: number;
};

// Mesma classificação que o Forecast usa (status_manual, catálogo
// preenchido por closer/líder/diretor): "pra pagar" = Aguardando
// Pagamento, "em pendência" = Resolvendo Pendência. Compartilhado entre o
// painel do Diretor (firma inteira), do Closer (própria Tribo) e do SDR
// (própria produção) — só muda o filtro de quais operações entram.
function calcularPainelFinanceiro(
  ops: { valor: number; status: string; status_manual: string | null }[]
): PainelFinanceiro {
  let pago = 0;
  let paraPagar = 0;
  let pendencia = 0;
  for (const o of ops) {
    const valor = Number(o.valor);
    if (o.status === "PAGO") pago += valor;
    else if (o.status_manual === "aguardando_pagamento") paraPagar += valor;
    else if (o.status_manual === "resolvendo_pendencia") pendencia += valor;
  }
  return { paraPagar, pendencia, previsaoCredito: pago + paraPagar + pendencia, pagoMaisParaPagar: pago + paraPagar };
}

// SDR/Closer fechando sozinho ("ambos") aparece como sdr_profile_id E
// closer_profile_id na mesma linha — o filtro OR já cobre isso sem duplicar
// (é a MESMA linha, contada uma vez).
export async function buscarPainelFinanceiroPessoa(
  supabase: SupabaseClient,
  profileId: string,
  inicioMes: string,
  fimMes: string
): Promise<PainelFinanceiro> {
  const { data: ops } = await supabase
    .from("weekly_operacoes")
    .select("valor, status, status_manual")
    .gte("data", inicioMes)
    .lte("data", fimMes)
    .or(`sdr_profile_id.eq.${profileId},closer_profile_id.eq.${profileId}`);
  return calcularPainelFinanceiro(ops ?? []);
}

// Mesma regra "time dono = Tribo do Closer, fallback Tribo do SDR" que
// buscarProducaoPagaTribo usa pro crédito já pago.
export async function buscarPainelFinanceiroTribo(
  supabase: SupabaseClient,
  triboId: string,
  inicioMes: string,
  fimMes: string
): Promise<PainelFinanceiro> {
  const { data: ops } = await supabase
    .from("weekly_operacoes")
    .select("valor, status, status_manual, sdr_profile_id, closer_profile_id")
    .gte("data", inicioMes)
    .lte("data", fimMes);

  const idsEnvolvidos = Array.from(
    new Set((ops ?? []).flatMap((o) => [o.sdr_profile_id, o.closer_profile_id]).filter((x): x is string => !!x))
  );
  if (idsEnvolvidos.length === 0) return calcularPainelFinanceiro([]);

  const { data: pessoas } = await supabase.from("profiles").select("id, tribo_id").in("id", idsEnvolvidos);
  const triboPorProfileId = new Map((pessoas ?? []).map((p) => [p.id, p.tribo_id]));

  const opsDaTribo = (ops ?? []).filter((o) => {
    const timeDaOperacao =
      (o.closer_profile_id && triboPorProfileId.get(o.closer_profile_id)) ||
      (o.sdr_profile_id && triboPorProfileId.get(o.sdr_profile_id));
    return timeDaOperacao === triboId;
  });
  return calcularPainelFinanceiro(opsDaTribo);
}

// Mesma regra que buscarProducaoPagaExercito, mas no nível da Tribo: time
// dono da operação = Tribo do Closer, fallback pra Tribo do SDR. Líder não
// tem tribo_id — uma operação fechada por ele (sem Closer de Tribo nenhuma
// envolvido) não conta pra Tribo nenhuma, só pro Exército.
export async function buscarProducaoPagaTribo(supabase: SupabaseClient, triboId: string, inicioMes: string): Promise<number> {
  const { data: opsPagas } = await supabase
    .from("weekly_operacoes")
    .select("valor, sdr_profile_id, closer_profile_id")
    .eq("status", "PAGO")
    .gte("data", inicioMes);

  const idsEnvolvidos = Array.from(
    new Set((opsPagas ?? []).flatMap((o) => [o.sdr_profile_id, o.closer_profile_id]).filter((x): x is string => !!x))
  );
  if (idsEnvolvidos.length === 0) return 0;

  const { data: pessoas } = await supabase.from("profiles").select("id, tribo_id").in("id", idsEnvolvidos);
  const triboPorProfileId = new Map((pessoas ?? []).map((p) => [p.id, p.tribo_id]));

  return (opsPagas ?? [])
    .filter((o) => {
      const timeDaOperacao =
        (o.closer_profile_id && triboPorProfileId.get(o.closer_profile_id)) ||
        (o.sdr_profile_id && triboPorProfileId.get(o.sdr_profile_id));
      return timeDaOperacao === triboId;
    })
    .reduce((s, o) => s + Number(o.valor), 0);
}
