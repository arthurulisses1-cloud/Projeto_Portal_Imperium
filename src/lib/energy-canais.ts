import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { casarLeads, ehOMesmoLead, type IdentidadeLead } from "@/lib/identidade";
import type { SunneDeal } from "@/lib/sunne";

// Energy: dois canais. O Pipefácil (recuperação de leads antigos da Sunne) e a plataforma da Sunne (propostas
// subidas direto, de outros canais). Um mesmo cliente pode estar nos dois: o negócio da Sunne que casa com um lead
// do Pipefácil (mesmo telefone e nome em comum) conta no canal do Pipefácil, para a venda nunca aparecer em dobro.

type LeadCrm = { deal_id: string; status: string; fechado_em: string | null; telefone_hash: string | null; nome_tokens: string[] | null };

export type CanaisEnergy = {
  /** Ids de negócios da Sunne que são o mesmo lead de um lead do Pipefácil. */
  viaPipefacil: Set<string>;
  /** Vendas (ganhos) do Pipefácil no mês sem negócio correspondente na Sunne. */
  ganhosPipefacilSemSunne: number;
  /** Quantos leads do Pipefácil têm telefone identificado (cobertura do casamento). */
  leadsComTelefone: number;
};

function mesLocal(data: string | null): string | null {
  if (!data || !Number.isFinite(Date.parse(data))) return null;
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date(data));
  return `${p.find((x) => x.type === "year")?.value}-${p.find((x) => x.type === "month")?.value}`;
}

/** Puro: casa os negócios da Sunne com os leads do Pipefácil. */
export function casarCanais(deals: SunneDeal[], leads: LeadCrm[], periodo: string): CanaisEnergy {
  const porTelefone = new Map<string, LeadCrm[]>();
  for (const l of leads) if (l.telefone_hash) porTelefone.set(l.telefone_hash, [...(porTelefone.get(l.telefone_hash) ?? []), l]);
  const idDe = (l: LeadCrm): IdentidadeLead => ({ telefoneHash: l.telefone_hash, nomeTokens: l.nome_tokens ?? [] });

  const viaPipefacil = new Set<string>();
  const leadsCasados = new Set<string>();
  for (const d of deals) {
    const id = d.identidade;
    if (!id?.telefoneHash) continue;
    for (const l of porTelefone.get(id.telefoneHash) ?? []) {
      if (ehOMesmoLead(casarLeads(id, idDe(l)))) {
        viaPipefacil.add(d.id);
        leadsCasados.add(l.deal_id);
      }
    }
  }
  const ganhos = leads.filter((l) => l.status === "won" && mesLocal(l.fechado_em) === periodo);
  return {
    viaPipefacil,
    ganhosPipefacilSemSunne: ganhos.filter((l) => !leadsCasados.has(l.deal_id)).length,
    leadsComTelefone: porTelefone.size === 0 ? 0 : leads.filter((l) => !!l.telefone_hash).length,
  };
}

/**
 * Lê os leads do Pipefácil do Energy (só os códigos de telefone e nome) e casa com a Sunne. Devolve null quando o
 * espelho ainda não tem telefone (migration/sincronização pendente): aí a tela mostra só o total, sem canais.
 */
export async function casarComPipefacil(_supabase: SupabaseClient, deals: SunneDeal[], ano: number, mes: number): Promise<CanaisEnergy | null> {
  void _supabase;
  try {
    const admin = createAdminClient();
    const { data: negocio } = await admin.from("negocios").select("id").eq("slug", "vorp-energy").maybeSingle();
    if (!negocio) return null;
    const leads: LeadCrm[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await admin
        .from("crm_deals")
        .select("deal_id, status, fechado_em, telefone_hash, nome_tokens")
        .eq("negocio_id", negocio.id)
        .range(de, de + 999);
      if (error) return null; // coluna ainda não existe
      leads.push(...((data ?? []) as LeadCrm[]));
      if (!data || data.length < 1000) break;
    }
    if (!leads.some((l) => !!l.telefone_hash)) return null;
    return casarCanais(deals, leads, `${ano}-${String(mes).padStart(2, "0")}`);
  } catch (e) {
    console.error("casarComPipefacil falhou:", e);
    return null;
  }
}
