// DRE por negócio (modelo multinegócio, a partir de 11/2026): receita recebida, comissões, fixos e a parte de cada negócio
// no custo do Diretor. Estritamente Diretor/Investidor (a página confere o papel). Nunca expor à Minerva.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarComissoesNegocios, type ComissaoNegocio } from "@/lib/comissao-negocio";
import { buscarComissaoEnergia } from "@/lib/energy-time";

/** Custo mensal do Diretor, dividido igualmente entre os negócios ativos (pedido do Diretor, 2026-11-05). */
export const CUSTO_DIRETOR = 10000;

export type FixoPessoa = { nome: string; cargo: string; fixo: number };

/**
 * Comissões do mês por negócio. O Maximus Energy não grava vendas: a receita (80% da primeira fatura) e as comissões vêm da Sunne.
 * `estimadoSunne` marca os negócios cujos valores foram lidos de lá.
 */
export async function comissoesComEnergia(supabase: SupabaseClient, ano: number, mes: number): Promise<(ComissaoNegocio & { estimadoSunne: boolean })[]> {
  const base = await buscarComissoesNegocios(supabase, ano, mes);
  return Promise.all(
    base.map(async (c) => {
      if (c.slug !== "vorp-energy" || c.recebido > 0) return { ...c, estimadoSunne: false };
      try {
        const e = await buscarComissaoEnergia(supabase, { ano, mes });
        const totalComissao = e.pessoas.reduce((s, p) => s + p.total, 0) + e.headTotal + e.diretorTotal;
        return { ...c, recebido: e.recebidoTotal, totalComissao, temRegra: true, estimadoSunne: true };
      } catch (err) {
        console.error("comissoesComEnergia: Sunne indisponível:", err);
        return { ...c, estimadoSunne: false };
      }
    })
  );
}

/** Fixos mensais por negócio (slug), só de pessoas ativas. */
export async function buscarFixosPorNegocio(supabase: SupabaseClient, negocios: { id: string; slug: string }[]): Promise<Map<string, FixoPessoa[]>> {
  const out = new Map<string, FixoPessoa[]>();
  if (negocios.length === 0) return out;
  const { data: vinculos } = await supabase
    .from("profile_negocios")
    .select("negocio_id, cargo, fixo, profiles!inner(id, full_name, ativo)")
    .in("negocio_id", negocios.map((n) => n.id))
    .not("fixo", "is", null);
  type V = { negocio_id: string; cargo: string; fixo: number; profiles: { id: string; full_name: string; ativo: boolean } | { id: string; full_name: string; ativo: boolean }[] };
  const slugPorId = new Map(negocios.map((n) => [n.id, n.slug]));
  for (const v of (vinculos ?? []) as unknown as V[]) {
    const p = Array.isArray(v.profiles) ? v.profiles[0] : v.profiles;
    const slug = slugPorId.get(v.negocio_id);
    if (!p?.ativo || !slug) continue;
    const arr = out.get(slug) ?? [];
    arr.push({ nome: p.full_name, cargo: v.cargo, fixo: Number(v.fixo) });
    out.set(slug, arr);
  }
  Array.from(out.values()).forEach((arr) => arr.sort((a, b) => b.fixo - a.fixo));
  return out;
}

export type DreNegocio = {
  slug: string;
  nome: string;
  temRegra: boolean;
  estimadoSunne: boolean;
  receita: number;
  comissoes: number;
  margemContribuicao: number;
  fixos: FixoPessoa[];
  totalFixos: number;
  custoDiretor: number;
  resultado: number;
};

export type DreTotal = Pick<DreNegocio, "receita" | "comissoes" | "margemContribuicao" | "totalFixos" | "custoDiretor" | "resultado">;

/** Monta a DRE de uma lista de negócios (pura). `custoDiretor` é dividido igualmente entre eles. */
export function montarDre(
  comissoes: (ComissaoNegocio & { estimadoSunne?: boolean })[],
  fixosPor: Map<string, FixoPessoa[]>,
  custoDiretor: number = CUSTO_DIRETOR
): { negocios: DreNegocio[]; total: DreTotal } {
  const rateio = comissoes.length > 0 ? custoDiretor / comissoes.length : 0;
  const negocios = comissoes.map((c): DreNegocio => {
    const fixos = fixosPor.get(c.slug) ?? [];
    const totalFixos = fixos.reduce((s, f) => s + f.fixo, 0);
    const margemContribuicao = c.recebido - c.totalComissao;
    return {
      slug: c.slug,
      nome: c.equipeNome || c.nome,
      temRegra: c.temRegra,
      estimadoSunne: !!c.estimadoSunne,
      receita: c.recebido,
      comissoes: c.totalComissao,
      margemContribuicao,
      fixos,
      totalFixos,
      custoDiretor: rateio,
      resultado: margemContribuicao - totalFixos - rateio,
    };
  });
  const soma = (f: (n: DreNegocio) => number) => negocios.reduce((s, n) => s + f(n), 0);
  return {
    negocios,
    total: {
      receita: soma((n) => n.receita),
      comissoes: soma((n) => n.comissoes),
      margemContribuicao: soma((n) => n.margemContribuicao),
      totalFixos: soma((n) => n.totalFixos),
      custoDiretor: negocios.length > 0 ? custoDiretor : 0,
      resultado: soma((n) => n.resultado),
    },
  };
}

export async function buscarDreNegocios(supabase: SupabaseClient, ano: number, mes: number) {
  const [comissoes, { data: negocios }] = await Promise.all([
    comissoesComEnergia(supabase, ano, mes),
    supabase.from("negocios").select("id, slug").eq("status", "ativo"),
  ]);
  const fixosPor = await buscarFixosPorNegocio(supabase, (negocios ?? []) as { id: string; slug: string }[]);
  return montarDre(comissoes, fixosPor);
}
