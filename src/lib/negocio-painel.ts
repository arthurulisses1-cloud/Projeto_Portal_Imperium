// Painel de 4 quadrantes do Mural: recebido x meta de recebimento por negócio.
import type { SupabaseClient } from "@supabase/supabase-js";
import { metaForecast, metaMrrForecast } from "@/lib/forecast-negocios";
import type { CargoNegocio } from "@/lib/negocios";
import type { VendedorOpcao, PessoaOpcao } from "@/components/negocio/FormLancarVenda";

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
};

export async function buscarPainelNegocios(
  supabase: SupabaseClient,
  ano: number,
  mes: number,
): Promise<LinhaPainelNegocio[]> {
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;

  const [{ data: negocios }, { data: metas }, { data: vendas }] = await Promise.all([
    supabase.from("negocios").select("id, slug, nome, status, equipe_nome, equipe_bandeira").order("ordem"),
    supabase.from("metas_negocio").select("negocio_id, meta_recebimento").eq("ano", ano).eq("mes", mes),
    supabase.from("vendas").select("negocio_id, valor, mrr").gte("data", inicio).lt("data", fim).range(0, 19999),
  ]);

  const metaPor = new Map((metas ?? []).map((m) => [m.negocio_id as string, Number(m.meta_recebimento)]));
  const recebidoPor = new Map<string, number>();
  const mrrPor = new Map<string, number>();
  const qtdPor = new Map<string, number>();
  for (const v of vendas ?? []) {
    if (!v.negocio_id) continue;
    recebidoPor.set(v.negocio_id, (recebidoPor.get(v.negocio_id) ?? 0) + Number(v.valor));
    mrrPor.set(v.negocio_id, (mrrPor.get(v.negocio_id) ?? 0) + Number(v.mrr ?? 0));
    qtdPor.set(v.negocio_id, (qtdPor.get(v.negocio_id) ?? 0) + 1);
  }

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
  }));
}

/** Opções do formulário de lançamento do Mural: vendedores de cada negócio ativo e todas as pessoas (SDR/BDR/indicador). */
export async function buscarOpcoesLancamento(
  supabase: SupabaseClient,
  linhas: LinhaPainelNegocio[],
): Promise<{ vendedoresPor: Record<string, VendedorOpcao[]>; todos: PessoaOpcao[] }> {
  const ativos = linhas.filter((l) => l.status === "ativo");
  const slugPorId = new Map(ativos.map((l) => [l.id, l.slug]));
  const [{ data: membros }, { data: todos }] = await Promise.all([
    supabase.from("profile_negocios").select("negocio_id, cargo, profiles(id, full_name)").in("negocio_id", ativos.map((l) => l.id)),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);
  type M = { negocio_id: string; cargo: CargoNegocio; profiles: { id: string; full_name: string } | { id: string; full_name: string }[] | null };
  const vendedoresPor: Record<string, VendedorOpcao[]> = {};
  for (const m of (membros ?? []) as unknown as M[]) {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    const slug = slugPorId.get(m.negocio_id);
    if (!p || !slug) continue;
    (vendedoresPor[slug] ??= []).push({ id: p.id, nome: p.full_name, cargo: m.cargo });
  }
  for (const lista of Object.values(vendedoresPor)) lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { vendedoresPor, todos: (todos ?? []) as PessoaOpcao[] };
}
