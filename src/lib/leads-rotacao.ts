import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeBR } from "@/lib/data-br";
import { logErroSupabase } from "@/lib/log-erro-supabase";
import { ETAPAS_ROTACAO_CLOSER, deveRotacionar, escolherProximoCloser, type LeadRotacionavel } from "@/lib/leads-cobranca";

type LinhaLead = LeadRotacionavel & {
  id: string;
  lead_nome: string;
  rot_responsavel_id: string | null;
  rot_ciclos: number;
};

// Rotação de leads parados (pedido do Diretor, 2026-10-09): 30 dias sem
// movimento → o lead vai pra outro closer da fila fazer um pitch de
// diagnóstico ("por que não fechou?"); 30 dias depois volta pro closer
// original; 30 dias depois vai pro próximo da fila... e o ciclo segue.
// "Movimento" = troca de etapa ou resultado de compliance (ultimo_movimento_em)
// — um simples toque/anotação NÃO reinicia o relógio, é o que garante que o
// lead continua girando enquanto ninguém consegue avançar.
//
// Idempotente: roda a cada sync (a cada ~30 min) e só mexe em quem já
// completou os 30 dias.
export async function rotacionarLeadsParados(supabase: SupabaseClient): Promise<{ rotacionados: number }> {
  const hoje = hojeBR();

  const [{ data: leadsRaw, error }, { data: closersRaw }] = await Promise.all([
    supabase
      .from("entrevistas_leads")
      .select(
        "id, lead_nome, status_followup, em_reanalise, compliance_comportamento, closer_profile_id, ultimo_movimento_em, rot_desde, rot_fase, rot_etapa, rot_tentaram, rot_responsavel_id, rot_ciclos"
      )
      .in("status_followup", Array.from(ETAPAS_ROTACAO_CLOSER))
      .eq("em_reanalise", false),
    supabase.from("profiles").select("id").eq("role", "closer").eq("ativo", true),
  ]);
  logErroSupabase("rotacionarLeadsParados: entrevistas_leads", error);

  const leads = (leadsRaw ?? []) as LinhaLead[];
  const closersAtivos = (closersRaw ?? []).map((c) => c.id as string);

  const carga = new Map<string, number>();
  for (const l of leads) {
    if (l.rot_fase === "diagnostico" && l.rot_responsavel_id) {
      carga.set(l.rot_responsavel_id, (carga.get(l.rot_responsavel_id) ?? 0) + 1);
    }
  }

  let rotacionados = 0;
  for (const l of leads) {
    if (!deveRotacionar(l, hoje)) continue;

    const originalAtivo = !!l.closer_profile_id && closersAtivos.includes(l.closer_profile_id);
    let update: Record<string, unknown>;
    let detalhe: Record<string, unknown>;

    if (l.rot_fase === "diagnostico" && originalAtivo) {
      if (l.rot_responsavel_id) carga.set(l.rot_responsavel_id, Math.max(0, (carga.get(l.rot_responsavel_id) ?? 1) - 1));
      update = {
        rot_responsavel_id: l.closer_profile_id,
        rot_fase: "retorno_original",
        rot_etapa: "base_repasses",
        rot_desde: hoje,
        rot_primeiro_toque_em: null,
      };
      detalhe = { de: l.rot_responsavel_id, para: l.closer_profile_id, fase: "retorno_original" };
    } else {
      const proximo = escolherProximoCloser(l, closersAtivos, carga);
      if (!proximo) continue;
      if (l.rot_fase === "diagnostico" && l.rot_responsavel_id) {
        carga.set(l.rot_responsavel_id, Math.max(0, (carga.get(l.rot_responsavel_id) ?? 1) - 1));
      }
      carga.set(proximo.id, (carga.get(proximo.id) ?? 0) + 1);
      update = {
        rot_responsavel_id: proximo.id,
        rot_fase: "diagnostico",
        rot_etapa: "base_repasses",
        rot_desde: hoje,
        rot_primeiro_toque_em: null,
        rot_tentaram: proximo.zerouTentativas ? [proximo.id] : [...l.rot_tentaram, proximo.id],
        rot_ciclos: l.rot_fase === "retorno_original" ? l.rot_ciclos + 1 : l.rot_ciclos,
      };
      detalhe = { de: l.rot_responsavel_id ?? l.closer_profile_id, para: proximo.id, fase: "diagnostico" };
    }

    const { error: updError } = await supabase.from("entrevistas_leads").update(update).eq("id", l.id);
    if (updError) {
      logErroSupabase(`rotacionarLeadsParados: update ${l.id}`, updError);
      continue;
    }
    await supabase.from("lead_atualizacoes").insert({
      lead_id: l.id,
      autor_id: null,
      tipo: "rotacao",
      nota: `Sem movimento há 30 dias — ${detalhe.fase === "diagnostico" ? "enviado pra outro closer (diagnóstico)" : "voltou pro closer original"}`,
      detalhe,
    });
    rotacionados++;
  }

  return { rotacionados };
}
