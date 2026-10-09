import { createClient } from "@/lib/supabase/server";
import { getViewerContext } from "@/lib/preview";
import { logErroSupabase } from "@/lib/log-erro-supabase";
import { hojeBR } from "@/lib/data-br";
import RepasseSdrView, { type LeadRepasse } from "@/components/leads/RepasseSdrView";

// Funil "Repasse Entrevistas" (pedido do Diretor, 2026-10-09) — só pra SDR
// (cada um vê só o que está no nome dele, via RLS repasse_sdr_id) e Diretor
// (visão geral).
export default async function RepassePage() {
  const supabase = await createClient();
  const viewer = await getViewerContext(supabase);
  if (!viewer) return null;
  const role = viewer.effectiveRole;

  if (role !== "sdr" && role !== "diretor") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-xl text-gold-bright">Acesso restrito</h1>
        <p className="mt-2 text-sm text-stone-400">O Repasse de Entrevistas é uma visão dos SDRs e da Diretoria.</p>
      </main>
    );
  }

  let query = supabase
    .from("entrevistas_leads")
    .select(
      "id, data, lead_nome, lead_telefone, valor_credito, sdr_profile_id, closer_profile_id, origem, canal, dores, recusa_motivo, recusada_em, repasse_sdr_id, repasse_etapa, repasse_desde, repasse_nota"
    )
    .not("repasse_etapa", "is", null)
    .order("repasse_desde", { ascending: false })
    .limit(1000);
  // Diretor enxerga todos (RLS); o filtro explícito pro SDR é só reforço.
  if (role === "sdr") query = query.eq("repasse_sdr_id", viewer.effectiveId);
  const { data, error } = await query;
  logErroSupabase("RepassePage: entrevistas_leads", error);

  const leads = (data ?? []) as LeadRepasse[];
  const ids = Array.from(
    new Set(leads.flatMap((l) => [l.sdr_profile_id, l.closer_profile_id, l.repasse_sdr_id]).filter((x): x is string => !!x))
  );
  const { data: pessoas } =
    ids.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] as { id: string; full_name: string }[] };
  const nomePorId = new Map((pessoas ?? []).map((p) => [p.id, p.full_name as string]));

  const emAndamento = leads.filter((l) => l.repasse_etapa === "base_repasses" || l.repasse_etapa === "tentando_reativacao").length;
  const recuperadas = leads.filter((l) => l.repasse_etapa === "entrevista_recuperada").length;

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Repasse de Entrevistas</h1>
        <p className="kicker mt-1">
          Entrevistas recusadas por closers de outros Exércitos — sua missão é gerar uma nova entrevista com cada cliente
          {" · "}
          {emAndamento} em andamento · {recuperadas} recuperada{recuperadas === 1 ? "" : "s"}
        </p>
      </div>
      <RepasseSdrView leads={leads} nomePorId={nomePorId} hoje={hojeBR()} viewerId={viewer.effectiveId} />
    </main>
  );
}
