import { createClient } from "@/lib/supabase/server";
import LeadsView, { type Lead, type MotivoPerda } from "@/components/leads/LeadsView";
import MotivosPerdaForm from "@/components/leads/MotivosPerdaForm";
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

  // Apaga a bolinha vermelha da lateral (ver temNovidadeLeads em
  // src/lib/pendencias.ts). Melhor-esforço: não bloqueia a página se falhar.
  await supabase.from("profiles").update({ leads_visto_em: new Date().toISOString() }).eq("id", viewer.authUserId);

  // Mini-CRM de fluxo de trabalho, não histórico — só mês corrente (pedido
  // do Diretor, 2026-08-27). O sync já limpa mês anterior a cada rodada
  // (run.ts), esse filtro aqui é defesa extra pro intervalo entre um mês
  // virar e o próximo sync rodar.
  const inicioMes = new Date().toISOString().slice(0, 7) + "-01";

  // RLS de entrevistas_leads já filtra pro recorte certo (dono, líder do
  // Exército, closer da Tribo, Diretor) — um select liso já vem certo,
  // sem precisar montar a lógica de escopo na mão como o Forecast faz
  // (lá a RLS de weekly_operacoes é aberta de propósito, ver Forecast).
  const [{ data: leadsRaw, error }, { data: motivosRaw }] = await Promise.all([
    supabase
      .from("entrevistas_leads")
      .select(
        "id, data, lead_nome, lead_telefone, sdr_profile_id, closer_profile_id, canal, origem, entrevistado, estado_civil, decisor, dores, documentacao_ciente, valores_apresentados, status_followup, observacao, motivo_perda_id, motivo_perda_obs, temperatura, valor_credito"
      )
      .gte("data", inicioMes)
      .order("data", { ascending: false }),
    supabase.from("motivos_perda_lead").select("id, nome, ativo").order("ordem"),
  ]);
  logErroSupabase("LeadsPage: entrevistas_leads", error);

  const leads = (leadsRaw ?? []) as Lead[];
  const motivosTodos = (motivosRaw ?? []) as MotivoPerda[];
  const motivosAtivos = motivosTodos.filter((m) => m.ativo);

  const idsPessoas = Array.from(
    new Set(leads.flatMap((l) => [l.sdr_profile_id, l.closer_profile_id]).filter((x): x is string => !!x))
  );
  const [{ data: pessoas }, { data: exercitosRaw }] = await Promise.all([
    idsPessoas.length > 0
      ? supabase
          .from("profiles")
          .select("id, full_name, tribo:tribos!profiles_tribo_id_fkey(exercito:exercitos(nome))")
          .in("id", idsPessoas)
      : Promise.resolve({ data: [] as { id: string; full_name: string; tribo: unknown }[] }),
    // Legado do Exército não tem tribo_id (lidera o Exército inteiro) —
    // sem esse fallback, um lead cujo Closer é líder "perde" o filtro de
    // Exército (mesma pegadinha documentada em guerra.ts/forecast.ts).
    supabase.from("exercitos").select("nome, legado_id"),
  ]);
  const nomePorId = new Map((pessoas ?? []).map((p) => [p.id, p.full_name as string]));
  const exercitoIdPorLegado = new Map((exercitosRaw ?? []).map((e) => [e.legado_id, e.nome]));
  const exercitoPorProfileId = new Map(
    (pessoas ?? []).map((p) => {
      const tribo = p.tribo as unknown as { exercito: { nome: string } | null } | null;
      return [p.id, tribo?.exercito?.nome ?? exercitoIdPorLegado.get(p.id) ?? null] as const;
    })
  );

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Meus Leads</h1>
        <p className="kicker mt-1">Entrevistas recebidas este mês — acompanhe, envie proposta, faça follow-up</p>
      </div>

      <LeadsView leads={leads} nomePorId={nomePorId} motivosPerda={motivosAtivos} exercitoPorProfileId={exercitoPorProfileId} />

      {meRole === "diretor" && <MotivosPerdaForm motivos={motivosTodos} />}
    </main>
  );
}
