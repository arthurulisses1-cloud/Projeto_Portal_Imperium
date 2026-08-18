import { createClient } from "@/lib/supabase/server";
import { registrarCompromisso } from "./actions";
import Card from "@/components/ui/Card";
import { buscarMetaIndividual, calcularFunilMeta } from "@/lib/metas";
import { calcularStreak, cumpriuCompromisso, type StreakRow } from "@/lib/streak";

type CompromissoRow = StreakRow;

function statusLabel(row: CompromissoRow, isHoje: boolean) {
  if (row.falta) return { texto: "Ausente", cor: "text-stone-500" };
  if (cumpriuCompromisso(row)) return { texto: "Cumprido", cor: "text-emerald-400" };
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tribo_id")
    .eq("id", user.id)
    .single();

  const hoje = new Date().toISOString().slice(0, 10);

  const { data: hojeRow } = await supabase
    .from("compromissos")
    .select("*")
    .eq("profile_id", user.id)
    .eq("data", hoje)
    .maybeSingle();

  const primeiroDiaMes = hoje.slice(0, 7) + "-01";
  const { data: historico } = await supabase
    .from("compromissos")
    .select("*")
    .eq("profile_id", user.id)
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
    .eq("profile_id", user.id)
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
    const { metaCreditoIndividual, metaTicketMedio, taxas } = await buscarMetaIndividual(supabase, user.id);
    const metaFunil = calcularFunilMeta(metaCreditoIndividual, metaTicketMedio, taxas);

    const inicioMes = hoje.slice(0, 7) + "-01";
    const { data: realizadoMes } = await supabase
      .from("producao_funil")
      .select("etapa, realizado")
      .eq("profile_id", user.id)
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

  // Feedback do Closer (só pra SDR)
  let feedbacks: { id: string; texto: string; created_at: string }[] = [];
  if (profile?.role === "sdr") {
    const { data } = await supabase
      .from("feedbacks_sdr")
      .select("id, texto, created_at")
      .eq("sdr_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3);
    feedbacks = data ?? [];
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Compromisso</h1>
          <p className="kicker mt-1">Meta e acompanhamento do dia</p>
        </div>
        {streak > 0 && (
          <span className="flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-gold-bright">
            🔥 {streak} {streak === 1 ? "dia seguido" : "dias seguidos"}
          </span>
        )}
      </div>

      <Card title="Hoje">
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
                        <span className={row.entrevistas_real >= row.entrevistas_comp ? "text-emerald-400" : "text-stone-400"}>
                          {row.entrevistas_real}/{row.entrevistas_comp}
                        </span>
                      </span>
                      <span>
                        Assinaturas{" "}
                        <span className={row.assinaturas_real >= row.assinaturas_comp ? "text-emerald-400" : "text-stone-400"}>
                          {row.assinaturas_real}/{row.assinaturas_comp}
                        </span>
                      </span>
                      <span>
                        Pagos{" "}
                        <span className={row.pagos_real >= row.pagos_comp ? "text-emerald-400" : "text-stone-400"}>
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
