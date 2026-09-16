import type { SupabaseClient } from "@supabase/supabase-js";
import { calcularFunilMeta, type AnoMes } from "@/lib/metas";
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

// Replica a aba "Pace" da planilha de Forecast (pedido do Diretor,
// 2026-09-16) — meta em cascata (Tentativas→...→Pagos, via taxas de
// metas_conversao, mesma fórmula de calcularFunilMeta já usada em
// Comando Geral/Mural) e, pra cada dia útil do mês, meta diária = meta
// do mês / dias úteis, com "Acumulado" = soma corrida de (realizado -
// meta) dia a dia — quem tá calculando o acumulado é a página (soma
// direto do array `dias`), não esta função.
export async function buscarPaceMes(supabase: SupabaseClient, anoMes?: AnoMes): Promise<PaceMes> {
  const hoje = new Date();
  const ano = anoMes?.ano ?? hoje.getUTCFullYear();
  const mes = anoMes?.mes ?? hoje.getUTCMonth() + 1;

  const { data: metaMes } = await supabase
    .from("metas_mensais")
    .select("id, meta_credito_total, meta_ticket_medio")
    .eq("ano", ano)
    .eq("mes", mes)
    .maybeSingle();
  const { data: conversoes } = metaMes
    ? await supabase.from("metas_conversao").select("etapa_de, etapa_para, taxa_esperada").eq("meta_mensal_id", metaMes.id)
    : { data: [] };
  const taxas = new Map((conversoes ?? []).map((c) => [`${c.etapa_de}_${c.etapa_para}`, Number(c.taxa_esperada)]));

  const metaCreditoPago = metaMes?.meta_credito_total ?? 0;
  const metaTicketMedio = metaMes?.meta_ticket_medio ?? 0;
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

  // Escopo: todo SDR/Closer ativo da firma — mesmo recorte de Comando
  // Geral/Mural pra "produção da firma inteira".
  const [{ data: tribos }, { data: sdrs }] = await Promise.all([
    supabase.from("tribos").select("id, closer_id"),
    supabase.from("profiles").select("id").eq("role", "sdr").eq("ativo", true),
  ]);
  const closerIds = (tribos ?? []).map((t) => t.closer_id).filter((id): id is string => !!id);
  const todosIds = Array.from(new Set([...closerIds, ...(sdrs ?? []).map((s) => s.id)]));

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
