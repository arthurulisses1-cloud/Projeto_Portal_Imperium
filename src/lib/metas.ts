import type { SupabaseClient } from "@supabase/supabase-js";
import { FUNNEL_STAGES, FUNNEL_LABELS, type FunilEtapa } from "@/lib/funil";

export type Transicao = { de: FunilEtapa; para: FunilEtapa; label: string };

export const TRANSICOES: Transicao[] = FUNNEL_STAGES.slice(0, -1).map((etapa, i) => {
  const proxima = FUNNEL_STAGES[i + 1];
  return { de: etapa, para: proxima, label: `${FUNNEL_LABELS[etapa]} → ${FUNNEL_LABELS[proxima]}` };
});

export const MESES_LABEL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

// Deriva a meta de CADA etapa do funil a partir da meta de crédito + ticket
// médio (dá a meta de Pagos) e das taxas de conversão esperadas (anda de
// trás pra frente até Tentativas). Etapa sem taxa cadastrada fica null —
// não dá pra estimar sem esse dado.
export function calcularFunilMeta(
  metaCredito: number,
  metaTicketMedio: number,
  taxas: Map<string, number>
): Record<FunilEtapa, number | null> {
  const resultado = Object.fromEntries(
    FUNNEL_STAGES.map((e) => [e, null])
  ) as Record<FunilEtapa, number | null>;

  if (metaTicketMedio > 0) {
    resultado.pagos = metaCredito / metaTicketMedio;
  }

  for (let i = FUNNEL_STAGES.length - 2; i >= 0; i--) {
    const etapa = FUNNEL_STAGES[i];
    const proxima = FUNNEL_STAGES[i + 1];
    const proximoValor = resultado[proxima];
    const taxa = taxas.get(`${etapa}_${proxima}`);
    resultado[etapa] = proximoValor !== null && taxa ? proximoValor / taxa : null;
  }

  return resultado;
}

// Meta de crédito individual do mês: meta da firma dividida por Exército →
// Tribo → membros da Tribo. Também devolve a tabela de taxas de conversão
// esperadas e a meta de ticket médio, pra reaproveitar em várias telas.
export async function buscarMetaIndividual(supabase: SupabaseClient, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("tribo_id")
    .eq("id", userId)
    .single();

  const agora = new Date();
  const { data: metaMes } = await supabase
    .from("metas_mensais")
    .select("id, meta_credito_total, meta_ticket_medio")
    .eq("ano", agora.getFullYear())
    .eq("mes", agora.getMonth() + 1)
    .maybeSingle();

  const { data: conversoes } = metaMes
    ? await supabase
        .from("metas_conversao")
        .select("etapa_de, etapa_para, taxa_esperada")
        .eq("meta_mensal_id", metaMes.id)
    : { data: [] };
  const taxas = new Map((conversoes ?? []).map((c) => [`${c.etapa_de}_${c.etapa_para}`, c.taxa_esperada]));

  let metaIndividual = 0;
  if (profile?.tribo_id && metaMes?.meta_credito_total) {
    const { data: triboRow } = await supabase
      .from("tribos")
      .select("id, exercito_id")
      .eq("id", profile.tribo_id)
      .single();
    if (triboRow) {
      const [{ count: numExercitos }, { count: numTribos }, { count: numMembros }] = await Promise.all([
        supabase.from("exercitos").select("id", { count: "exact", head: true }),
        supabase.from("tribos").select("id", { count: "exact", head: true }).eq("exercito_id", triboRow.exercito_id),
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("tribo_id", triboRow.id)
          .in("role", ["sdr", "closer"]),
      ]);
      if (numExercitos && numTribos && numMembros) {
        metaIndividual = metaMes.meta_credito_total / numExercitos / numTribos / numMembros;
      }
    }
  }

  return {
    metaCreditoIndividual: metaIndividual,
    metaTicketMedio: metaMes?.meta_ticket_medio ?? 0,
    taxas,
  };
}
