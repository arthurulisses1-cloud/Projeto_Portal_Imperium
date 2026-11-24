// Painel de 4 quadrantes do Mural: recebido x meta de recebimento por negócio.
import type { SupabaseClient } from "@supabase/supabase-js";
import { metaForecast, metaKwhForecast, metaMrrForecast } from "@/lib/forecast-negocios";
import type { CargoNegocio } from "@/lib/negocios";
import { kwhSunneDoMes } from "@/lib/sunne";
import type { VendedorOpcao, PessoaOpcao } from "@/components/negocio/FormLancarVenda";
import { buscarGanhosCrm } from "@/lib/recebido-crm";

export type LinhaPainelNegocio = {
  id: string;
  slug: string;
  nome: string;
  equipe_nome: string | null;
  equipe_bandeira: string | null;
  status: "ativo" | "arquivado";
  meta: number;
  recebido: number;
  /** Só Vorp e MatchSales: meta e realizado de MRR (soma do MRR dos contratos recebidos no mês). */
  mrrMeta: number;
  mrrRealizado: number;
  vendasQtd: number;
  /** Só Energy: meta e realizado de kWh vendidos no mês. */
  kwhMeta: number;
  kwhRealizado: number;
  /** Só Vorp Finance: vendas do Matri sem ninguém do time do Finance. Ficam fora do recebido e da meta. */
  extra: { recebido: number; vendas: number } | null;
};

export async function buscarPainelNegocios(
  supabase: SupabaseClient,
  ano: number,
  mes: number,
): Promise<LinhaPainelNegocio[]> {
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;

  const [{ data: negocios }, { data: metas }, { data: vendas }, kwhSunne, { data: membrosFinance }] = await Promise.all([
    supabase.from("negocios").select("id, slug, nome, status, equipe_nome, equipe_bandeira").order("ordem"),
    supabase.from("metas_negocio").select("negocio_id, meta_recebimento").eq("ano", ano).eq("mes", mes),
    supabase.from("vendas").select("negocio_id, profile_id, indicador_id, valor, mrr, kwh").gte("data", inicio).lt("data", fim).range(0, 19999),
    // kWh do Energy vem da Sunne (consumo médio dos fechados no mês); null se a leitura falhar.
    kwhSunneDoMes(ano, mes).catch((e) => {
      console.error("kwhSunneDoMes falhou:", e);
      return null;
    }),
    supabase.from("profile_negocios").select("profile_id, negocios!inner(slug)").eq("negocios.slug", "vorp-finance"),
  ]);
  const timeFinance = new Set((membrosFinance ?? []).map((m) => m.profile_id as string));
  const extraFinance = { recebido: 0, vendas: 0 };
  const idFinance = (negocios ?? []).find((n) => n.slug === "vorp-finance")?.id;

  const metaPor = new Map((metas ?? []).map((m) => [m.negocio_id as string, Number(m.meta_recebimento)]));
  const recebidoPor = new Map<string, number>();
  const mrrPor = new Map<string, number>();
  const qtdPor = new Map<string, number>();
  const kwhPor = new Map<string, number>();
  for (const v of vendas ?? []) {
    if (!v.negocio_id) continue;
    // Finance: venda sem o dono nem o participante no time do Finance é do Matri, vai para o Extra.
    if (v.negocio_id === idFinance && !(v.profile_id && timeFinance.has(v.profile_id)) && !(v.indicador_id && timeFinance.has(v.indicador_id))) {
      extraFinance.recebido += Number(v.valor);
      extraFinance.vendas += 1;
      continue;
    }
    recebidoPor.set(v.negocio_id, (recebidoPor.get(v.negocio_id) ?? 0) + Number(v.valor));
    mrrPor.set(v.negocio_id, (mrrPor.get(v.negocio_id) ?? 0) + Number(v.mrr ?? 0));
    kwhPor.set(v.negocio_id, (kwhPor.get(v.negocio_id) ?? 0) + Number(v.kwh ?? 0));
    qtdPor.set(v.negocio_id, (qtdPor.get(v.negocio_id) ?? 0) + 1);
  }

  // Negócio com recebidoPeloCrm (Energy): Recebido e quantidade pelos Ganhos do CRM.
  const ganhosCrm = await buscarGanhosCrm(negocios ?? [], inicio, fim);
  ganhosCrm.forEach((g, id) => {
    recebidoPor.set(id, g.reduce((s, x) => s + x.valor, 0));
    qtdPor.set(id, g.length);
  });

  return (negocios ?? []).map((n) => ({
    id: n.id,
    slug: n.slug,
    nome: n.nome,
    equipe_nome: n.equipe_nome ?? null,
    equipe_bandeira: n.equipe_bandeira ?? null,
    status: n.status,
    meta: Math.round(metaForecast(n.slug, ano, mes)) || (metaPor.get(n.id) ?? 0),
    recebido: recebidoPor.get(n.id) ?? 0,
    mrrMeta: Math.round(metaMrrForecast(n.slug, ano, mes)),
    mrrRealizado: mrrPor.get(n.id) ?? 0,
    vendasQtd: qtdPor.get(n.id) ?? 0,
    kwhMeta: Math.round(metaKwhForecast(n.slug, ano, mes)),
    extra: n.slug === "vorp-finance" ? extraFinance : null,
    kwhRealizado: n.slug === "vorp-energy" && kwhSunne !== null ? kwhSunne : kwhPor.get(n.id) ?? 0,
  }));
}

/** Opções do formulário de lançamento do Mural: vendedores de cada negócio ativo e todas as pessoas (SDR/BDR/indicador). */
export async function buscarOpcoesLancamento(
  supabase: SupabaseClient,
  linhas: Pick<LinhaPainelNegocio, "id" | "slug" | "status">[],
): Promise<{ vendedoresPor: Record<string, VendedorOpcao[]>; todos: PessoaOpcao[] }> {
  const ativos = linhas.filter((l) => l.status === "ativo");
  const slugPorId = new Map(ativos.map((l) => [l.id, l.slug]));
  const [{ data: membros }, { data: todos }] = await Promise.all([
    supabase.from("profile_negocios").select("negocio_id, cargo, profiles(id, full_name, role)").in("negocio_id", ativos.map((l) => l.id)),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);
  type P = { id: string; full_name: string; role: string | null };
  type M = { negocio_id: string; cargo: CargoNegocio; profiles: P | P[] | null };
  const vendedoresPor: Record<string, VendedorOpcao[]> = {};
  for (const m of (membros ?? []) as unknown as M[]) {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    const slug = slugPorId.get(m.negocio_id);
    if (!p || !slug) continue;
    (vendedoresPor[slug] ??= []).push({ id: p.id, nome: p.full_name, cargo: m.cargo, role: p.role ?? null });
  }
  for (const lista of Object.values(vendedoresPor)) lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { vendedoresPor, todos: (todos ?? []) as PessoaOpcao[] };
}
