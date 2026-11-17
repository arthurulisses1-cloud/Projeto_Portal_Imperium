import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeBR } from "@/lib/data-br";
import type { Cobranca, LeadCobravel } from "@/lib/leads-cobranca";
import { DIAS_ESCALA_HEAD, cobrancaFinance, type LeadFinanceCobravel } from "@/lib/leads-cobranca-finance";
import { ETAPAS_FINANCE_ABERTAS } from "@/lib/leads-finance";

export type CobrancaLead = { lead: LeadCobravel; cobranca: Cobranca; valor_credito: number | null };

// Lembretes de Meus Leads (Vorp Finance). Sem rodízio: o lead continua com quem o subiu e o sistema só
// avisa o que precisa de atualização ou está estagnado. O executivo recebe os dele; o Head, além dos dele,
// as vendas para aprovar e o que está parado há muito tempo com o time. A RLS já limita o que cada um enxerga.
export async function buscarCobrancasLeads(supabase: SupabaseClient, userId: string, _role?: string): Promise<CobrancaLead[]> {
  void _role;
  const hoje = hojeBR();

  const { data: fin } = await supabase.from("negocios").select("id").eq("slug", "vorp-finance").maybeSingle();
  if (!fin) return [];
  const { data: vinc } = await supabase.from("profile_negocios").select("cargo").eq("profile_id", userId).eq("negocio_id", fin.id).maybeSingle();
  if (!vinc) return [];
  const ehHead = vinc.cargo === "head";

  const { data } = await supabase
    .from("entrevistas_leads")
    .select("id, lead_nome, status_followup, data, status_em, ultimo_movimento_em, ultima_atualizacao_em, sdr_profile_id, closer_profile_id, sub_comissao_prevista")
    .eq("negocio_id", fin.id)
    .in("status_followup", ETAPAS_FINANCE_ABERTAS)
    .limit(2000);

  const resultado: CobrancaLead[] = [];
  for (const row of data ?? []) {
    const lead = row as LeadFinanceCobravel & { sub_comissao_prevista: number | null };
    const meu = lead.sdr_profile_id === userId || lead.closer_profile_id === userId;
    const cobranca = cobrancaFinance(lead, hoje, ehHead);
    if (!cobranca) continue;
    const escalado = ehHead && !meu && cobranca.tipo !== "aprovar_venda" && cobranca.dias >= DIAS_ESCALA_HEAD;
    if (!(meu && cobranca.tipo !== "aprovar_venda") && !(ehHead && cobranca.tipo === "aprovar_venda") && !escalado) continue;
    resultado.push({
      lead: {
        id: lead.id,
        lead_nome: lead.lead_nome,
        status_followup: lead.status_followup,
        em_reanalise: false,
        closer_profile_id: lead.closer_profile_id,
        rot_responsavel_id: null,
        rot_fase: null,
        rot_etapa: null,
        rot_desde: null,
        rot_primeiro_toque_em: null,
        subido_em: null,
        status_em: lead.status_em,
        ultima_atualizacao_em: lead.ultima_atualizacao_em,
        ultimo_movimento_em: lead.ultimo_movimento_em,
        compliance_comportamento: null,
        pendencia_prazo: null,
      },
      cobranca,
      valor_credito: lead.sub_comissao_prevista ?? null,
    });
  }

  // Venda para aprovar primeiro, depois o que está parado há mais tempo.
  const peso = (c: Cobranca) => (c.tipo === "aprovar_venda" ? 0 : c.tipo === "estagnado" ? 1 : 2);
  return resultado.sort((a, b) => peso(a.cobranca) - peso(b.cobranca) || b.cobranca.dias - a.cobranca.dias);
}
