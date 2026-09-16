import type { SupabaseClient } from "@supabase/supabase-js";
import { calcularFunilMeta, buscarMetaComTaxas, type AnoMes, type EscopoTime } from "@/lib/metas";
import { ehFimDeSemana, paraDataUTC } from "@/lib/data-br";

export type ParDia<T = number> = { realizado: T; meta: T };

export type PaceDia = {
  data: string;
  diaSemana: string;
  util: boolean;
  tentativas: ParDia;
  alos: ParDia;
  conexoes: ParDia;
  entrevistas: ParDia;
  assinadosQtd: ParDia;
  assinadosValor: ParDia;
  pagosQtd: ParDia;
  pagosValor: ParDia;
  tkm: ParDia;
};

export type PaceResumo = {
  tentativas: number;
  alos: number;
  alosPct: number | null;
  conexoes: number;
  conexoesPct: number | null;
  entrevistas: number;
  entrevistasPct: number | null;
  assinados: number;
  assinadosPct: number | null;
  pagos: number;
  pagosPct: number | null;
  tkm: number;
  credito: number;
};

export type PaceMes = {
  meta: PaceResumo;
  realizado: PaceResumo;
  dias: PaceDia[];
};

const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

// Resolve o conjunto de profile_id que contam pro escopo pedido — mesmo
// recorte já usado em Comando Geral/Exército/Tribo pra "produção do time":
// firma = todo SDR/Closer ativo; Exército = Closers+SDRs das Tribos dele;
// Tribo = seu Closer + seus SDRs; individual = só a própria pessoa.
export async function resolverIdsDoEscopo(supabase: SupabaseClient, escopo: EscopoTime): Promise<string[]> {
  if (escopo?.tipo === "individual") return [escopo.profileId];

  if (escopo?.tipo === "tribo") {
    const [{ data: tribo }, { data: sdrs }] = await Promise.all([
      supabase.from("tribos").select("closer_id").eq("id", escopo.triboId).maybeSingle(),
      supabase.from("profiles").select("id").eq("tribo_id", escopo.triboId).eq("role", "sdr").eq("ativo", true),
    ]);
    return Array.from(new Set([...(tribo?.closer_id ? [tribo.closer_id] : []), ...(sdrs ?? []).map((s) => s.id)]));
  }

  if (escopo?.tipo === "exercito") {
    const { data: tribosDoExercito } = await supabase.from("tribos").select("id, closer_id").eq("exercito_id", escopo.exercitoId);
    const idsTribos = (tribosDoExercito ?? []).map((t) => t.id);
    const closerIds = (tribosDoExercito ?? []).map((t) => t.closer_id).filter((id): id is string => !!id);
    const { data: sdrs } =
      idsTribos.length > 0
        ? await supabase.from("profiles").select("id").in("tribo_id", idsTribos).eq("role", "sdr").eq("ativo", true)
        : { data: [] };
    return Array.from(new Set([...closerIds, ...(sdrs ?? []).map((s) => s.id)]));
  }

  // null = firma inteira
  const [{ data: tribos }, { data: sdrs }] = await Promise.all([
    supabase.from("tribos").select("closer_id"),
    supabase.from("profiles").select("id").eq("role", "sdr").eq("ativo", true),
  ]);
  const closerIds = (tribos ?? []).map((t) => t.closer_id).filter((id): id is string => !!id);
  return Array.from(new Set([...closerIds, ...(sdrs ?? []).map((s) => s.id)]));
}

// Replica a aba "Pace" da planilha de Forecast (pedido do Diretor,
// 2026-09-16) — meta em cascata (Tentativas→...→Pagos, via taxas de
// metas_conversao, mesma fórmula de calcularFunilMeta já usada em
// Comando Geral/Mural) e, pra cada dia útil do mês, meta diária = meta
// do mês / dias úteis, com "Acumulado" = soma corrida de (realizado -
// meta) dia a dia — quem tá calculando o acumulado é a página (soma
// direto do array `dias`), não esta função. `escopo` (mesmo tipo de
// metas.ts: null=firma, exercito/tribo/individual) decide tanto a meta
// (via buscarMetaComTaxas) quanto quem entra na conta do realizado —
// pedido do Diretor, 2026-09-16: Diretor escolhe Geral/Exército/Tribo,
// Líder vê o próprio Exército e pode entrar em cada Tribo, Closer vê a
// própria Tribo e cada pessoa, SDR só o próprio pace.
export async function buscarPaceMes(supabase: SupabaseClient, escopo: EscopoTime, anoMes?: AnoMes): Promise<PaceMes> {
  const hoje = new Date();
  const ano = anoMes?.ano ?? hoje.getUTCFullYear();
  const mes = anoMes?.mes ?? hoje.getUTCMonth() + 1;

  const { metaCredito: metaCreditoPago, metaTicketMedio, taxas } = await buscarMetaComTaxas(supabase, escopo);
  const cascata = calcularFunilMeta(metaCreditoPago, metaTicketMedio, taxas);
  const taxaAssinadoPago = taxas.get("assinaturas_pagos") ?? null;
  const metaCreditoAssinado = taxaAssinadoPago ? metaCreditoPago / taxaAssinadoPago : 0;

  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const fimMesInclusivo = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;

  let diasUteis = 0;
  for (let d = 1; d <= ultimoDia; d++) {
    const data = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!ehFimDeSemana(data)) diasUteis++;
  }
  const divisor = diasUteis || 1;

  const todosIds = await resolverIdsDoEscopo(supabase, escopo);

  const funilPorDiaEtapa = new Map<string, number>(); // "data|etapa"
  if (todosIds.length > 0) {
    const { data: funilRows } = await supabase
      .from("producao_funil")
      .select("data, etapa, realizado, papel")
      .in("profile_id", todosIds)
      .in("etapa", ["tentativas", "alos", "conexoes", "entrevistas"])
      .gte("data", inicioMes)
      .lte("data", fimMesInclusivo);
    for (const row of funilRows ?? []) {
      if (row.etapa === "entrevistas" && row.papel === "closer") continue;
      const chave = `${row.data}|${row.etapa}`;
      funilPorDiaEtapa.set(chave, (funilPorDiaEtapa.get(chave) ?? 0) + row.realizado);
    }
  }

  const assinadosPorDia = new Map<string, { qtd: number; valor: number }>();
  const pagosPorDia = new Map<string, { qtd: number; valor: number }>();
  if (todosIds.length > 0) {
    const idsCsv = todosIds.join(",");
    const [{ data: opsAssinadas }, { data: opsPagas }] = await Promise.all([
      supabase
        .from("weekly_operacoes")
        .select("data, valor, sdr_profile_id, closer_profile_id")
        .gte("data", inicioMes)
        .lte("data", fimMesInclusivo)
        .or(`sdr_profile_id.in.(${idsCsv}),closer_profile_id.in.(${idsCsv})`),
      supabase
        .from("weekly_operacoes")
        .select("data, valor, sdr_profile_id, closer_profile_id")
        .eq("status", "PAGO")
        .gte("data", inicioMes)
        .lte("data", fimMesInclusivo)
        .or(`sdr_profile_id.in.(${idsCsv}),closer_profile_id.in.(${idsCsv})`),
    ]);
    for (const o of opsAssinadas ?? []) {
      const b = assinadosPorDia.get(o.data) ?? { qtd: 0, valor: 0 };
      b.qtd += 1;
      b.valor += Number(o.valor);
      assinadosPorDia.set(o.data, b);
    }
    for (const o of opsPagas ?? []) {
      const b = pagosPorDia.get(o.data) ?? { qtd: 0, valor: 0 };
      b.qtd += 1;
      b.valor += Number(o.valor);
      pagosPorDia.set(o.data, b);
    }
  }

  const dias: PaceDia[] = [];
  for (let d = 1; d <= ultimoDia; d++) {
    const data = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const util = !ehFimDeSemana(data);
    const metaDia = (v: number | null) => (util && v ? v / divisor : 0);
    const assinados = assinadosPorDia.get(data) ?? { qtd: 0, valor: 0 };
    const pagos = pagosPorDia.get(data) ?? { qtd: 0, valor: 0 };
    dias.push({
      data,
      diaSemana: DIAS_SEMANA[paraDataUTC(data).getUTCDay()],
      util,
      tentativas: { realizado: funilPorDiaEtapa.get(`${data}|tentativas`) ?? 0, meta: metaDia(cascata.tentativas) },
      alos: { realizado: funilPorDiaEtapa.get(`${data}|alos`) ?? 0, meta: metaDia(cascata.alos) },
      conexoes: { realizado: funilPorDiaEtapa.get(`${data}|conexoes`) ?? 0, meta: metaDia(cascata.conexoes) },
      entrevistas: { realizado: funilPorDiaEtapa.get(`${data}|entrevistas`) ?? 0, meta: metaDia(cascata.entrevistas) },
      assinadosQtd: { realizado: assinados.qtd, meta: metaDia(cascata.assinaturas) },
      assinadosValor: { realizado: assinados.valor, meta: metaDia(metaCreditoAssinado) },
      pagosQtd: { realizado: pagos.qtd, meta: metaDia(cascata.pagos) },
      pagosValor: { realizado: pagos.valor, meta: metaDia(metaCreditoPago) },
      tkm: { realizado: pagos.qtd > 0 ? pagos.valor / pagos.qtd : 0, meta: metaTicketMedio },
    });
  }

  function somaRealizado(campo: keyof Omit<PaceDia, "data" | "diaSemana" | "util" | "tkm">): number {
    return dias.reduce((s, d) => s + d[campo].realizado, 0);
  }
  const tentativasR = somaRealizado("tentativas");
  const alosR = somaRealizado("alos");
  const conexoesR = somaRealizado("conexoes");
  const entrevistasR = somaRealizado("entrevistas");
  const assinadosR = somaRealizado("assinadosQtd");
  const pagosR = somaRealizado("pagosQtd");
  const pagosValorR = somaRealizado("pagosValor");
  const pct = (n: number, d: number) => (d > 0 ? n / d : null);

  return {
    meta: {
      tentativas: cascata.tentativas ?? 0,
      alos: cascata.alos ?? 0,
      alosPct: taxas.get("tentativas_alos") ?? null,
      conexoes: cascata.conexoes ?? 0,
      conexoesPct: taxas.get("alos_conexoes") ?? null,
      entrevistas: cascata.entrevistas ?? 0,
      entrevistasPct: taxas.get("conexoes_entrevistas") ?? null,
      assinados: cascata.assinaturas ?? 0,
      assinadosPct: taxas.get("entrevistas_assinaturas") ?? null,
      pagos: cascata.pagos ?? 0,
      pagosPct: taxaAssinadoPago,
      tkm: metaTicketMedio,
      credito: metaCreditoPago,
    },
    realizado: {
      tentativas: tentativasR,
      alos: alosR,
      alosPct: pct(alosR, tentativasR),
      conexoes: conexoesR,
      conexoesPct: pct(conexoesR, alosR),
      entrevistas: entrevistasR,
      entrevistasPct: pct(entrevistasR, conexoesR),
      assinados: assinadosR,
      assinadosPct: pct(assinadosR, entrevistasR),
      pagos: pagosR,
      pagosPct: pct(pagosR, assinadosR),
      tkm: pagosR > 0 ? pagosValorR / pagosR : 0,
      credito: pagosValorR,
    },
    dias,
  };
}

export type TotaisSimples = { tentativas: number; alos: number; conexoes: number; assinados: number };

// Totais de um período explícito [inicio, fim] (inclusive nos dois lados)
// pra um conjunto de profile_id — usado pelo comparativo "média por
// cabeça", que precisa somar vários grupos diferentes (Tribo, Exército,
// Outras Tribos, Empresa) em 3 recortes (mês/semana/dia) sem montar a
// tabela dia-a-dia inteira de cada um. Mesma lógica de dedupe do resto de
// pace.ts: entrevistas não entra aqui (não pedida no comparativo),
// assinados vem de weekly_operacoes (1 linha por operação).
export async function buscarTotaisPeriodo(supabase: SupabaseClient, ids: string[], inicio: string, fim: string): Promise<TotaisSimples> {
  if (ids.length === 0) return { tentativas: 0, alos: 0, conexoes: 0, assinados: 0 };
  const idsCsv = ids.join(",");

  const [{ data: funilRows }, { data: opsAssinadas }] = await Promise.all([
    supabase
      .from("producao_funil")
      .select("etapa, realizado")
      .in("profile_id", ids)
      .in("etapa", ["tentativas", "alos", "conexoes"])
      .gte("data", inicio)
      .lte("data", fim),
    supabase
      .from("weekly_operacoes")
      .select("id")
      .gte("data", inicio)
      .lte("data", fim)
      .or(`sdr_profile_id.in.(${idsCsv}),closer_profile_id.in.(${idsCsv})`),
  ]);

  const totais: TotaisSimples = { tentativas: 0, alos: 0, conexoes: 0, assinados: (opsAssinadas ?? []).length };
  for (const row of funilRows ?? []) {
    const etapa = row.etapa as "tentativas" | "alos" | "conexoes";
    if (etapa === "tentativas" || etapa === "alos" || etapa === "conexoes") totais[etapa] += row.realizado;
  }
  return totais;
}

export type LinhaEscopo = { label: string; ids: string[] };
export type LinhaComparativo = { label: string; numPessoas: number; porCabeca: TotaisSimples };

// Resolve QUEM entra em cada linha do comparativo "média por cabeça",
// adaptado ao nível do escopo atual — pedido do Diretor, 2026-09-16:
//   individual → Eu / Tribo / Exército / Empresa
//   tribo      → Esta Tribo / Exército / Outras Tribos
//   exercito   → Este Exército / Empresa
//   geral      → só Empresa (não tem nível acima pra comparar)
// Separado de buscarComparativoPorCabeca pra resolver os ids UMA vez só
// e reusar em 3 períodos (mês/semana/dia) sem repetir as mesmas queries
// de estrutura organizacional 3x. `tribos` já vem carregado pela página
// (pra achar o exercito_id de uma Tribo sem outra query).
export async function resolverLinhasComparativo(
  supabase: SupabaseClient,
  escopo: EscopoTime,
  tribos: { id: string; exercito_id: string }[]
): Promise<LinhaEscopo[]> {
  if (escopo?.tipo === "individual") {
    const { data: pessoa } = await supabase.from("profiles").select("tribo_id").eq("id", escopo.profileId).maybeSingle();
    const triboId = pessoa?.tribo_id ?? null;
    const exercitoId = triboId ? tribos.find((t) => t.id === triboId)?.exercito_id ?? null : null;
    const linhas: LinhaEscopo[] = [{ label: "Eu", ids: [escopo.profileId] }];
    if (triboId) linhas.push({ label: "Tribo", ids: await resolverIdsDoEscopo(supabase, { tipo: "tribo", triboId }) });
    if (exercitoId) linhas.push({ label: "Exército", ids: await resolverIdsDoEscopo(supabase, { tipo: "exercito", exercitoId }) });
    linhas.push({ label: "Empresa", ids: await resolverIdsDoEscopo(supabase, null) });
    return linhas;
  }

  if (escopo?.tipo === "tribo") {
    const exercitoId = tribos.find((t) => t.id === escopo.triboId)?.exercito_id ?? null;
    const idsTribo = await resolverIdsDoEscopo(supabase, escopo);
    const linhas: LinhaEscopo[] = [{ label: "Esta Tribo", ids: idsTribo }];
    if (exercitoId) linhas.push({ label: "Exército", ids: await resolverIdsDoEscopo(supabase, { tipo: "exercito", exercitoId }) });
    const idsFirma = await resolverIdsDoEscopo(supabase, null);
    const idsTriboSet = new Set(idsTribo);
    linhas.push({ label: "Outras Tribos", ids: idsFirma.filter((id) => !idsTriboSet.has(id)) });
    return linhas;
  }

  if (escopo?.tipo === "exercito") {
    return [
      { label: "Este Exército", ids: await resolverIdsDoEscopo(supabase, escopo) },
      { label: "Empresa", ids: await resolverIdsDoEscopo(supabase, null) },
    ];
  }

  return [{ label: "Empresa", ids: await resolverIdsDoEscopo(supabase, null) }];
}

// Totais por cabeça de cada linha (já resolvida por resolverLinhasComparativo)
// num período [inicio, fim] — chamada 1x por recorte (mês/semana/dia) pela
// página, reaproveitando os mesmos ids resolvidos uma única vez.
export async function buscarComparativoPorCabeca(
  supabase: SupabaseClient,
  linhasEscopo: LinhaEscopo[],
  inicio: string,
  fim: string
): Promise<LinhaComparativo[]> {
  const resultado: LinhaComparativo[] = [];
  for (const l of linhasEscopo) {
    const totais = await buscarTotaisPeriodo(supabase, l.ids, inicio, fim);
    resultado.push({ label: l.label, numPessoas: l.ids.length, porCabeca: totais });
  }
  return resultado;
}
