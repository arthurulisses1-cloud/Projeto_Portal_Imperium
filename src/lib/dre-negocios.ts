// DRE por negócio (modelo multinegócio, a partir de 11/2026): receita recebida, comissões, fixos e a parte de cada negócio
// no custo do Diretor. Estritamente Diretor/Investidor (a página confere o papel). Nunca expor à Minerva.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarComissoesNegocios, type ComissaoNegocio } from "@/lib/comissao-negocio";
import { buscarComissaoEnergia } from "@/lib/energy-time";
import { bonusEfetivo, buscarDecisoesBonus, chaveBonus, estadoDoBonus, type EstadoBonus } from "@/lib/bonus-conduta";

/** Custo mensal do Diretor, dividido igualmente entre os negócios ativos (pedido do Diretor, 2026-11-05). */
export const CUSTO_DIRETOR = 10000;

/** Fixo base de uma pessoa num negócio; o bônus de conduta (R$ 200 do fixo fechado) vem à parte e depende da decisão do mês. */
export type FixoPessoa = { profileId?: string; negocioId?: string; nome: string; cargo: string; fixo: number; bonus?: number; bonusEstado?: EstadoBonus };

/** Custo de uma pessoa no mês: o fixo base mais o bônus aplicado ou ainda pendente (pura). */
export const custoDaPessoa = (f: FixoPessoa) => f.fixo + bonusEfetivo(f);

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

/** Fixo do mês: a exceção cadastrada para o mês (ex.: proporcional no mês de entrada) ou o fixo mensal (pura). */
export function fixoDoMes(fixo: number, excecoes: Record<string, number> | null | undefined, ano: number, mes: number): number {
  const e = excecoes?.[`${ano}-${String(mes).padStart(2, "0")}`];
  return e === undefined || e === null ? fixo : Number(e);
}

/** Fixos do mês por negócio (slug), só de pessoas ativas. Sem ano/mês usa o fixo mensal, sem exceções. */
export async function buscarFixosPorNegocio(supabase: SupabaseClient, negocios: { id: string; slug: string }[], ano?: number, mes?: number): Promise<Map<string, FixoPessoa[]>> {
  const out = new Map<string, FixoPessoa[]>();
  if (negocios.length === 0) return out;
  const ids = negocios.map((n) => n.id);
  // bonus_conduta (migration 0122) e fixo_excecoes (0120): sem elas, cai na leitura mais simples.
  const ler = (colunas: string) => supabase.from("profile_negocios").select(colunas).in("negocio_id", ids).not("fixo", "is", null);
  let achados = await ler("negocio_id, cargo, fixo, fixo_excecoes, bonus_conduta, profiles!inner(id, full_name, ativo)");
  if (achados.error) achados = await ler("negocio_id, cargo, fixo, fixo_excecoes, profiles!inner(id, full_name, ativo)");
  if (achados.error) achados = await ler("negocio_id, cargo, fixo, profiles!inner(id, full_name, ativo)");
  const vinculos: unknown[] | null = achados.data;
  const decisoes = ano && mes ? await buscarDecisoesBonus(supabase, ano, mes) : new Map<string, { aplicado: boolean; decididoEm: string }>();
  type V = { negocio_id: string; cargo: string; fixo: number; fixo_excecoes?: Record<string, number> | null; bonus_conduta?: number | null; profiles: { id: string; full_name: string; ativo: boolean } | { id: string; full_name: string; ativo: boolean }[] };
  const slugPorId = new Map(negocios.map((n) => [n.id, n.slug]));
  for (const v of (vinculos ?? []) as unknown as V[]) {
    const p = Array.isArray(v.profiles) ? v.profiles[0] : v.profiles;
    const slug = slugPorId.get(v.negocio_id);
    if (!p?.ativo || !slug) continue;
    const arr = out.get(slug) ?? [];
    const bonus = v.bonus_conduta ? Number(v.bonus_conduta) : 0;
    arr.push({
      profileId: p.id,
      negocioId: v.negocio_id,
      nome: p.full_name,
      cargo: v.cargo,
      fixo: ano && mes ? fixoDoMes(Number(v.fixo), v.fixo_excecoes, ano, mes) : Number(v.fixo),
      ...(bonus > 0 ? { bonus, bonusEstado: estadoDoBonus(decisoes.get(chaveBonus(p.id, v.negocio_id))) } : {}),
    });
    out.set(slug, arr);
  }
  Array.from(out.values()).forEach((arr) => arr.sort((a, b) => custoDaPessoa(b) - custoDaPessoa(a)));
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
    const totalFixos = fixos.reduce((s, f) => s + custoDaPessoa(f), 0);
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
  const fixosPor = await buscarFixosPorNegocio(supabase, (negocios ?? []) as { id: string; slug: string }[], ano, mes);
  return montarDre(comissoes, fixosPor);
}
