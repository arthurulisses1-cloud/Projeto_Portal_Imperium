// Leads por trás do realizado do funil (lista ao passar o mouse no Dashboard do Negócio).
// Lê o espelho do CRM (crm_deals + crm_eventos) e conta com a MESMA regra da sincronização
// (leadsDoRealizado usa o mesmo percurso de calcularRealizadoCrm), então a lista bate com o número.
// Só no servidor: chame depois de conferir que o usuário vê o negócio (as tabelas não têm leitura pelo app).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadEtapa } from "@/lib/funil-negocio";
import { CRM_POR_NEGOCIO } from "./config";
import { leadsDoRealizado, type DealCrm, type EventoCrm } from "./realizado";

/** Etapas com lista de leads. */
export const ETAPAS_COM_LISTA = ["reunioes_agendadas", "reunioes_realizadas", "propostas", "vendas"];

/** Lê em páginas de 1000. A consulta PRECISA ter .order() numa coluna única: sem ordem fixa o banco
 *  repete e pula linhas entre as páginas (16/11/2026: 1.279 eventos distintos de 1.661). */
async function lerTudo<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Mapa "canal|etapa" → leads do mês [inicio, fimExcl). Vazio se o negócio não tem CRM por canal. */
export async function buscarLeadsDoFunil(
  admin: SupabaseClient,
  slug: string,
  negocioId: string,
  inicio: string,
  fimExcl: string,
): Promise<Map<string, LeadEtapa[]>> {
  const out = new Map<string, LeadEtapa[]>();
  const cfg = CRM_POR_NEGOCIO[slug];
  if (!cfg || cfg.funilUnico) return out;

  const [deals, eventos, estado] = await Promise.all([
    lerTudo<DealCrm>((de, ate) =>
      admin
        .from("crm_deals")
        .select("deal_id, canal, faturamento, cargo, status, stage_id, valor, mrr, nome, empresa, produtos, responsavel_user_id, closer_user_id, sdr_user_id, criado_em, fechado_em")
        .eq("negocio_id", negocioId)
        .order("deal_id")
        .range(de, ate),
    ),
    lerTudo<EventoCrm>((de, ate) => admin.from("crm_eventos").select("deal_id, stage_id, ocorrido_em, tipo, pipeline_id").eq("negocio_id", negocioId).order("id").range(de, ate)),
    admin.from("integracao_estado").select("valor").eq("chave", `pipefacil:${slug}:membros`).maybeSingle(),
  ]);
  const nomes = (estado.data?.valor as Record<string, string> | null) ?? {};
  const nome = (id: string | null) => (id ? nomes[id] ?? null : null);

  for (const l of leadsDoRealizado(deals, eventos, cfg, inicio, fimExcl, ETAPAS_COM_LISTA)) {
    const d = l.deal;
    const responsavel = nome(d.responsavel_user_id);
    const sdr = nome(d.sdr_user_id);
    const k = `${l.canal}|${l.etapa}`;
    const lista = out.get(k) ?? [];
    lista.push({ id: d.deal_id, nome: d.nome || d.empresa || "(sem nome)", responsavel, preVendas: sdr && sdr !== responsavel ? sdr : null, data: l.data, faturamento: d.faturamento ?? null });
    out.set(k, lista);
  }
  return out;
}

/** Listas gravadas pela sincronização para o mês (todas as visões). null = mês fora da janela gravada. */
export async function buscarListasGravadas(admin: SupabaseClient, slug: string, mes: string): Promise<Map<string, LeadEtapa[]> | null> {
  const { data } = await admin.from("integracao_estado").select("valor").eq("chave", `leads_funil:${slug}:${mes}`).maybeSingle();
  if (!data?.valor) return null;
  return new Map(Object.entries(data.valor as Record<string, LeadEtapa[]>));
}

export type RankingGravado = Record<string, { nome: string; total: number; leads: { nome: string; data: string; canal: string; origem?: string | null; faturamento?: string | null }[] }[]>;

/** Ranking de pré-vendas gravado pela sincronização para o mês. null = sem ranking gravado. */
export async function buscarRankingGravado(admin: SupabaseClient, slug: string, mes: string): Promise<RankingGravado | null> {
  const { data } = await admin.from("integracao_estado").select("valor").eq("chave", `ranking:${slug}:${mes}`).maybeSingle();
  return (data?.valor as RankingGravado | null) ?? null;
}
