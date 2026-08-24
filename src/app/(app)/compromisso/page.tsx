import { createClient } from "@/lib/supabase/server";
import { registrarCompromisso, atualizarCompromisso } from "./actions";
import { marcarFaltaTime } from "@/app/(app)/exercito/actions";
import Card from "@/components/ui/Card";
import { buscarMetaIndividual, calcularFunilMeta } from "@/lib/metas";
import { calcularStreak, cumpriuCompromisso, type StreakRow } from "@/lib/streak";
import { logErroSupabase } from "@/lib/log-erro-supabase";
import { getViewerContext } from "@/lib/preview";
import { IconFlame, IconCheck, IconAlert } from "@/components/ui/icons";
import { Badge } from "@/components/ui/Badge";

type CompromissoRow = StreakRow;

function statusLabel(row: CompromissoRow, isHoje: boolean) {
  if (row.falta) return { texto: "Ausente", cor: "text-stone-500" };
  if (cumpriuCompromisso(row)) return { texto: "Cumprido", cor: "text-success-bright" };
  if (isHoje) return { texto: "Em andamento", cor: "text-gold" };
  return { texto: "Não cumprido", cor: "text-wine-bright" };
}

// Conta dias úteis (seg-sex) entre hoje (inclusive) e o fim do mês.
function diasUteisRestantes(hoje: Date): number {
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  let dias = 0;
  const cursor = new Date(hoje);
  while (cursor <= fimMes) {
    const diaSemana = cursor.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) dias++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

export default async function CompromissoPage() {
  const supabase = await createClient();
  const viewer = await getViewerContext(supabase);
  if (!viewer) return null;
  const meId = viewer.effectiveId;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, tribo_id")
    .eq("id", meId)
    .single();
  logErroSupabase(`CompromissoPage: profiles (id=${meId})`, profileError);

  const hoje = new Date().toISOString().slice(0, 10);

  const { data: hojeRow } = await supabase
    .from("compromissos")
    .select("*")
    .eq("profile_id", meId)
    .eq("data", hoje)
    .maybeSingle();

  const primeiroDiaMes = hoje.slice(0, 7) + "-01";
  const { data: historico } = await supabase
    .from("compromissos")
    .select("*")
    .eq("profile_id", meId)
    .gte("data", primeiroDiaMes)
    .lt("data", hoje)
    .order("data", { ascending: false })
    .limit(30);

  // Streak não fica preso ao mês corrente — busca os últimos 60 dias.
  const seiscentaDiasAtras = new Date();
  seiscentaDiasAtras.setDate(seiscentaDiasAtras.getDate() - 60);
  const { data: historicoStreak } = await supabase
    .from("compromissos")
    .select("data, entrevistas_comp, entrevistas_real, assinaturas_comp, assinaturas_real, pagos_comp, pagos_real, falta, lancado")
    .eq("profile_id", meId)
    .gte("data", seiscentaDiasAtras.toISOString().slice(0, 10))
    .lt("data", hoje)
    .order("data", { ascending: false });
  const streak = calcularStreak(historicoStreak ?? []);

  const diasComRegistro = (historico ?? []).filter((r) => r.lancado && !r.falta);
  const diasCumpridos = diasComRegistro.filter((r) => cumpriuCompromisso(r));
  const pctCumprido =
    diasComRegistro.length > 0
      ? Math.round((diasCumpridos.length / diasComRegistro.length) * 100)
      : null;

  // Meta diária sugerida: (meta do mês inteiro - já realizado) / dias úteis restantes.
  let sugestao: { entrevistas: number; assinaturas: number; pagos: number } | null = null;
  if (!hojeRow) {
    const { metaCreditoIndividual, metaTicketMedio, taxas } = await buscarMetaIndividual(supabase, meId);
    const metaFunil = calcularFunilMeta(metaCreditoIndividual, metaTicketMedio, taxas);

    const inicioMes = hoje.slice(0, 7) + "-01";
    const { data: realizadoMes } = await supabase
      .from("producao_funil")
      .select("etapa, realizado")
      .eq("profile_id", meId)
      .in("etapa", ["entrevistas", "assinaturas", "pagos"])
      .gte("data", inicioMes);
    const jaFeito = { entrevistas: 0, assinaturas: 0, pagos: 0 };
    for (const r of realizadoMes ?? []) {
      if (r.etapa in jaFeito) jaFeito[r.etapa as keyof typeof jaFeito] += r.realizado;
    }

    const restantes = diasUteisRestantes(new Date());
    if (restantes > 0 && metaCreditoIndividual > 0) {
      sugestao = {
        entrevistas: Math.max(0, Math.ceil(((metaFunil.entrevistas ?? 0) - jaFeito.entrevistas) / restantes)),
        assinaturas: Math.max(0, Math.ceil(((metaFunil.assinaturas ?? 0) - jaFeito.assinaturas) / restantes)),
        pagos: Math.max(0, Math.ceil(((metaFunil.pagos ?? 0) - jaFeito.pagos) / restantes)),
      };
    }
  }

  // Compromisso agregado da Tribo (só pra Closer)
  type MembroTribo = {
    id: string;
    nome: string;
    avatarUrl: string | null;
    row: CompromissoRow | null;
  };
  let membrosTribo: MembroTribo[] = [];
  let agregadoTribo: {
    entrevistas_comp: number;
    entrevistas_real: number;
    assinaturas_comp: number;
    assinaturas_real: number;
    pagos_comp: number;
    pagos_real: number;
  } | null = null;

  if (profile?.role === "closer" && profile.tribo_id) {
    const { data: sdrs, error: sdrsError } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("tribo_id", profile.tribo_id)
      .eq("role", "sdr");
    logErroSupabase(`CompromissoPage: profiles sdrs da tribo (tribo_id=${profile.tribo_id})`, sdrsError);

    const idsTribo = [meId, ...(sdrs ?? []).map((s) => s.id)];
    const { data: comprosHoje } = await supabase
      .from("compromissos")
      .select("*")
      .in("profile_id", idsTribo)
      .eq("data", hoje);
    const comproPorId = new Map((comprosHoje ?? []).map((r) => [r.profile_id, r as CompromissoRow]));

    const { data: euProfile } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", meId).single();

    membrosTribo = [
      { id: meId, nome: `${euProfile?.full_name ?? "Você"} (você)`, avatarUrl: euProfile?.avatar_url ?? null, row: comproPorId.get(meId) ?? null },
      ...(sdrs ?? []).map((s) => ({ id: s.id, nome: s.full_name, avatarUrl: s.avatar_url, row: comproPorId.get(s.id) ?? null })),
    ];
    // Quem ainda não lançou hoje sobe pro topo — é o que precisa de atenção
    // do Closer primeiro, não devia se perder no meio da lista.
    membrosTribo.sort((a, b) => Number(!!a.row) - Number(!!b.row));

    agregadoTribo = { entrevistas_comp: 0, entrevistas_real: 0, assinaturas_comp: 0, assinaturas_real: 0, pagos_comp: 0, pagos_real: 0 };
    for (const m of membrosTribo) {
      if (!m.row) continue;
      agregadoTribo.entrevistas_comp += m.row.entrevistas_comp;
      agregadoTribo.entrevistas_real += m.row.entrevistas_real;
      agregadoTribo.assinaturas_comp += m.row.assinaturas_comp;
      agregadoTribo.assinaturas_real += m.row.assinaturas_real;
      agregadoTribo.pagos_comp += m.row.pagos_comp;
      agregadoTribo.pagos_real += m.row.pagos_real;
    }
  }

  // Feedback do Closer (só pra SDR)
  let feedbacks: { id: string; texto: string; created_at: string }[] = [];
  if (profile?.role === "sdr") {
    const { data } = await supabase
      .from("feedbacks_sdr")
      .select("id, texto, created_at")
      .eq("sdr_id", meId)
      .order("created_at", { ascending: false })
      .limit(3);
    feedbacks = data ?? [];
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Compromisso</h1>
          <p className="kicker mt-1">
            Meta e acompanhamento do dia
            {viewer.isPreview && ` · pré-visualizando como ${viewer.effectiveNome}`}
          </p>
        </div>
        {streak > 0 && (
          <Badge tone="gold">
            <IconFlame className="h-3.5 w-3.5" />
            {streak} {streak === 1 ? "dia seguido" : "dias seguidos"}
          </Badge>
        )}
      </div>

      {agregadoTribo && (
        <Card
          title="Compromisso da Tribo (hoje)"
          right={
            (() => {
              const pendentes = membrosTribo.filter((m) => !m.row).length;
              return pendentes > 0 ? (
                <Badge tone="warning" variant="solid">
                  {pendentes} {pendentes === 1 ? "ainda não lançou" : "ainda não lançaram"}
                </Badge>
              ) : (
                <span className="flex items-center gap-1 text-xs text-success-bright">
                  <IconCheck className="h-3.5 w-3.5" /> Todo mundo já lançou hoje
                </span>
              );
            })()
          }
        >
          <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-stone-500">Entrevistas</p>
              <p className="text-stone-100">
                {agregadoTribo.entrevistas_real}/{agregadoTribo.entrevistas_comp}
              </p>
            </div>
            <div>
              <p className="text-stone-500">Assinaturas</p>
              <p className="text-stone-100">
                {agregadoTribo.assinaturas_real}/{agregadoTribo.assinaturas_comp}
              </p>
            </div>
            <div>
              <p className="text-stone-500">Pagos</p>
              <p className="text-stone-100">
                {agregadoTribo.pagos_real}/{agregadoTribo.pagos_comp}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {membrosTribo.map((m) => {
              const pendente = !m.row;
              const status = m.row ? statusLabel(m.row, true) : null;
              const jaAusente = m.row?.falta;
              return (
                <div
                  key={m.id}
                  className={`flex items-center gap-3 rounded border p-3 ${
                    pendente ? "border-warning/40 bg-warning/5" : "border-imperium-line bg-imperium-bg/40"
                  }`}
                >
                  {m.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.avatarUrl}
                      alt={m.nome}
                      className="h-10 w-10 shrink-0 rounded-full border border-imperium-line-strong object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-imperium-line-strong bg-imperium-bg text-xs text-stone-500">
                      {m.nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-stone-200">{m.nome}</p>
                    {pendente ? (
                      <Badge tone="warning" variant="tag" className="mt-0.5">
                        <IconAlert className="h-3 w-3" /> Não lançou hoje
                      </Badge>
                    ) : (
                      <p className={`text-xs ${status!.cor}`}>{status!.texto}</p>
                    )}
                  </div>
                  {!jaAusente && (
                    <form action={marcarFaltaTime}>
                      <input type="hidden" name="profile_id" value={m.id} />
                      <button type="submit" className="shrink-0 text-[10px] text-stone-600 hover:text-wine-bright">
                        Falta
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title={profile?.role === "closer" ? "Meu compromisso individual (opcional)" : "Hoje"}>
        {profile?.role === "closer" && (
          <p className="mb-3 text-xs text-stone-500">
            O que conta pro seu acompanhamento principal é o card da Tribo acima (soma do time). Só
            preencha isso aqui se você também quiser bater uma meta pessoal no dia.
          </p>
        )}
        {!hojeRow ? (
          <form action={registrarCompromisso} className="space-y-4">
            <p className="text-sm text-stone-400">
              Você ainda não lançou o compromisso de hoje. Define sua meta:
            </p>
            {sugestao && (
              <p className="text-xs text-gold-dim">
                Sugestão pra bater a meta do mês no ritmo certo: já preenchemos abaixo — ajuste se
                quiser.
              </p>
            )}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-xs text-stone-400">Entrevistas</label>
                <input
                  name="entrevistas_comp"
                  type="number"
                  min={0}
                  defaultValue={sugestao?.entrevistas ?? 0}
                  className="input-imp"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-stone-400">Assinaturas</label>
                <input
                  name="assinaturas_comp"
                  type="number"
                  min={0}
                  defaultValue={sugestao?.assinaturas ?? 0}
                  className="input-imp"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-stone-400">Pagos</label>
                <input
                  name="pagos_comp"
                  type="number"
                  min={0}
                  defaultValue={sugestao?.pagos ?? 0}
                  className="input-imp"
                />
              </div>
            </div>
            <button type="submit" className="btn-gold">
              Registrar compromisso do dia
            </button>
          </form>
        ) : (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className={`text-sm font-medium ${statusLabel(hojeRow, true).cor}`}>
                {statusLabel(hojeRow, true).texto}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-stone-500">Entrevistas</p>
                <p className="text-stone-100">
                  {hojeRow.entrevistas_real}/{hojeRow.entrevistas_comp}
                </p>
              </div>
              <div>
                <p className="text-stone-500">Assinaturas</p>
                <p className="text-stone-100">
                  {hojeRow.assinaturas_real}/{hojeRow.assinaturas_comp}
                </p>
              </div>
              <div>
                <p className="text-stone-500">Pagos</p>
                <p className="text-stone-100">
                  {hojeRow.pagos_real}/{hojeRow.pagos_comp}
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs text-stone-600">
              O &quot;realizado&quot; atualiza automaticamente quando a integração com a
              planilha estiver ligada.
            </p>

            {profile?.role === "sdr" && (
              <details className="mt-4 group">
                <summary className="cursor-pointer text-[11px] uppercase tracking-wide text-stone-500 hover:text-gold [&::-webkit-details-marker]:hidden">
                  Editar meta de hoje <span className="transition group-open:rotate-180">▾</span>
                </summary>
                <form action={atualizarCompromisso} className="mt-3 grid grid-cols-3 gap-4">
                  <div>
                    <label className="mb-1 block text-xs text-stone-400">Entrevistas</label>
                    <input
                      name="entrevistas_comp"
                      type="number"
                      min={0}
                      defaultValue={hojeRow.entrevistas_comp}
                      className="input-imp"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-stone-400">Assinaturas</label>
                    <input
                      name="assinaturas_comp"
                      type="number"
                      min={0}
                      defaultValue={hojeRow.assinaturas_comp}
                      className="input-imp"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-stone-400">Pagos</label>
                    <input name="pagos_comp" type="number" min={0} defaultValue={hojeRow.pagos_comp} className="input-imp" />
                  </div>
                  <button type="submit" className="btn-outline col-span-3 py-2 text-xs">
                    Salvar
                  </button>
                </form>
              </details>
            )}
          </div>
        )}
      </Card>

      {profile?.role === "sdr" && feedbacks.length > 0 && (
        <Card title="Feedback do seu Closer">
          <ul className="space-y-3">
            {feedbacks.map((f) => (
              <li key={f.id} className="border-b border-imperium-line pb-2 text-sm last:border-0">
                <p className="text-stone-300">{f.texto}</p>
                <p className="mt-1 text-[10px] text-stone-600">
                  {new Date(f.created_at).toLocaleDateString("pt-BR")}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card
        title="Histórico do mês"
        right={
          pctCumprido !== null && (
            <span className="text-sm text-gold">{pctCumprido}% cumprido</span>
          )
        }
      >
        {historico && historico.length > 0 ? (
          <ul className="space-y-3">
            {historico.map((row) => {
              const s = statusLabel(row, false);
              return (
                <li key={row.data} className="border-b border-imperium-line pb-3 text-sm last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-stone-300">
                      {new Date(row.data + "T00:00:00").toLocaleDateString("pt-BR", {
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                    <span className={s.cor}>{s.texto}</span>
                  </div>
                  {row.lancado && !row.falta && (
                    <div className="mt-1.5 flex gap-4 text-xs text-stone-500">
                      <span>
                        Entrevistas{" "}
                        <span className={row.entrevistas_real >= row.entrevistas_comp ? "text-success-bright" : "text-stone-400"}>
                          {row.entrevistas_real}/{row.entrevistas_comp}
                        </span>
                      </span>
                      <span>
                        Assinaturas{" "}
                        <span className={row.assinaturas_real >= row.assinaturas_comp ? "text-success-bright" : "text-stone-400"}>
                          {row.assinaturas_real}/{row.assinaturas_comp}
                        </span>
                      </span>
                      <span>
                        Pagos{" "}
                        <span className={row.pagos_real >= row.pagos_comp ? "text-success-bright" : "text-stone-400"}>
                          {row.pagos_real}/{row.pagos_comp}
                        </span>
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">Nenhum registro anterior neste mês.</p>
        )}
      </Card>
    </main>
  );
}
