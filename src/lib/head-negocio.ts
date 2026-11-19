// Visão do Head de um negócio com CRM (hoje, o Davi no Match Sales): o time inteiro num lugar só.
// Pace do time (recebido, MRR e setup), reuniões previstas e do dia, e uma tabela de quem precisa de atenção.
//
// Mesmas fontes das visões do closer e do SDR: vendas (recebido, MRR, setup), auditoria do CRM (reuniões, no-show)
// e o pace de esforço (agendadas, realizadas, vendas por pessoa, com a meta do forecast dividida entre o time).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditoriaGravada } from "@/lib/integracoes/auditoria";
import { metaMrrForecast } from "@/lib/forecast-negocios";
import { calcularPace, limitesDoMes, buscarPaceNegocios, type PaceCalculado, type StatusPace } from "@/lib/pace-negocio";
import { buscarEsforcoNegocio, type EsforcoNegocio } from "@/lib/pace-esforco";
import { resumirReunioes, usuarioCrmDoPerfil, type ReuniaoFutura } from "@/lib/sdr-negocio";
import { resumirReunioesCloser, setupDoNegocio, type ReuniaoCancelada, type ReuniaoDoDia } from "@/lib/closer-negocio";

export type LinhaTime = {
  id: string;
  nome: string;
  cargo: string;
  /** Pace de recebido da pessoa (null = sem meta individual, ex.: BDR). */
  recebido: PaceCalculado | null;
  vendas: number;
  mrr: number;
  agendadas: PaceCalculado | null;
  realizadas: PaceCalculado | null;
  noShow: { qtd: number; base: number; pct: number | null } | null;
  /** Quanto falta para o ritmo: índice do recebido (1 = no ritmo); usado para ordenar quem precisa de atenção. */
  indice: number | null;
};

export type PainelHead = {
  slug: string;
  recebido: PaceCalculado;
  mrr: PaceCalculado;
  setup: PaceCalculado | null;
  /** Pace de reuniões agendadas e realizadas do time (meta do forecast). */
  agendadas: PaceCalculado | null;
  realizadas: PaceCalculado | null;
  noShow: { qtd: number; base: number; pct: number | null } | null;
  /** Reuniões do time ainda por acontecer a partir de amanhã (ou sem data), da mais próxima para a mais distante. */
  previstas: ReuniaoFutura[];
  /** Reuniões do time para reagendar (data passada sem desfecho, ou No Show). */
  reagendar: ReuniaoFutura[];
  /** Reuniões agendadas no mês que o lead depois perdeu, com o motivo. */
  canceladas: ReuniaoCancelada[];
  /** Reuniões do time marcadas para hoje. */
  doDia: ReuniaoDoDia[];
  time: LinhaTime[];
  esforco: EsforcoNegocio | null;
  atualizadoEm: string | null;
};

/** Ordem de gravidade: quem está mais longe do ritmo primeiro; sem meta ou sem ritmo por último (pura). */
export function ordenarPorAtencao(linhas: LinhaTime[]): LinhaTime[] {
  const peso = (l: LinhaTime) => (l.indice === null ? Number.POSITIVE_INFINITY : l.indice);
  return [...linhas].sort((a, b) => peso(a) - peso(b) || a.nome.localeCompare(b.nome, "pt-BR"));
}

export const ROTULO_STATUS: Record<StatusPace, { texto: string; classe: string }> = {
  sem_meta: { texto: "Sem meta", classe: "border-imperium-line text-stone-400" },
  adiantado: { texto: "Adiantado", classe: "border-success/50 text-success-bright" },
  no_ritmo: { texto: "No ritmo", classe: "border-amber-400/50 text-amber-400" },
  atrasado: { texto: "Atrasado", classe: "border-wine/60 text-wine-bright" },
  critico: { texto: "Crítico", classe: "border-wine text-wine-bright" },
};

/** Lê tudo o que a visão do Head precisa. `admin`: só depois de conferir que a pessoa é Head do negócio. */
export async function buscarPainelHead(
  admin: SupabaseClient,
  negocio: { id: string; slug: string },
  ctx: { ano: number; mes: number; hoje: string },
): Promise<PainelHead> {
  const { inicio, fim } = limitesDoMes(ctx.ano, ctx.mes);
  const fimExcl = new Date(Date.parse(fim + "T00:00:00Z") + 86400_000).toISOString().slice(0, 10);
  const base = { hoje: ctx.hoje, ano: ctx.ano, mes: ctx.mes };

  const [[pn], esforco, { data: mb }, { data: pf }, { data: au }, { data: vendas }, setupTime] = await Promise.all([
    buscarPaceNegocios(admin, ctx.ano, ctx.mes, ctx.hoje, [negocio.slug]),
    buscarEsforcoNegocio(admin, negocio.slug, negocio.id, ctx).catch(() => null),
    admin.from("integracao_estado").select("valor").eq("chave", `pipefacil:${negocio.slug}:membros`).maybeSingle(),
    admin.from("integracao_estado").select("valor").eq("chave", `pipefacil:${negocio.slug}:perfis`).maybeSingle(),
    admin.from("integracao_estado").select("valor").eq("chave", `auditoria:${negocio.slug}`).maybeSingle(),
    admin.from("vendas").select("profile_id, mrr").eq("negocio_id", negocio.id).gte("data", inicio).lt("data", fimExcl).range(0, 19999),
    setupDoNegocio(admin, negocio, ctx),
  ]);

  const nomes = (mb?.valor as Record<string, string> | null) ?? {};
  const perfis = (pf?.valor as Record<string, string> | null) ?? null;
  const auditoria = (au?.valor as AuditoriaGravada | null) ?? null;
  const leads = auditoria?.leads ?? [];

  const mrrPor = new Map<string, number>();
  let mrrTotal = 0;
  for (const v of vendas ?? []) {
    const m = Number(v.mrr ?? 0);
    mrrTotal += m;
    if (v.profile_id) mrrPor.set(v.profile_id as string, (mrrPor.get(v.profile_id as string) ?? 0) + m);
  }

  const previstas: ReuniaoFutura[] = [];
  const reagendar: ReuniaoFutura[] = [];
  const canceladas: ReuniaoCancelada[] = [];
  const doDia: ReuniaoDoDia[] = [];
  const time: LinhaTime[] = [];
  for (const p of pn?.pessoas ?? []) {
    if (p.cargo === "head") continue;
    const usuario = usuarioCrmDoPerfil(perfis, nomes, p.id, p.nome);
    const nomeCrm = usuario ? nomes[usuario] ?? null : null;
    const pv = usuario ? esforco?.preVendas.find((x) => x.id === usuario) ?? null : null;
    if (nomeCrm && leads.length > 0) {
      const r = resumirReunioesCloser(leads, nomeCrm, ctx.ano, ctx.mes, ctx.hoje, true);
      previstas.push(...r.previstas);
      reagendar.push(...r.reagendar);
      canceladas.push(...r.canceladas);
      doDia.push(...r.doDia);
    }
    const recebido = p.meta !== null ? calcularPace({ meta: p.meta, recebido: p.recebido, ...base }) : null;
    time.push({
      id: p.id,
      nome: p.nome,
      cargo: p.cargo,
      recebido,
      vendas: p.vendas,
      mrr: mrrPor.get(p.id) ?? 0,
      agendadas: pv?.indicadores.reunioes_agendadas.pace ?? null,
      realizadas: pv?.indicadores.reunioes_realizadas.pace ?? null,
      noShow: nomeCrm && leads.length > 0 ? resumirReunioes(leads, nomeCrm, negocio.slug, ctx.ano, ctx.mes).noShow : null,
      indice: recebido?.indice ?? null,
    });
  }
  previstas.sort((a, b) => (a.quando ?? "9999").localeCompare(b.quando ?? "9999"));
  reagendar.sort((a, b) => (a.quando ?? "9999").localeCompare(b.quando ?? "9999"));
  canceladas.sort((a, b) => (b.perdidaEm ?? "").localeCompare(a.perdidaEm ?? ""));
  doDia.sort((a, b) => (a.quando ?? "9999").localeCompare(b.quando ?? "9999"));

  const qtd = time.reduce((s, l) => s + (l.noShow?.qtd ?? 0), 0);
  const baseNs = time.reduce((s, l) => s + (l.noShow?.base ?? 0), 0);

  return {
    slug: negocio.slug,
    recebido: pn?.pace ?? calcularPace({ meta: 0, recebido: 0, ...base }),
    mrr: calcularPace({ meta: metaMrrForecast(negocio.slug, ctx.ano, ctx.mes), recebido: mrrTotal, ...base }),
    setup: setupTime,
    agendadas: esforco?.time.reunioes_agendadas.pace ?? null,
    realizadas: esforco?.time.reunioes_realizadas.pace ?? null,
    noShow: leads.length > 0 ? { qtd, base: baseNs, pct: baseNs > 0 ? qtd / baseNs : null } : null,
    previstas,
    reagendar,
    canceladas,
    doDia,
    time: ordenarPorAtencao(time),
    esforco,
    atualizadoEm: auditoria?.atualizado_em ?? null,
  };
}
