// Recebido pelos Ganhos do CRM (negócios com `recebidoPeloCrm`, ex.: Energy): soma o valor dos leads
// no Ganho do espelho crm_deals, pela data de fechamento, no lugar da tabela vendas. Não exige que o
// responsável tenha login no portal. Só servidor: crm_deals não tem policy de leitura (service role).
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRM_POR_NEGOCIO } from "@/lib/integracoes/config";
import { dataBR } from "@/lib/integracoes/realizado";

/** Ganho do CRM no formato que os painéis usam para vendas. */
export type GanhoCrm = { id: string; negocio_id: string; data: string; valor: number; cliente: string | null; canal: "outbound" };

type LinhaDeal = {
  deal_id: string;
  negocio_id: string;
  status: string | null;
  stage_id: string | null;
  valor: number | string | null;
  nome: string | null;
  empresa: string | null;
  fechado_em: string | null;
};

/** Ganhos fechados no intervalo [inicio, fimExcl) (datas de Brasília), do mais recente ao mais antigo (pura). */
export function ganhosDoMes(linhas: LinhaDeal[], stagesGanho: string[], inicio: string, fimExcl: string): GanhoCrm[] {
  const out: GanhoCrm[] = [];
  for (const d of linhas) {
    if (d.status !== "won" || !d.stage_id || !stagesGanho.includes(d.stage_id) || !d.fechado_em) continue;
    const data = dataBR(d.fechado_em);
    if (data < inicio || data >= fimExcl) continue;
    out.push({ id: d.deal_id, negocio_id: d.negocio_id, data, valor: Number(d.valor ?? 0), cliente: d.empresa || d.nome, canal: "outbound" });
  }
  return out.sort((a, b) => b.data.localeCompare(a.data));
}

/**
 * Ganhos do mês por negócio (id → lista), só dos negócios com `recebidoPeloCrm`. Os demais ficam fora
 * do mapa e seguem pela tabela vendas. Falha na leitura também os deixa fora (o painel não quebra).
 */
export async function buscarGanhosCrm(negocios: { id: string; slug: string }[], inicio: string, fimExcl: string, admin?: SupabaseClient): Promise<Map<string, GanhoCrm[]>> {
  const out = new Map<string, GanhoCrm[]>();
  const alvos = negocios.filter((n) => CRM_POR_NEGOCIO[n.slug]?.recebidoPeloCrm);
  if (alvos.length === 0) return out;
  const stages = Array.from(new Set(alvos.flatMap((n) => CRM_POR_NEGOCIO[n.slug].stagesGanhoVenda)));
  const { data, error } = await (admin ?? createAdminClient())
    .from("crm_deals")
    .select("deal_id, negocio_id, status, stage_id, valor, nome, empresa, fechado_em")
    .in("negocio_id", alvos.map((n) => n.id))
    .eq("status", "won")
    .in("stage_id", stages)
    // Folga de 1 dia nas pontas; o corte exato (fuso de Brasília) é feito em ganhosDoMes.
    .gte("fechado_em", `${inicio}T00:00:00-04:00`)
    .lt("fechado_em", `${fimExcl}T00:00:00-02:00`)
    .range(0, 19999);
  if (error) {
    console.error("Erro lendo Ganhos do CRM:", error.message);
    return out;
  }
  for (const n of alvos) {
    out.set(n.id, ganhosDoMes((data ?? []).filter((d) => d.negocio_id === n.id) as LinhaDeal[], CRM_POR_NEGOCIO[n.slug].stagesGanhoVenda, inicio, fimExcl));
  }
  return out;
}
