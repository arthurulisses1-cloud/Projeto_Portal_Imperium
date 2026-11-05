// Dashboard de um negócio: resultado (recebido x meta), mix de canais, funil
// previsto x realizado e esforço da equipe no mês.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarPaceNegocios, limitesDoMes, type PaceNegocio } from "@/lib/pace-negocio";
import { PARAMETROS, indiceMes, vendasDoMes } from "@/lib/forecast-negocios";

export type MixCanal = { canal: "outbound" | "inbound" | "indicacao" | "sem_canal"; qtd: number; valor: number };

export type EsforcoKpi = {
  chave: string;
  label: string;
  meta: number;
  realizado: number;
  porPessoa: { nome: string; meta: number; realizado: number }[];
};

/** Indicadores-chave de cada negócio, em ordem; viram rankings no dashboard. */
export const RANKINGS: Record<string, string[]> = {
  vorp: ["reunioes_agendadas", "reunioes_realizadas"],
  matchsales: ["reunioes_agendadas", "reunioes_realizadas"],
  "vorp-finance": ["entrevistas", "subidos"],
  "vorp-energy": ["contas_subidas", "reunioes_realizadas"],
};

export type DashboardNegocio = {
  pace: PaceNegocio;
  vendas: { qtd: number; ticketMedio: number; mix: MixCanal[] };
  /** Vendas previstas pelo forecast no mês (com ramp-up); null se não houver forecast. */
  previsto: { vendas: number; outbound: number; inbound: number; referidos: number } | null;
  esforco: EsforcoKpi[];
  ultimas: { id: string; data: string; cliente: string | null; valor: number; vendedor: string }[];
};

export async function buscarDashboardNegocio(supabase: SupabaseClient, slug: string, ano: number, mes: number, hoje: string): Promise<DashboardNegocio | null> {
  const [pace] = await buscarPaceNegocios(supabase, ano, mes, hoje, [slug]);
  if (!pace) return null;
  const { inicio, fim } = limitesDoMes(ano, mes);
  const fimExcl = new Date(Date.parse(fim + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
  const negocioId = pace.negocio.id;

  const [{ data: vendas }, { data: kpis }, { data: perfis }, { data: defs }] = await Promise.all([
    supabase
      .from("vendas")
      .select("id, valor, canal, data, cliente, profile_id")
      .eq("negocio_id", negocioId)
      .gte("data", inicio)
      .lt("data", fimExcl)
      .order("data", { ascending: false })
      .range(0, 19999),
    supabase.from("compromisso_kpis").select("profile_id, chave, label, meta, realizado").eq("negocio_id", negocioId).gte("data", inicio).lt("data", fimExcl).range(0, 19999),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("kpi_definicoes").select("chave, label, ordem").eq("negocio_id", negocioId).eq("ativo", true).order("ordem"),
  ]);

  const nomePor = new Map((perfis ?? []).map((p) => [p.id as string, p.full_name as string]));

  const lista = vendas ?? [];
  const qtd = lista.length;
  const total = lista.reduce((s, v) => s + Number(v.valor), 0);
  const mixMap = new Map<MixCanal["canal"], MixCanal>();
  for (const v of lista) {
    const canal = (v.canal ?? "sem_canal") as MixCanal["canal"];
    const atual = mixMap.get(canal) ?? { canal, qtd: 0, valor: 0 };
    atual.qtd += 1;
    atual.valor += Number(v.valor);
    mixMap.set(canal, atual);
  }

  const p = PARAMETROS[slug];
  const i = indiceMes(ano, mes);
  const vm = p && i >= 0 ? vendasDoMes(p, i) : null;
  const previsto = vm ? { vendas: vm.total, outbound: vm.outbound, inbound: vm.inbound, referidos: vm.referidos } : null;

  // Esforço: soma do mês por KPI (apenas definições ativas) e por pessoa.
  const ordem = new Map((defs ?? []).map((d) => [d.chave as string, d]));
  const porKpi = new Map<string, EsforcoKpi>();
  for (const d of defs ?? []) porKpi.set(d.chave, { chave: d.chave, label: d.label, meta: 0, realizado: 0, porPessoa: [] });
  const porKpiPessoa = new Map<string, { meta: number; realizado: number }>();
  for (const k of kpis ?? []) {
    const alvo = porKpi.get(k.chave);
    if (!alvo || !ordem.has(k.chave)) continue;
    alvo.meta += Number(k.meta);
    alvo.realizado += Number(k.realizado);
    const chave = `${k.chave}|${k.profile_id}`;
    const acc = porKpiPessoa.get(chave) ?? { meta: 0, realizado: 0 };
    acc.meta += Number(k.meta);
    acc.realizado += Number(k.realizado);
    porKpiPessoa.set(chave, acc);
  }
  for (const [chave, acc] of Array.from(porKpiPessoa.entries())) {
    const [k, pid] = chave.split("|");
    porKpi.get(k)?.porPessoa.push({ nome: nomePor.get(pid) ?? "—", ...acc });
  }
  for (const e of Array.from(porKpi.values())) e.porPessoa.sort((a, b) => b.realizado - a.realizado);

  return {
    pace,
    vendas: { qtd, ticketMedio: qtd > 0 ? total / qtd : 0, mix: Array.from(mixMap.values()).sort((a, b) => b.valor - a.valor) },
    previsto,
    esforco: Array.from(porKpi.values()),
    ultimas: lista.slice(0, 8).map((v) => ({
      id: v.id,
      data: v.data,
      cliente: v.cliente ?? null,
      valor: Number(v.valor),
      vendedor: nomePor.get(v.profile_id) ?? "—",
    })),
  };
}
