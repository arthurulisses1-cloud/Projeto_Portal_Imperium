import { createClient } from "@/lib/supabase/server";
import { FUNNEL_STAGES, FUNNEL_LABELS } from "@/lib/funil";
import {
  buscarComprometimentoHoje,
  buscarPagosMes,
  buscarFunilColetivo,
  STATUS_COR,
  STATUS_LABEL,
} from "@/lib/time";
import MembroCard from "@/components/MembroCard";
import Card from "@/components/ui/Card";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default async function ExercitoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: exercito } = await supabase
    .from("exercitos")
    .select("id, nome")
    .eq("legado_id", user.id)
    .maybeSingle();

  if (!exercito) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-display text-2xl text-gold-bright">Meu Exército</h1>
        <p className="mt-4 text-sm text-stone-500">
          Seu usuário ainda não está vinculado como Legado de nenhum Exército. Peça
          pro Diretor configurar isso na tabela <code>exercitos</code>.
        </p>
      </main>
    );
  }

  const { data: tribos } = await supabase
    .from("tribos")
    .select("id, nome, closer:profiles!tribos_closer_id_fkey(id, full_name)")
    .eq("exercito_id", exercito.id);

  const triboIds = (tribos ?? []).map((t) => t.id);
  const { data: sdrs } = triboIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, tribo_id")
        .in("tribo_id", triboIds)
    : { data: [] };

  const todosIds = [
    ...(tribos ?? [])
      .map((t) => (t.closer as unknown as { id: string; full_name: string } | null)?.id)
      .filter((id): id is string => !!id),
    ...(sdrs ?? []).map((s) => s.id),
  ];

  const [compromissoMap, pagosMap, funilColetivo] = await Promise.all([
    buscarComprometimentoHoje(supabase, todosIds),
    buscarPagosMes(supabase, todosIds),
    buscarFunilColetivo(supabase, todosIds),
  ]);

  // ---------- Meta esperada por Tribo (pra pace/risco) ----------
  const agora = new Date();
  const { data: metaMes } = await supabase
    .from("metas_mensais")
    .select("id, meta_credito_total")
    .eq("ano", agora.getFullYear())
    .eq("mes", agora.getMonth() + 1)
    .maybeSingle();
  const { count: numExercitos } = await supabase.from("exercitos").select("id", { count: "exact", head: true });
  const metaCreditoExercito = numExercitos ? (metaMes?.meta_credito_total ?? 0) / numExercitos : 0;
  const numTribos = tribos?.length ?? 0;
  const metaCreditoPorTribo = numTribos > 0 ? metaCreditoExercito / numTribos : 0;

  const diaDoMes = agora.getDate();
  const diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  const paceEsperado = diasNoMes > 0 ? diaDoMes / diasNoMes : 1;

  // Pago por Tribo (individual, pra comparação lado a lado)
  const pagoPorTribo = new Map<string, number>();
  for (const t of tribos ?? []) {
    const closer = t.closer as unknown as { id: string } | null;
    const membrosTribo = [
      ...(closer ? [closer.id] : []),
      ...(sdrs ?? []).filter((s) => s.tribo_id === t.id).map((s) => s.id),
    ];
    const total = membrosTribo.reduce((s, id) => s + (pagosMap.get(id) ?? 0), 0);
    pagoPorTribo.set(t.id, total);
  }

  // "Quem precisa de atenção" — menor produção no mês entre os liderados
  const nomePorId = new Map<string, string>();
  for (const t of tribos ?? []) {
    const closer = t.closer as unknown as { id: string; full_name: string } | null;
    if (closer) nomePorId.set(closer.id, closer.full_name);
  }
  for (const s of sdrs ?? []) nomePorId.set(s.id, s.full_name);

  const atencao = todosIds
    .map((id) => ({ id, nome: nomePorId.get(id) ?? "—", pago: pagosMap.get(id) ?? 0 }))
    .filter((p) => p.nome !== "—")
    .sort((a, b) => a.pago - b.pago)
    .slice(0, 3);

  // PDI pendentes — última revisão de cada liderado, se proxima_revisao já passou
  const { data: pdiRows } = todosIds.length
    ? await supabase
        .from("pdi_registros")
        .select("profile_id, observacao, proxima_revisao, created_at, membro:profiles!pdi_registros_profile_id_fkey(full_name)")
        .in("profile_id", todosIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const hoje = agora.toISOString().slice(0, 10);
  type PdiRow = NonNullable<typeof pdiRows>[number];
  const ultimoPdiPorMembro = new Map<string, PdiRow>();
  for (const row of pdiRows ?? []) {
    if (!ultimoPdiPorMembro.has(row.profile_id)) ultimoPdiPorMembro.set(row.profile_id, row);
  }
  const pdiPendentes = Array.from(ultimoPdiPorMembro.values()).filter(
    (r) => r.proxima_revisao && r.proxima_revisao <= hoje
  );

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Meu Exército</h1>
        <p className="kicker mt-1">{exercito.nome}</p>
      </div>

      {tribos && tribos.length > 0 && (
        <Card title="Comparativo das Tribos">
          <div className="grid gap-3 sm:grid-cols-2">
            {tribos.map((t) => {
              const pago = pagoPorTribo.get(t.id) ?? 0;
              const esperado = metaCreditoPorTribo * paceEsperado;
              const emRisco = metaCreditoPorTribo > 0 && pago < esperado * 0.8;
              const pct = metaCreditoPorTribo > 0 ? (pago / metaCreditoPorTribo) * 100 : null;
              return (
                <div
                  key={t.id}
                  className={`rounded border p-3 ${emRisco ? "border-wine/50 bg-wine/10" : "border-imperium-line"}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-stone-100">{t.nome}</p>
                    {emRisco && <span className="text-[10px] uppercase text-wine-bright">⚠ Em risco</span>}
                  </div>
                  <p className="mt-1 text-gold">{moeda(pago)}</p>
                  {pct !== null && <p className="text-xs text-stone-500">{pct.toFixed(0)}% da meta do mês</p>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {atencao.length > 0 && (
        <Card title="Quem precisa de atenção" right={<span className="text-xs text-stone-500">menor produção do mês</span>}>
          <ol className="space-y-1.5">
            {atencao.map((p, i) => (
              <li key={p.id} className="flex justify-between text-sm">
                <span className="text-stone-300">
                  {i + 1}. {p.nome}
                </span>
                <span className="text-wine-bright">{moeda(p.pago)}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {pdiPendentes.length > 0 && (
        <Card title="Revisões de PDI pendentes">
          <ul className="space-y-2">
            {pdiPendentes.map((r) => {
              const membro = r.membro as unknown as { full_name: string } | null;
              return (
                <li key={r.profile_id} className="border-b border-imperium-line pb-2 text-sm last:border-0">
                  <div className="flex justify-between">
                    <span className="text-stone-100">{membro?.full_name ?? "—"}</span>
                    <span className="text-gold">
                      revisão prevista {new Date(r.proxima_revisao + "T00:00:00").toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">{r.observacao}</p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card title="Produção coletiva do mês">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="pb-2">Etapa</th>
              <th className="pb-2 text-right">Realizado</th>
              <th className="pb-2 text-right">Meta</th>
            </tr>
          </thead>
          <tbody>
            {FUNNEL_STAGES.map((etapa) => (
              <tr key={etapa} className="border-t border-imperium-line">
                <td className="py-2 text-stone-300">{FUNNEL_LABELS[etapa]}</td>
                <td className="py-2 text-right text-stone-100">
                  {funilColetivo[etapa].realizado}
                </td>
                <td className="py-2 text-right text-stone-500">{funilColetivo[etapa].meta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {(tribos ?? []).map((tribo) => {
        const closer = tribo.closer as unknown as { id: string; full_name: string } | null;
        const sdrsDaTribo = (sdrs ?? []).filter((s) => s.tribo_id === tribo.id);
        return (
          <Card key={tribo.id} title={tribo.nome}>
            <div className="grid gap-3 sm:grid-cols-2">
              {closer && (
                <MembroCard
                  id={closer.id}
                  nome={closer.full_name}
                  cargo="Closer"
                  compromissoStatus={
                    STATUS_LABEL[compromissoMap.get(closer.id)?.status ?? "não lançado"]
                  }
                  compromissoCor={
                    STATUS_COR[compromissoMap.get(closer.id)?.status ?? "não lançado"]
                  }
                  pagosMes={pagosMap.get(closer.id) ?? 0}
                />
              )}
              {sdrsDaTribo.map((sdr) => (
                <MembroCard
                  key={sdr.id}
                  id={sdr.id}
                  nome={sdr.full_name}
                  cargo="SDR"
                  compromissoStatus={
                    STATUS_LABEL[compromissoMap.get(sdr.id)?.status ?? "não lançado"]
                  }
                  compromissoCor={STATUS_COR[compromissoMap.get(sdr.id)?.status ?? "não lançado"]}
                  pagosMes={pagosMap.get(sdr.id) ?? 0}
                />
              ))}
            </div>
          </Card>
        );
      })}
    </main>
  );
}
