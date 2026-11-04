// Compromisso do dia por negócio (modelo multinegócio): cada negócio/cargo tem
// seus próprios indicadores de esforço (tabela kpi_definicoes). Quem está num
// negócio sem definição (ex.: ainda só no Matri) continua no compromisso antigo.
import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeBR, paraDataUTC } from "@/lib/data-br";

export type KpiDef = { chave: string; label: string; ordem: number };
export type KpiLinha = { data: string; chave: string; label: string; meta: number; realizado: number };

export type ContextoKpis = {
  negocioId: string;
  negocioSlug: string;
  negocioNome: string;
  cargo: string;
  definicoes: KpiDef[];
};

/** Negócio principal da pessoa + KPIs do cargo dela. null = usa o compromisso antigo. */
export async function buscarContextoKpis(supabase: SupabaseClient, userId: string): Promise<ContextoKpis | null> {
  const { data: vinc } = await supabase
    .from("profile_negocios")
    .select("cargo, principal, negocios(id, slug, nome, status)")
    .eq("profile_id", userId)
    .order("principal", { ascending: false });
  type V = { cargo: string; negocios: { id: string; slug: string; nome: string; status: string } | { id: string; slug: string; nome: string; status: string }[] | null };
  for (const v of (vinc ?? []) as unknown as V[]) {
    const n = Array.isArray(v.negocios) ? v.negocios[0] : v.negocios;
    if (!n || n.status !== "ativo") continue;
    const { data: defs } = await supabase
      .from("kpi_definicoes")
      .select("chave, label, ordem, cargos")
      .eq("negocio_id", n.id)
      .eq("ativo", true)
      .contains("cargos", [v.cargo])
      .order("ordem");
    if (defs && defs.length > 0) {
      return {
        negocioId: n.id,
        negocioSlug: n.slug,
        negocioNome: n.nome,
        cargo: v.cargo,
        definicoes: defs.map((d) => ({ chave: d.chave, label: d.label, ordem: d.ordem })),
      };
    }
  }
  return null;
}

export async function buscarLinhasKpis(supabase: SupabaseClient, userId: string, negocioId: string, desde: string): Promise<KpiLinha[]> {
  const { data } = await supabase
    .from("compromisso_kpis")
    .select("data, chave, label, meta, realizado")
    .eq("profile_id", userId)
    .eq("negocio_id", negocioId)
    .gte("data", desde)
    .order("data", { ascending: false });
  return (data ?? []).map((r) => ({ data: r.data, chave: r.chave, label: r.label, meta: Number(r.meta), realizado: Number(r.realizado) }));
}

/** Um dia está cumprido quando há meta lançada e todo KPI com meta chegou nela. */
export function diaCumprido(linhas: KpiLinha[]): boolean {
  const comMeta = linhas.filter((l) => l.meta > 0);
  return comMeta.length > 0 && comMeta.every((l) => l.realizado >= l.meta);
}

export function agruparPorDia(linhas: KpiLinha[]): Map<string, KpiLinha[]> {
  const m = new Map<string, KpiLinha[]>();
  for (const l of linhas) m.set(l.data, [...(m.get(l.data) ?? []), l]);
  return m;
}

/** Dias úteis seguidos cumpridos (hoje só entra se já estiver cumprido). */
export function streakKpis(porDia: Map<string, KpiLinha[]>): number {
  const hoje = hojeBR();
  const cursor = paraDataUTC(hoje);
  let n = 0;
  for (let i = 0; i < 90; i++) {
    const dow = cursor.getUTCDay();
    const iso = cursor.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6) {
      const linhas = porDia.get(iso);
      if (linhas && diaCumprido(linhas)) n++;
      else if (iso !== hoje) break;
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return n;
}
