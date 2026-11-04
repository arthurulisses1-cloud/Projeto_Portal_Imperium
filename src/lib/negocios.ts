// Modelo multinegócio (2026-11). Um "negócio" agrupa pessoas, vendas, funil e
// regras de remuneração próprias. O negócio em foco fica num cookie; "todos"
// (ou cookie ausente) é a visão consolidada.
import type { SupabaseClient } from "@supabase/supabase-js";

export const COOKIE_NEGOCIO = "negocio_atual";
export const NEGOCIO_TODOS = "todos";

export type CargoNegocio = "head" | "executivo" | "closer" | "sdr" | "bdr" | "pre_vendas" | "gestor" | "outro";

export const CARGO_LABEL: Record<CargoNegocio, string> = {
  head: "Head Comercial",
  executivo: "Executivo Comercial",
  closer: "Closer",
  sdr: "SDR",
  bdr: "BDR",
  pre_vendas: "Pré-Vendas",
  gestor: "Gestor",
  outro: "Outro",
};

export type Negocio = {
  id: string;
  slug: string;
  nome: string;
  status: "ativo" | "arquivado";
  aceita_vendas_ate: string | null;
};

export type VinculoNegocio = Negocio & { cargo: CargoNegocio; principal: boolean };

/** Só os slugs que têm identidade visual própria em globals.css. */
export const SLUGS_COM_TEMA = ["vorp", "vorp-finance", "matchsales", "vorp-energy"] as const;

/** Visão consolidada: Diretor, investidor, analista e liderança. */
export function veConsolidado(role: string | undefined | null): boolean {
  return role === "diretor" || role === "investidor" || role === "analista";
}

/** Negócios que a pessoa pode abrir: todos (Diretor) ou só os seus vínculos. */
export async function buscarNegociosVisiveis(
  supabase: SupabaseClient,
  userId: string,
  role: string | undefined | null,
): Promise<VinculoNegocio[]> {
  if (veConsolidado(role)) {
    const { data } = await supabase
      .from("negocios")
      .select("id, slug, nome, status, aceita_vendas_ate")
      .order("ordem");
    return ((data ?? []) as Negocio[]).map((n) => ({ ...n, cargo: "head" as CargoNegocio, principal: false }));
  }
  const { data } = await supabase
    .from("profile_negocios")
    .select("cargo, principal, negocios(id, slug, nome, status, aceita_vendas_ate, ordem)")
    .eq("profile_id", userId);
  type Linha = { cargo: CargoNegocio; principal: boolean; negocios: (Negocio & { ordem: number }) | (Negocio & { ordem: number })[] | null };
  return ((data ?? []) as unknown as Linha[])
    .map((l) => ({ l, n: Array.isArray(l.negocios) ? l.negocios[0] : l.negocios }))
    .filter((x) => x.n)
    .sort((a, b) => (a.n!.ordem ?? 0) - (b.n!.ordem ?? 0))
    .map(({ l, n }) => ({ ...n!, cargo: l.cargo, principal: l.principal }));
}

/** Resolve o negócio em foco a partir do cookie, validando contra os visíveis. */
export function negocioEmFoco(cookieValor: string | undefined, visiveis: VinculoNegocio[]): VinculoNegocio | null {
  if (cookieValor && cookieValor !== NEGOCIO_TODOS) {
    const achado = visiveis.find((n) => n.slug === cookieValor);
    if (achado) return achado;
  }
  return null;
}
