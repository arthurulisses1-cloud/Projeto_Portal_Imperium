import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeBR } from "@/lib/data-br";
import { ETAPAS_ABERTAS, cobrancaDoLead, responsavelDoLead, type Cobranca, type LeadCobravel } from "@/lib/leads-cobranca";

export type CobrancaLead = { lead: LeadCobravel; cobranca: Cobranca; valor_credito: number | null };

// Dias de atraso a partir dos quais o líder também é cobrado por um lead que
// não é dele (pedido do Diretor, 2026-10-09: "lembrete pro closer/líder").
const DIAS_ESCALA_LIDER = 4;

// Leads que precisam de ação de quem está logado. A RLS de entrevistas_leads
// já limita o que cada pessoa enxerga (dono, líder do Exército, Diretor).
// Closer: só o que está sob responsabilidade dele. Líder: o que é dele mais
// o que está com atraso grande dentro do Exército.
export async function buscarCobrancasLeads(supabase: SupabaseClient, userId: string, role: string): Promise<CobrancaLead[]> {
  if (role !== "closer" && role !== "lider") return [];
  const hoje = hojeBR();

  const { data } = await supabase
    .from("entrevistas_leads")
    .select(
      "id, lead_nome, status_followup, em_reanalise, closer_profile_id, rot_responsavel_id, rot_fase, rot_desde, rot_primeiro_toque_em, subido_em, status_em, ultima_atualizacao_em, ultimo_movimento_em, compliance_comportamento, pendencia_prazo, valor_credito"
    )
    .in("status_followup", Array.from(ETAPAS_ABERTAS))
    .eq("em_reanalise", false)
    .limit(2000);

  const resultado: CobrancaLead[] = [];
  for (const row of data ?? []) {
    const lead = row as LeadCobravel & { valor_credito: number | null };
    const cobranca = cobrancaDoLead(lead, hoje);
    if (!cobranca) continue;
    const meu = responsavelDoLead(lead) === userId;
    const escalado = role === "lider" && !meu && cobranca.tipo !== "recuperacao_nova" && cobranca.dias >= DIAS_ESCALA_LIDER;
    if (meu || escalado) resultado.push({ lead, cobranca, valor_credito: lead.valor_credito ?? null });
  }

  const peso = (c: Cobranca) => (c.tipo === "pendencia_vencida" ? 0 : c.tipo === "recuperacao_nova" ? 1 : 2);
  return resultado.sort((a, b) => peso(a.cobranca) - peso(b.cobranca) || b.cobranca.dias - a.cobranca.dias);
}
