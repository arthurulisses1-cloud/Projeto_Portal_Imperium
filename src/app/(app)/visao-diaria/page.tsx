import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buscarVisaoDiaria, funilVazio, type FunilContagem } from "@/lib/visao-diaria";
import {
  buscarMetaFirma,
  buscarProducaoPagaFirma,
  buscarMetaExercito,
  buscarProducaoPagaExercito,
  buscarMetaTribo,
  buscarProducaoPagaTribo,
  buscarMetaComTaxas,
  calcularFunilMeta,
} from "@/lib/metas";
import { buscarCrestsTribos } from "@/lib/guerra";
import { EXERCITO_CREST } from "@/lib/exercito-crests";
import { FUNNEL_STAGES, FUNNEL_LABELS, type FunilEtapa } from "@/lib/funil";
import { hojeBR, paraDataUTC, ultimoDiaUtilAntes } from "@/lib/data-br";
import Card from "@/components/ui/Card";
import BarraMeta from "@/components/ui/BarraMeta";

type Periodo = "hoje" | "semana" | "mes";

const ETAPA_ICONE: Record<FunilEtapa, string> = {
  tentativas: "📞",
  alos: "☎️",
  conexoes: "🔗",
  entrevistas: "🎤",
  assinaturas: "✍️",
  pagos: "💰",
};

function somarDia(dia: string) {
  const d = paraDataUTC(dia);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Status de ritmo (verde/amarelo/vermelho) pra bater o olho sem ler número —
// mesma lógica de "onde deveria estar" do BarraMeta, resumida num chip.
function ChipStatus({ realizado, meta, periodo }: { realizado: number; meta: number; periodo: "mes" | "semana" }) {
  if (meta <= 0) return null;
  const hoje = paraDataUTC(hojeBR());
  const diaDoPeriodo = periodo === "semana" ? ((hoje.getUTCDay() + 6) % 7) + 1 : hoje.getUTCDate();
  const diasNoPeriodo =
    periodo === "semana" ? 7 : new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0)).getUTCDate();
  const esperado = meta * (diaDoPeriodo / diasNoPeriodo);
  const diffPct = esperado > 0 ? ((realizado - esperado) / esperado) * 100 : 0;
  const [cor, texto] =
    diffPct >= 0 ? ["bg-success/20 text-success-bright", "No ritmo"] : diffPct >= -15 ? ["bg-gold/20 text-gold", "Atenção"] : ["bg-wine/20 text-wine-bright", "Atrás"];
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${cor}`}>{texto}</span>;
}

// Card de crédito (realizado/meta/onde deveria estar) — reaproveita o
// BarraMeta que já existe no Mural. `dupla` empilha Mês + Semana (só no
// modo Semana, pra nunca perder de vista a meta do mês).
function CardCredito({
  titulo,
  mes,
  semana,
}: {
  titulo: string;
  mes: { realizado: number; meta: number } | null;
  semana: { realizado: number; meta: number } | null;
}) {
  if ((!mes || mes.meta <= 0) && (!semana || semana.meta <= 0)) return null;
  return (
    <div className="mb-4 space-y-4 rounded-lg border border-imperium-line bg-imperium-bg/40 p-4">
      {mes && mes.meta > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="kicker">{titulo} · Crédito do mês</p>
            <ChipStatus realizado={mes.realizado} meta={mes.meta} periodo="mes" />
          </div>
          <BarraMeta realizado={mes.realizado} meta={mes.meta} periodo="mes" />
        </div>
      )}
      {semana && semana.meta > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <p className="kicker">{titulo} · Crédito da semana</p>
            <ChipStatus realizado={semana.realizado} meta={semana.meta} periodo="semana" />
          </div>
          <BarraMeta realizado={semana.realizado} meta={semana.meta} periodo="semana" />
        </div>
      )}
    </div>
  );
}

// Pipeline visual do funil — 6 cards lado a lado. Hoje: compara Ontem→Hoje
// com seta. Semana/Mês: barrinha de progresso contra a meta daquela etapa
// (derivada de calcularFunilMeta), pra bater o olho e ver qual etapa tá
// travando o funil, não só o crédito final.
function PipelineFunil({
  periodo,
  atual,
  ontem,
  metaEtapas,
}: {
  periodo: Periodo;
  atual: FunilContagem;
  ontem?: FunilContagem;
  metaEtapas?: Record<FunilEtapa, number | null>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {FUNNEL_STAGES.map((etapa) => {
        const valor = atual[etapa];
        const valorOntem = ontem?.[etapa] ?? 0;
        const delta = valor - valorOntem;
        const meta = metaEtapas?.[etapa] ?? null;
        const pct = meta && meta > 0 ? Math.min(100, (valor / meta) * 100) : null;
        return (
          <div key={etapa} className="rounded-lg border border-imperium-line bg-imperium-bg/40 p-2.5 text-center">
            <p className="text-lg leading-none">{ETAPA_ICONE[etapa]}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-stone-500">{FUNNEL_LABELS[etapa]}</p>
            <p className="font-display text-xl text-gold-bright">{valor}</p>
            {periodo === "hoje" ? (
              <p className="flex items-center justify-center gap-1 text-[11px] text-stone-500">
                Ontem: <span className="text-stone-300">{valorOntem}</span>
                <span className={delta > 0 ? "text-success-bright" : delta < 0 ? "text-wine-bright" : "text-stone-600"}>
                  {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"}
                </span>
              </p>
            ) : pct !== null ? (
              <>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-imperium-line">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-1 text-[10px] text-stone-600">de {Math.round(meta!)}</p>
              </>
            ) : (
              <p className="text-[11px] text-stone-700">—</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Crest({ url, nome, corFallback }: { url?: string; nome: string; corFallback: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={nome} className="h-11 w-11 shrink-0 rounded-full border border-imperium-line-strong object-cover" />;
  }
  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-imperium-line-strong font-display text-sm"
      style={{ color: corFallback, background: `${corFallback}22` }}
    >
      {nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
    </div>
  );
}

export default async function VisaoDiariaPage({ searchParams }: { searchParams: { periodo?: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "diretor" && profile?.role !== "lider") redirect("/");

  const periodo: Periodo = (["hoje", "semana", "mes"] as const).includes(searchParams.periodo as Periodo)
    ? (searchParams.periodo as Periodo)
    : "hoje";

  const hoje = hojeBR();
  const hojeFimExclusivo = somarDia(hoje);
  const [anoAtual, mesAtual] = hoje.split("-").map(Number);
  const diasNoMes = new Date(Date.UTC(anoAtual, mesAtual, 0)).getUTCDate();
  const inicioMes = hoje.slice(0, 7) + "-01";
  const inicioSemana = (() => {
    const seg = paraDataUTC(hoje);
    seg.setUTCDate(seg.getUTCDate() - ((seg.getUTCDay() + 6) % 7));
    return seg.toISOString().slice(0, 10);
  })();
  const fatorSemana = 7 / diasNoMes;

  let meuExercitoId: string | null = null;
  if (profile.role === "lider") {
    const { data: meuExercito } = await supabase.from("exercitos").select("id").eq("legado_id", user.id).maybeSingle();
    meuExercitoId = meuExercito?.id ?? null;
  }

  // ---------- funil (produção) ----------
  let visaoOntem: Awaited<ReturnType<typeof buscarVisaoDiaria>> | null = null;
  let visaoHoje: Awaited<ReturnType<typeof buscarVisaoDiaria>> | null = null;
  let visaoSemana: Awaited<ReturnType<typeof buscarVisaoDiaria>> | null = null;
  let visaoMes: Awaited<ReturnType<typeof buscarVisaoDiaria>> | null = null;

  if (periodo === "hoje") {
    const ontemStr = ultimoDiaUtilAntes(paraDataUTC(hoje)).toISOString().slice(0, 10);
    [visaoOntem, visaoHoje] = await Promise.all([
      buscarVisaoDiaria(supabase, ontemStr, somarDia(ontemStr)),
      buscarVisaoDiaria(supabase, hoje, hojeFimExclusivo),
    ]);
  } else if (periodo === "semana") {
    visaoSemana = await buscarVisaoDiaria(supabase, inicioSemana, hojeFimExclusivo);
  } else {
    visaoMes = await buscarVisaoDiaria(supabase, inicioMes, hojeFimExclusivo);
  }
  const visaoAtual = (visaoHoje ?? visaoSemana ?? visaoMes)!;

  // ---------- crédito: SEMPRE mostra o mês (pedido explícito do Diretor), e
  // no modo Semana mostra também a semana, empilhada ----------
  const exercitosBase = visaoAtual.exercitos.filter((e) => !meuExercitoId || e.id === meuExercitoId);
  const tribosBase = exercitosBase.flatMap((e) => e.tribos);

  const { metaTicketMedio: ticketMedioFirma, taxas: taxasFirma } = await buscarMetaComTaxas(supabase, null);

  const [
    metaMensalFirma,
    realizadoMesFirma,
    realizadoSemanaFirma,
    metasExercitos,
    realizadosMesExercitos,
    realizadosSemanaExercitos,
    metasTribos,
    realizadosMesTribos,
    realizadosSemanaTribos,
    crestsTribos,
  ] = await Promise.all([
    profile.role === "diretor" ? buscarMetaFirma(supabase) : Promise.resolve(0),
    profile.role === "diretor" ? buscarProducaoPagaFirma(supabase, inicioMes, hojeFimExclusivo) : Promise.resolve(0),
    profile.role === "diretor" && periodo === "semana" ? buscarProducaoPagaFirma(supabase, inicioSemana, hojeFimExclusivo) : Promise.resolve(0),
    Promise.all(exercitosBase.map((e) => buscarMetaExercito(supabase, e.id))),
    Promise.all(exercitosBase.map((e) => buscarProducaoPagaExercito(supabase, e.id, inicioMes, hojeFimExclusivo))),
    periodo === "semana"
      ? Promise.all(exercitosBase.map((e) => buscarProducaoPagaExercito(supabase, e.id, inicioSemana, hojeFimExclusivo)))
      : Promise.resolve(exercitosBase.map(() => 0)),
    Promise.all(tribosBase.map((t) => buscarMetaTribo(supabase, t.id))),
    Promise.all(tribosBase.map((t) => buscarProducaoPagaTribo(supabase, t.id, inicioMes, hojeFimExclusivo))),
    periodo === "semana"
      ? Promise.all(tribosBase.map((t) => buscarProducaoPagaTribo(supabase, t.id, inicioSemana, hojeFimExclusivo)))
      : Promise.resolve(tribosBase.map(() => 0)),
    buscarCrestsTribos(supabase),
  ]);

  const metaCreditoPorExercito = new Map(exercitosBase.map((e, i) => [e.id, metasExercitos[i]]));
  const realizadoMesPorExercito = new Map(exercitosBase.map((e, i) => [e.id, realizadosMesExercitos[i]]));
  const realizadoSemanaPorExercito = new Map(exercitosBase.map((e, i) => [e.id, realizadosSemanaExercitos[i]]));
  const metaCreditoPorTribo = new Map(tribosBase.map((t, i) => [t.id, metasTribos[i].metaCreditoTribo]));
  const realizadoMesPorTribo = new Map(tribosBase.map((t, i) => [t.id, realizadosMesTribos[i]]));
  const realizadoSemanaPorTribo = new Map(tribosBase.map((t, i) => [t.id, realizadosSemanaTribos[i]]));

  function metaEtapasDe(metaCredito: number): Record<FunilEtapa, number | null> {
    if (periodo === "hoje" || metaCredito <= 0) return Object.fromEntries(FUNNEL_STAGES.map((e) => [e, null])) as Record<FunilEtapa, number | null>;
    const metaAjustada = periodo === "semana" ? metaCredito * fatorSemana : metaCredito;
    return calcularFunilMeta(metaAjustada, ticketMedioFirma, taxasFirma);
  }

  const TITULO_PERIODO = { hoje: "Hoje", semana: "Semana", mes: "Mês" } as const;

  function funilDe(exercitoId?: string, triboId?: string, pessoaId?: string): FunilContagem {
    const base = visaoAtual;
    if (exercitoId) {
      const ex = base.exercitos.find((e) => e.id === exercitoId);
      if (!triboId) return ex?.funil ?? funilVazio();
      const tr = ex?.tribos.find((t) => t.id === triboId);
      if (!pessoaId) return tr?.funil ?? funilVazio();
      return tr?.pessoas.find((p) => p.id === pessoaId)?.funil ?? funilVazio();
    }
    return base.funil;
  }
  function ontemDe(exercitoId?: string, triboId?: string, pessoaId?: string): FunilContagem | undefined {
    if (!visaoOntem) return undefined;
    if (!exercitoId) return visaoOntem.funil;
    const ex = visaoOntem.exercitos.find((e) => e.id === exercitoId);
    if (!triboId) return ex?.funil;
    const tr = ex?.tribos.find((t) => t.id === triboId);
    if (!pessoaId) return tr?.funil;
    return tr?.pessoas.find((p) => p.id === pessoaId)?.funil;
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Visão Diária</h1>
          <p className="kicker mt-1">Produção do funil, do geral até a pessoa.</p>
        </div>
        <div className="flex gap-2">
          {(["hoje", "semana", "mes"] as const).map((p) => (
            <a
              key={p}
              href={`/visao-diaria?periodo=${p}`}
              className={p === periodo ? "btn-gold px-3 py-1.5 text-xs" : "btn-outline px-3 py-1.5 text-xs"}
            >
              {TITULO_PERIODO[p]}
            </a>
          ))}
        </div>
      </div>

      {/* ---------- Geral ---------- */}
      <Card>
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold/50 bg-gold/10 text-xl">
            🏛️
          </div>
          <div>
            <h2 className="font-display text-lg text-gold-bright">{profile.role === "diretor" ? "Império — Geral" : "Meu Exército"}</h2>
            <p className="text-[11px] text-stone-500">{TITULO_PERIODO[periodo]}</p>
          </div>
        </div>
        {profile.role === "diretor" && (
          <CardCredito
            titulo="Império"
            mes={{ realizado: realizadoMesFirma, meta: metaMensalFirma }}
            semana={periodo === "semana" ? { realizado: realizadoSemanaFirma, meta: metaMensalFirma * fatorSemana } : null}
          />
        )}
        {profile.role === "diretor" && (
          <PipelineFunil
            periodo={periodo}
            atual={funilDe()}
            ontem={ontemDe()}
            metaEtapas={metaEtapasDe(metaMensalFirma)}
          />
        )}
      </Card>

      {/* ---------- por Exército ---------- */}
      {exercitosBase.map((exercito) => {
        const metaMes = metaCreditoPorExercito.get(exercito.id) ?? 0;
        const realMes = realizadoMesPorExercito.get(exercito.id) ?? 0;
        const realSemana = realizadoSemanaPorExercito.get(exercito.id) ?? 0;
        return (
          <Card key={exercito.id}>
            <div className="mb-3 flex items-center gap-3">
              <Crest url={EXERCITO_CREST[exercito.nome]} nome={exercito.nome} corFallback="#C9A24A" />
              <div className="flex-1">
                <h2 className="font-display text-lg text-gold-bright">{exercito.nome}</h2>
                <p className="text-[11px] text-stone-500">
                  {exercito.tribos.length} Tribo{exercito.tribos.length === 1 ? "" : "s"}
                </p>
              </div>
              {metaMes > 0 && <ChipStatus realizado={realMes} meta={metaMes} periodo="mes" />}
            </div>

            <CardCredito
              titulo={exercito.nome}
              mes={{ realizado: realMes, meta: metaMes }}
              semana={periodo === "semana" ? { realizado: realSemana, meta: metaMes * fatorSemana } : null}
            />
            <PipelineFunil
              periodo={periodo}
              atual={funilDe(exercito.id)}
              ontem={ontemDe(exercito.id)}
              metaEtapas={metaEtapasDe(metaMes)}
            />

            {/* ---------- por Tribo ---------- */}
            {/* Sempre em coluna única (não grid de 2) — expandido, o card
                precisa da largura toda pra caber o pipeline de 6 etapas e
                a lista "por pessoa" sem espremer (achado 2026-09-09). */}
            <div className="mt-4 space-y-3">
              {exercito.tribos.map((tribo) => {
                const metaMesT = metaCreditoPorTribo.get(tribo.id) ?? 0;
                const realMesT = realizadoMesPorTribo.get(tribo.id) ?? 0;
                const realSemanaT = realizadoSemanaPorTribo.get(tribo.id) ?? 0;
                const crestUrl = crestsTribos[`${tribo.nome} (${exercito.nome})`] ?? crestsTribos[tribo.nome];
                return (
                  <details key={tribo.id} className="rounded-lg border border-imperium-line bg-imperium-bg/30 p-3">
                    <summary className="flex cursor-pointer list-none items-center gap-2.5 [&::-webkit-details-marker]:hidden">
                      <Crest url={crestUrl} nome={tribo.nome} corFallback="#8F2834" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-stone-100">{tribo.nome}</p>
                        <p className="text-[11px] text-stone-500">
                          {tribo.pessoas.length} pessoa{tribo.pessoas.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      {metaMesT > 0 && <ChipStatus realizado={realMesT} meta={metaMesT} periodo="mes" />}
                    </summary>

                    <div className="mt-3 space-y-3">
                      <CardCredito
                        titulo={tribo.nome}
                        mes={{ realizado: realMesT, meta: metaMesT }}
                        semana={periodo === "semana" ? { realizado: realSemanaT, meta: metaMesT * fatorSemana } : null}
                      />
                      <PipelineFunil
                        periodo={periodo}
                        atual={funilDe(exercito.id, tribo.id)}
                        ontem={ontemDe(exercito.id, tribo.id)}
                        metaEtapas={metaEtapasDe(metaMesT)}
                      />

                      <div className="space-y-2 border-t border-imperium-line pt-3">
                        <p className="kicker">Por pessoa</p>
                        {tribo.pessoas.map((pessoa) => (
                          <div key={pessoa.id} className="rounded border border-imperium-line/60 bg-imperium-bg/40 p-2">
                            <p className="mb-1.5 flex items-center gap-2 text-xs text-stone-200">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-imperium-line-strong text-[10px] text-stone-400">
                                {pessoa.nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                              </span>
                              {pessoa.nome}
                            </p>
                            <PipelineFunil
                              periodo={periodo}
                              atual={funilDe(exercito.id, tribo.id, pessoa.id)}
                              ontem={ontemDe(exercito.id, tribo.id, pessoa.id)}
                            />
                          </div>
                        ))}
                        {tribo.pessoas.length === 0 && <p className="text-xs text-stone-600">Sem membros nessa Tribo.</p>}
                      </div>
                    </div>
                  </details>
                );
              })}
              {exercito.tribos.length === 0 && <p className="text-xs text-stone-600">Sem Tribos nesse Exército.</p>}
            </div>
          </Card>
        );
      })}
    </main>
  );
}
