// Pace de esforço por negócio (Pace por B.U): reuniões agendadas e realizadas do time e de cada
// pré-vendas, contra a meta do forecast. Regras (Diretor/analista, 17/11/2026):
//  - a meta de cada canal é dividida em partes iguais entre quem trabalha aquele canal (TIMES_POR_CANAL);
//    a meta da pessoa é a soma dos canais dela. Canal sem time (ex.: Indicação) fica só no total do time;
//  - o realizado é o do Pipefácil, com a mesma regra do funil; o da pessoa é o do ranking (quem era o
//    responsável pelo lead no agendamento), aberto por canal;
//  - o pace principal da pessoa é o TOTAL (um canal pode compensar o outro); os canais são o detalhe.
import type { SupabaseClient } from "@supabase/supabase-js";
import { funisDoMes, type LeadEtapa } from "@/lib/funil-negocio";
import { FERIADOS_NACIONAIS, calcularPace, limitesDoMes, type PaceCalculado } from "@/lib/pace-negocio";
import { ehFimDeSemana, paraDataUTC } from "@/lib/data-br";
import type { CanalPortal } from "@/lib/integracoes/config";
import type { RankingGravado } from "@/lib/integracoes/leads-funil";

/** Pré-vendas de cada canal, por usuário do Pipefácil. Quem entra ou sai do time: ajuste aqui. */
export const TIMES_POR_CANAL: Record<string, Partial<Record<CanalPortal, string[]>>> = {
  vorp: {
    outbound: [
      "efaa951d-455a-4148-ba3a-fa3b5f4bafd9", // Jorge Abudi
      "7d0660e3-9acb-4266-93db-cfdee71e2289", // Marcus Ryquelme
      "2acc1ce9-0160-4bf9-8526-4f799604143a", // Vinícius Anastácio Ferreira
    ],
    inbound: ["efaa951d-455a-4148-ba3a-fa3b5f4bafd9"], // Jorge Abudi
  },
  // Match Sales (Galácticos): o BDR e os executivos agendam as próprias reuniões; o Head (Davi) não entra na divisão.
  matchsales: {
    outbound: [
      "b58b3ad3-8f28-48a3-a103-4c65db9307b4", // Fernando César (BDR)
      "cmpy5vxa2026g3ukcydv7ddke", // Nicolas Roberto
      "1b2cd3b8-5b6c-48e0-83a5-3d4fa3e8f94f", // Matheus Mesquita
      "fd4b8d73-5438-4c60-a985-87f3394721e6", // Leonardo Enzo
      // Arthur Soares não trabalha no Outbound (20/11/2026): só no Inbound.
    ],
    inbound: [
      "b58b3ad3-8f28-48a3-a103-4c65db9307b4",
      "cmpy5vxa2026g3ukcydv7ddke",
      "1b2cd3b8-5b6c-48e0-83a5-3d4fa3e8f94f",
      "fd4b8d73-5438-4c60-a985-87f3394721e6",
      "605125ac-10bc-40ae-9ced-2c88cf747a20",
    ],
  },
};

/** Etapas com cartão de pace (topo e pré-vendas). */
export const ETAPAS_ESFORCO = ["reunioes_agendadas", "reunioes_realizadas"] as const;
/** Etapas dos funis Agendadas → Realizadas → Vendas. */
export const ETAPAS_FUNIL = ["reunioes_agendadas", "reunioes_realizadas", "vendas"] as const;
export type EtapaEsforco = (typeof ETAPAS_FUNIL)[number];

export type CanalDoPace = { canal: CanalPortal; meta: number | null; realizado: number };
/** Ponto do gráfico: n-ésimo dia útil, esperado acumulado e realizado acumulado (null = dia que não chegou). */
export type PontoSerie = { dia: string; esperado: number; realizado: number | null };
export type IndicadorEsforco = { pace: PaceCalculado; canais: CanalDoPace[]; leads?: LeadEtapa[]; serie?: PontoSerie[] };
/** Conversão ideal entre as etapas do funil, pela razão das metas do forecast. */
export type IdealFunil = { realizadas: number | null; vendas: number | null };
export type PreVendasPace = { id: string; nome: string; indicadores: Record<EtapaEsforco, IndicadorEsforco>; ideal: IdealFunil };
export type EsforcoNegocio = { time: Record<EtapaEsforco, IndicadorEsforco>; ideal: IdealFunil; preVendas: PreVendasPace[] };

type LinhaRealizado = { canal: string; etapa: string; quantidade: number; data?: string };
type Ctx = { ano: number; mes: number; hoje: string };

const ORDEM_CANAIS: CanalPortal[] = ["outbound", "inbound", "indicacao"];
const NOME_CANAL: Record<string, string> = { outbound: "Outbound", inbound: "Tráfego Pago", indicacao: "Referidos", alternativo: "Canais alternativos" };

/** Metas do forecast de cada etapa de esforço por canal (pura). */
export function metasPorCanal(slug: string, ano: number, mes: number): Record<EtapaEsforco, Partial<Record<CanalPortal, number>>> {
  const out: Record<EtapaEsforco, Partial<Record<CanalPortal, number>>> = { reunioes_agendadas: {}, reunioes_realizadas: {}, vendas: {} };
  for (const f of funisDoMes(slug, ano, mes)) {
    for (const etapa of ETAPAS_FUNIL) {
      const meta = f.etapas.find((e) => e.chave === etapa)?.meta;
      if (meta != null) out[etapa][f.canal] = meta;
    }
    // Match Sales, Referidos: o lead indicado agenda a reunião e só parte comparece (comparecimento do forecast, já descontado o no-show).
    // Os leads indicados são as reuniões agendadas; as realizadas são esses leads vezes o comparecimento (49,5 agendadas → 34,6 realizadas).
    if (f.canal === "indicacao" && slug === "matchsales") {
      const leads = f.etapas.find((e) => e.chave === "leads_indicados")?.meta;
      if (leads != null) out.reunioes_agendadas.indicacao = leads;
    }
  }
  return out;
}

/** Dias úteis do mês (seg-sex, sem feriado nacional), em ordem. */
export function diasUteisDoMes(ano: number, mes: number): string[] {
  const { inicio, fim } = limitesDoMes(ano, mes);
  const out: string[] = [];
  for (let d = paraDataUTC(inicio); d.toISOString().slice(0, 10) <= fim; d.setUTCDate(d.getUTCDate() + 1)) {
    const dia = d.toISOString().slice(0, 10);
    if (!ehFimDeSemana(dia) && !FERIADOS_NACIONAIS.has(dia)) out.push(dia);
  }
  return out;
}

/**
 * Esperado × realizado acumulado, dia útil a dia útil (pura). `itens`: [dia, valor]. O realizado do dia
 * útil inclui o que caiu antes dele (fim de semana entra no dia útil seguinte); o último dia andado vai
 * até hoje e o último dia do mês, até o fim dele. Dia que ainda não chegou fica sem realizado.
 */
export function serieDoMes(meta: number, itens: [string, number][], ano: number, mes: number, hoje: string): PontoSerie[] {
  const dias = diasUteisDoMes(ano, mes);
  const decorridos = dias.filter((d) => d <= hoje).length;
  const ate = (limite: string) => itens.reduce((s, [dia, v]) => s + (dia <= limite ? v : 0), 0);
  return dias.map((dia, i) => {
    const andou = i < decorridos;
    const limite = i === dias.length - 1 && andou ? "9999-12-31" : i === decorridos - 1 ? hoje : dia;
    return { dia, esperado: dias.length ? (meta * (i + 1)) / dias.length : 0, realizado: andou ? ate(limite) : null };
  });
}

/** Conversão ideal: realizadas ÷ agendadas (só canais com agendamento) e vendas ÷ realizadas, pelas metas. */
function idealDe(ind: Record<EtapaEsforco, IndicadorEsforco>): IdealFunil {
  const meta = (e: EtapaEsforco, so?: (c: CanalDoPace) => boolean) => ind[e].canais.filter((c) => !so || so(c)).reduce((s, c) => s + (c.meta ?? 0), 0);
  const comAgendamento = new Set(ind.reunioes_agendadas.canais.filter((c) => c.meta != null).map((c) => c.canal));
  const ag = meta("reunioes_agendadas");
  const realComAg = meta("reunioes_realizadas", (c) => comAgendamento.has(c.canal));
  const real = meta("reunioes_realizadas");
  return { realizadas: ag > 0 ? realComAg / ag : null, vendas: real > 0 ? meta("vendas") / real : null };
}

/**
 * Pace de esforço (pura): `linhas` = funil_realizado do mês (visão padrão); `ranking` = ranking de
 * pré-vendas gravado (pessoas por nome, leads com canal); `nomes` = usuário do Pipefácil → nome.
 */
export function montarEsforco(
  slug: string,
  ctx: Ctx,
  linhas: LinhaRealizado[],
  ranking: RankingGravado | null,
  nomes: Record<string, string>,
  listas: Record<string, LeadEtapa[]> = {},
): EsforcoNegocio {
  const metas = metasPorCanal(slug, ctx.ano, ctx.mes);
  const times = TIMES_POR_CANAL[slug] ?? {};
  const pace = (meta: number, realizado: number) => calcularPace({ meta, recebido: realizado, hoje: ctx.hoje, ano: ctx.ano, mes: ctx.mes });

  const time = {} as Record<EtapaEsforco, IndicadorEsforco>;
  for (const etapa of ETAPAS_FUNIL) {
    const canais: CanalDoPace[] = ORDEM_CANAIS.filter((c) => metas[etapa][c] != null || linhas.some((l) => l.canal === c && l.etapa === etapa)).map(
      (canal) => ({
        canal,
        meta: metas[etapa][canal] ?? null,
        realizado: linhas.filter((l) => l.canal === canal && l.etapa === etapa).reduce((s, l) => s + Number(l.quantidade), 0),
      }),
    );
    const metaTime = canais.reduce((s, c) => s + (c.meta ?? 0), 0);
    const leads = ORDEM_CANAIS.flatMap((c) => listas[`${c}|${etapa}`] ?? []).sort((a, b) => a.data.localeCompare(b.data));
    const itens: [string, number][] = linhas.filter((l) => l.etapa === etapa && l.data).map((l) => [l.data!, Number(l.quantidade)]);
    time[etapa] = {
      pace: pace(metaTime, canais.reduce((s, c) => s + c.realizado, 0)),
      canais,
      leads,
      serie: serieDoMes(metaTime, itens, ctx.ano, ctx.mes, ctx.hoje),
    };
  }

  const ids = Array.from(new Set(Object.values(times).flat()));
  const preVendas: PreVendasPace[] = ids.map((id) => {
    const nome = nomes[id] ?? "Usuário sem nome";
    const indicadores = {} as Record<EtapaEsforco, IndicadorEsforco>;
    for (const etapa of ETAPAS_FUNIL) {
      const leads = ranking?.[etapa]?.find((p) => p.nome === nome)?.leads ?? [];
      const doCanal = (c: CanalPortal) => leads.filter((l) => l.canal === c).length;
      const canais: CanalDoPace[] = ORDEM_CANAIS.filter((c) => times[c]?.includes(id) || doCanal(c) > 0).map((canal) => {
        const membros = times[canal]?.length ?? 0;
        const metaCanal = metas[etapa][canal];
        return { canal, meta: times[canal]?.includes(id) && metaCanal != null && membros > 0 ? metaCanal / membros : null, realizado: doCanal(canal) };
      });
      indicadores[etapa] = {
        pace: pace(canais.reduce((s, c) => s + (c.meta ?? 0), 0), leads.length),
        canais,
        leads: leads.map((l) => ({ nome: l.nome, data: l.data, responsavel: NOME_CANAL[l.canal] ?? l.canal, preVendas: null, origem: l.origem ?? null, faturamento: l.faturamento })),
      };
    }
    return { id, nome, indicadores, ideal: idealDe(indicadores) };
  });
  preVendas.sort((a, b) => b.indicadores.reunioes_agendadas.pace.recebido - a.indicadores.reunioes_agendadas.pace.recebido);
  return { time, ideal: idealDe(time), preVendas };
}

/** Lê o realizado do mês, o ranking e os nomes, e monta o pace de esforço. null = negócio sem times. */
export async function buscarEsforcoNegocio(admin: SupabaseClient, slug: string, negocioId: string, ctx: Ctx): Promise<EsforcoNegocio | null> {
  if (!TIMES_POR_CANAL[slug]) return null;
  const mesStr = `${ctx.ano}-${String(ctx.mes).padStart(2, "0")}`;
  const seg = ctx.mes === 12 ? `${ctx.ano + 1}-01` : `${ctx.ano}-${String(ctx.mes + 1).padStart(2, "0")}`;
  const [{ data: linhas }, { data: rk }, { data: mb }, { data: ls }] = await Promise.all([
    admin
      .from("funil_realizado")
      .select("canal, etapa, quantidade, data")
      .eq("negocio_id", negocioId)
      .in("etapa", [...ETAPAS_FUNIL])
      .gte("data", `${mesStr}-01`)
      .lt("data", `${seg}-01`)
      .order("data")
      .order("canal")
      .order("etapa")
      .range(0, 999),
    admin.from("integracao_estado").select("valor").eq("chave", `ranking:${slug}:${mesStr}`).maybeSingle(),
    admin.from("integracao_estado").select("valor").eq("chave", `pipefacil:${slug}:membros`).maybeSingle(),
    admin.from("integracao_estado").select("valor").eq("chave", `leads_funil:${slug}:${mesStr}`).maybeSingle(),
  ]);
  return montarEsforco(
    slug,
    ctx,
    linhas ?? [],
    (rk?.valor as RankingGravado | null) ?? null,
    (mb?.valor as Record<string, string> | null) ?? {},
    (ls?.valor as Record<string, LeadEtapa[]> | null) ?? {},
  );
}
