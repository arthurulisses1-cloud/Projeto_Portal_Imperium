// Painel de 4 quadrantes do Mural: recebido x meta de recebimento por negócio.
import type { SupabaseClient } from "@supabase/supabase-js";

export type LinhaPainelNegocio = {
  id: string;
  slug: string;
  nome: string;
  equipe_nome: string | null;
  equipe_bandeira: string | null;
  status: "ativo" | "arquivado";
  meta: number;
  recebido: number;
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
    supabase.from("vendas").select("negocio_id, valor").gte("data", inicio).lt("data", fim).range(0, 19999),
  ]);

  const metaPor = new Map((metas ?? []).map((m) => [m.negocio_id as string, Number(m.meta_recebimento)]));
  const recebidoPor = new Map<string, number>();
  for (const v of vendas ?? []) {
    if (!v.negocio_id) continue;
    recebidoPor.set(v.negocio_id, (recebidoPor.get(v.negocio_id) ?? 0) + Number(v.valor));
  }

  return (negocios ?? []).map((n) => ({
    id: n.id,
    slug: n.slug,
    nome: n.nome,
    equipe_nome: n.equipe_nome ?? null,
    equipe_bandeira: n.equipe_bandeira ?? null,
    status: n.status,
    meta: metaPor.get(n.id) ?? 0,
    recebido: recebidoPor.get(n.id) ?? 0,
  }));
}
