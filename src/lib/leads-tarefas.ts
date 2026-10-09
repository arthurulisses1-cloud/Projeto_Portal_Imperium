import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeBR, paraDataUTC } from "@/lib/data-br";
import { logErroSupabase } from "@/lib/log-erro-supabase";

// Entrevista que cai gera uma tarefa pro closer decidir em até 1 dia (validar
// ou recusar) — pedido do Diretor, 2026-10-09. A tarefa só pode ser concluída
// se o lead for movimentado (moverTarefa barra enquanto o lead continua em
// "Validação de Entrevista"; salvarStatusLead conclui sozinha quando ele sai).

// Só gera pra entrevistas a partir daqui, pra não despejar uma tarefa
// atrasada pra cada lead antigo parado em Validação no dia em que a regra
// entra no ar.
export const TAREFA_VALIDACAO_DESDE = "2026-10-09";

export function proximoDiaUtil(hoje: string): string {
  const d = paraDataUTC(hoje);
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

// Prazo da decisão: 1 dia (útil) depois que a entrevista cai.
export function prazoValidacao(hoje: string): string {
  return proximoDiaUtil(hoje);
}

export const TITULO_VALIDACAO = "Validar entrevista:";

// Idempotente (roda em todo sync): cria a tarefa pra cada lead em Validação de
// Entrevista que ainda não tem uma tarefa de validação aberta. Também cobre a
// entrevista RECUPERADA por um SDR, que volta pro closer validar de novo.
export async function gerarTarefasDeValidacao(supabase: SupabaseClient): Promise<{ criadas: number }> {
  const hoje = hojeBR();

  const { data: leadsRaw, error } = await supabase
    .from("entrevistas_leads")
    .select("id, lead_nome, closer_profile_id, data, repasse_etapa")
    .eq("status_followup", "validacao_entrevista")
    .not("closer_profile_id", "is", null)
    .or(`data.gte.${TAREFA_VALIDACAO_DESDE},repasse_etapa.eq.entrevista_recuperada`);
  logErroSupabase("gerarTarefasDeValidacao: leads", error);

  const leads = leadsRaw ?? [];
  if (leads.length === 0) return { criadas: 0 };

  const ids = leads.map((l) => l.id as string);
  const closerIds = Array.from(new Set(leads.map((l) => l.closer_profile_id as string)));

  const [{ data: abertas }, { data: ativos }] = await Promise.all([
    supabase.from("tasks").select("lead_id").in("lead_id", ids).eq("exige_lead_movido", true).neq("coluna", "concluido"),
    supabase.from("profiles").select("id").in("id", closerIds).eq("ativo", true),
  ]);
  const comTarefa = new Set((abertas ?? []).map((t) => t.lead_id as string));
  const closersAtivos = new Set((ativos ?? []).map((p) => p.id as string));

  const novas = leads
    .filter((l) => !comTarefa.has(l.id as string) && closersAtivos.has(l.closer_profile_id as string))
    .map((l) => ({
      profile_id: l.closer_profile_id,
      titulo: `${TITULO_VALIDACAO} ${l.lead_nome}`,
      descricao: "Valide ou recuse a entrevista em Meus Leads. A tarefa só conclui quando o lead for movimentado.",
      due_date: prazoValidacao(hoje),
      coluna: "afazer",
      prioridade: "alta",
      lead_id: l.id,
      exige_lead_movido: true,
    }));
  if (novas.length === 0) return { criadas: 0 };

  const { error: insError } = await supabase.from("tasks").insert(novas);
  logErroSupabase("gerarTarefasDeValidacao: insert", insError);
  return { criadas: insError ? 0 : novas.length };
}
