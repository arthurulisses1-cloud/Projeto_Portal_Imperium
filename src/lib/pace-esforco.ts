// Pace de esforço por negócio (Pace por B.U): reuniões agendadas e realizadas do time e de cada
// pré-vendas, contra a meta do forecast. Regras (Diretor/analista, 17/11/2026):
//  - a meta de cada canal é dividida em partes iguais entre quem trabalha aquele canal (TIMES_POR_CANAL);
//    a meta da pessoa é a soma dos canais dela. Canal sem time (ex.: Indicação) fica só no total do time;
//  - o realizado é o do Pipefácil, com a mesma regra do funil; o da pessoa é o do ranking (quem era o
//    responsável pelo lead no agendamento), aberto por canal;
//  - o pace principal da pessoa é o TOTAL (um canal pode compensar o outro); os canais são o detalhe.
import type { SupabaseClient } from "@supabase/supabase-js";
import { funisDoMes } from "@/lib/funil-negocio";
import { calcularPace, type PaceCalculado } from "@/lib/pace-negocio";
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
};

export const ETAPAS_ESFORCO = ["reunioes_agendadas", "reunioes_realizadas"] as const;
export type EtapaEsforco = (typeof ETAPAS_ESFORCO)[number];

export type CanalDoPace = { canal: CanalPortal; meta: number | null; realizado: number };
export type IndicadorEsforco = { pace: PaceCalculado; canais: CanalDoPace[] };
export type PreVendasPace = { id: string; nome: string; indicadores: Record<EtapaEsforco, IndicadorEsforco> };
export type EsforcoNegocio = { time: Record<EtapaEsforco, IndicadorEsforco>; preVendas: PreVendasPace[] };

type LinhaRealizado = { canal: string; etapa: string; quantidade: number };
type Ctx = { ano: number; mes: number; hoje: string };

const ORDEM_CANAIS: CanalPortal[] = ["outbound", "inbound", "indicacao"];

/** Metas do forecast de cada etapa de esforço por canal (pura). */
export function metasPorCanal(slug: string, ano: number, mes: number): Record<EtapaEsforco, Partial<Record<CanalPortal, number>>> {
  const out: Record<EtapaEsforco, Partial<Record<CanalPortal, number>>> = { reunioes_agendadas: {}, reunioes_realizadas: {} };
  for (const f of funisDoMes(slug, ano, mes)) {
    for (const etapa of ETAPAS_ESFORCO) {
      const meta = f.etapas.find((e) => e.chave === etapa)?.meta;
      if (meta != null) out[etapa][f.canal] = meta;
    }
  }
  return out;
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
): EsforcoNegocio {
  const metas = metasPorCanal(slug, ctx.ano, ctx.mes);
  const times = TIMES_POR_CANAL[slug] ?? {};
  const pace = (meta: number, realizado: number) => calcularPace({ meta, recebido: realizado, hoje: ctx.hoje, ano: ctx.ano, mes: ctx.mes });

  const time = {} as Record<EtapaEsforco, IndicadorEsforco>;
  for (const etapa of ETAPAS_ESFORCO) {
    const canais: CanalDoPace[] = ORDEM_CANAIS.filter((c) => metas[etapa][c] != null || linhas.some((l) => l.canal === c && l.etapa === etapa)).map(
      (canal) => ({
        canal,
        meta: metas[etapa][canal] ?? null,
        realizado: linhas.filter((l) => l.canal === canal && l.etapa === etapa).reduce((s, l) => s + Number(l.quantidade), 0),
      }),
    );
    time[etapa] = { pace: pace(canais.reduce((s, c) => s + (c.meta ?? 0), 0), canais.reduce((s, c) => s + c.realizado, 0)), canais };
  }

  const ids = Array.from(new Set(Object.values(times).flat()));
  const preVendas: PreVendasPace[] = ids.map((id) => {
    const nome = nomes[id] ?? "Usuário sem nome";
    const indicadores = {} as Record<EtapaEsforco, IndicadorEsforco>;
    for (const etapa of ETAPAS_ESFORCO) {
      const leads = ranking?.[etapa]?.find((p) => p.nome === nome)?.leads ?? [];
      const doCanal = (c: CanalPortal) => leads.filter((l) => l.canal === c).length;
      const canais: CanalDoPace[] = ORDEM_CANAIS.filter((c) => times[c]?.includes(id) || doCanal(c) > 0).map((canal) => {
        const membros = times[canal]?.length ?? 0;
        const metaCanal = metas[etapa][canal];
        return { canal, meta: times[canal]?.includes(id) && metaCanal != null && membros > 0 ? metaCanal / membros : null, realizado: doCanal(canal) };
      });
      indicadores[etapa] = { pace: pace(canais.reduce((s, c) => s + (c.meta ?? 0), 0), leads.length), canais };
    }
    return { id, nome, indicadores };
  });
  preVendas.sort((a, b) => b.indicadores.reunioes_agendadas.pace.recebido - a.indicadores.reunioes_agendadas.pace.recebido);
  return { time, preVendas };
}

/** Lê o realizado do mês, o ranking e os nomes, e monta o pace de esforço. null = negócio sem times. */
export async function buscarEsforcoNegocio(admin: SupabaseClient, slug: string, negocioId: string, ctx: Ctx): Promise<EsforcoNegocio | null> {
  if (!TIMES_POR_CANAL[slug]) return null;
  const mesStr = `${ctx.ano}-${String(ctx.mes).padStart(2, "0")}`;
  const seg = ctx.mes === 12 ? `${ctx.ano + 1}-01` : `${ctx.ano}-${String(ctx.mes + 1).padStart(2, "0")}`;
  const [{ data: linhas }, { data: rk }, { data: mb }] = await Promise.all([
    admin
      .from("funil_realizado")
      .select("canal, etapa, quantidade")
      .eq("negocio_id", negocioId)
      .in("etapa", [...ETAPAS_ESFORCO])
      .gte("data", `${mesStr}-01`)
      .lt("data", `${seg}-01`)
      .order("data")
      .order("canal")
      .order("etapa")
      .range(0, 999),
    admin.from("integracao_estado").select("valor").eq("chave", `ranking:${slug}:${mesStr}`).maybeSingle(),
    admin.from("integracao_estado").select("valor").eq("chave", `pipefacil:${slug}:membros`).maybeSingle(),
  ]);
  return montarEsforco(slug, ctx, linhas ?? [], (rk?.valor as RankingGravado | null) ?? null, (mb?.valor as Record<string, string> | null) ?? {});
}
