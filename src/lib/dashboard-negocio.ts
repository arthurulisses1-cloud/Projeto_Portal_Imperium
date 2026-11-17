// Dashboard de um negócio: resultado (recebido x meta), mix de canais, funil
// previsto x realizado e esforço da equipe no mês.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarPaceNegocios, limitesDoMes, type PaceNegocio } from "@/lib/pace-negocio";
import { PARAMETROS, indiceMes, vendasDoMes } from "@/lib/forecast-negocios";
import { buscarGanhosCrm } from "@/lib/recebido-crm";

export type MixCanal = { canal: "outbound" | "inbound" | "indicacao" | "alternativo" | "sem_canal"; qtd: number; valor: number };

/** Vendas de canais alternativos (fora dos funis): somam no recebido, aparecem num bloco sem funil. */
export type VendasAlternativas = {
  qtd: number;
  valor: number;
  mrr: number;
  porCanal: { canal: string; qtd: number; valor: number; mrr: number }[];
  vendas: { id: string; data: string; cliente: string | null; canal: string; valor: number; mrr: number | null; vendedor: string }[];
};

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
  alternativas: VendasAlternativas;
};

export async function buscarDashboardNegocio(supabase: SupabaseClient, slug: string, ano: number, mes: number, hoje: string): Promise<DashboardNegocio | null> {
  const [pace] = await buscarPaceNegocios(supabase, ano, mes, hoje, [slug]);
  if (!pace) return null;
  const { inicio, fim } = limitesDoMes(ano, mes);
  const fimExcl = new Date(Date.parse(fim + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
  const negocioId = pace.negocio.id;

  const [{ data: vendas }, { data: kpis }, { data: perfis }, { data: defs }, ganhosCrm] = await Promise.all([
    supabase
      .from("vendas")
      .select("id, valor, canal, canal_origem, mrr, data, cliente, profile_id")
      .eq("negocio_id", negocioId)
      .gte("data", inicio)
      .lt("data", fimExcl)
      .order("data", { ascending: false })
      .range(0, 19999),
    supabase.from("compromisso_kpis").select("profile_id, chave, label, meta, realizado").eq("negocio_id", negocioId).gte("data", inicio).lt("data", fimExcl).range(0, 19999),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("kpi_definicoes").select("chave, label, ordem").eq("negocio_id", negocioId).eq("ativo", true).order("ordem"),
    buscarGanhosCrm([pace.negocio], inicio, fimExcl),
  ]);

  const nomePor = new Map((perfis ?? []).map((p) => [p.id as string, p.full_name as string]));

  // Negócio com recebidoPeloCrm (Energy): vendas do mês = Ganhos do CRM (mesma fonte do Recebido).
  const crm = ganhosCrm.get(negocioId);
  type LinhaVenda = { id: string; valor: number; canal: string | null; canal_origem?: string | null; mrr?: number | null; data: string; cliente: string | null; profile_id: string | null };
  const lista: LinhaVenda[] = crm
    ? crm.map((g) => ({ id: g.id, valor: g.valor, canal: g.canal, data: g.data, cliente: g.cliente, profile_id: null }))
    : vendas ?? [];
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
    alternativas: montarAlternativas(lista.filter((v) => v.canal === "alternativo"), nomePor),
    ultimas: lista.slice(0, 8).map((v) => ({
      id: v.id,
      data: v.data,
      cliente: v.cliente ?? null,
      valor: Number(v.valor),
      vendedor: (v.profile_id && nomePor.get(v.profile_id)) || "—",
    })),
  };
}

function montarAlternativas(
  vendas: { id: string; valor: number; canal_origem?: string | null; mrr?: number | null; data: string; cliente: string | null; profile_id: string | null }[],
  nomePor: Map<string, string>,
): VendasAlternativas {
  const porCanal = new Map<string, { canal: string; qtd: number; valor: number; mrr: number }>();
  for (const v of vendas) {
    const canal = v.canal_origem ?? "sem_canal";
    const atual = porCanal.get(canal) ?? { canal, qtd: 0, valor: 0, mrr: 0 };
    atual.qtd += 1;
    atual.valor += Number(v.valor);
    atual.mrr += Number(v.mrr ?? 0);
    porCanal.set(canal, atual);
  }
  return {
    qtd: vendas.length,
    valor: vendas.reduce((s, v) => s + Number(v.valor), 0),
    mrr: vendas.reduce((s, v) => s + Number(v.mrr ?? 0), 0),
    porCanal: Array.from(porCanal.values()).sort((a, b) => b.valor - a.valor),
    vendas: vendas
      .map((v) => ({
        id: v.id,
        data: v.data,
        cliente: v.cliente,
        canal: v.canal_origem ?? "sem_canal",
        valor: Number(v.valor),
        mrr: v.mrr == null ? null : Number(v.mrr),
        vendedor: (v.profile_id && nomePor.get(v.profile_id)) || "—",
      }))
      .sort((a, b) => b.data.localeCompare(a.data)),
  };
}
