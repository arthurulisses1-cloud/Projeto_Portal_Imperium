import { createClient } from "@/lib/supabase/server";
import LeadsView, { type Lead } from "@/components/leads/LeadsView";
import { getViewerContext } from "@/lib/preview";
import { logErroSupabase } from "@/lib/log-erro-supabase";

export default async function LeadsPage() {
  const supabase = await createClient();
  const viewer = await getViewerContext(supabase);
  if (!viewer) return null;
  const meRole = viewer.effectiveRole;

  if (!["closer", "lider", "diretor"].includes(meRole)) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-xl text-gold-bright">Acesso restrito</h1>
        <p className="mt-2 text-sm text-stone-400">Leads é uma visão de Closers, líderes e Diretoria.</p>
      </main>
    );
  }

  // RLS de entrevistas_leads já filtra pro recorte certo (dono, líder do
  // Exército, closer da Tribo, Diretor) — um select liso já vem certo,
  // sem precisar montar a lógica de escopo na mão como o Forecast faz
  // (lá a RLS de weekly_operacoes é aberta de propósito, ver Forecast).
  const { data: leadsRaw, error } = await supabase
    .from("entrevistas_leads")
    .select(
      "id, data, lead_nome, lead_telefone, sdr_profile_id, closer_profile_id, canal, origem, entrevistado, estado_civil, decisor, dores, documentacao_ciente, valores_apresentados, status_followup, observacao"
    )
    .order("data", { ascending: false });
  logErroSupabase("LeadsPage: entrevistas_leads", error);

  const leads = (leadsRaw ?? []) as Lead[];

  const idsPessoas = Array.from(
    new Set(leads.flatMap((l) => [l.sdr_profile_id, l.closer_profile_id]).filter((x): x is string => !!x))
  );
  const { data: pessoas } = idsPessoas.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", idsPessoas) : { data: [] };
  const nomePorId = new Map((pessoas ?? []).map((p) => [p.id, p.full_name as string]));

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Meus Leads</h1>
        <p className="kicker mt-1">Entrevistas recebidas — acompanhe, envie proposta, faça follow-up</p>
      </div>

      <LeadsView leads={leads} nomePorId={nomePorId} />
    </main>
  );
}
