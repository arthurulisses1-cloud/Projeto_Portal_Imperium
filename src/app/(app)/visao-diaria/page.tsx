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
} from "@/lib/metas";
import { FUNNEL_STAGES, FUNNEL_LABELS } from "@/lib/funil";
import { hojeBR, paraDataUTC, ultimoDiaUtilAntes } from "@/lib/data-br";
import Card from "@/components/ui/Card";
import BarraMeta from "@/components/ui/BarraMeta";

type Periodo = "hoje" | "semana" | "mes";

function somarDia(dia: string) {
  const d = paraDataUTC(dia);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Uma linha de números lado a lado (Ontem/Hoje, ou só um período) — reaproveitada
// em todo nível (Firma/Exército/Tribo/Pessoa).
function TabelaFunil({ colunas }: { colunas: { titulo: string; dados: FunilContagem }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-imperium-line text-left text-[11px] uppercase tracking-wide text-stone-500">
            <th className="py-1.5 pr-3">Etapa</th>
            {colunas.map((c) => (
              <th key={c.titulo} className="py-1.5 px-2 text-right">
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FUNNEL_STAGES.map((etapa) => (
            <tr key={etapa} className="border-b border-imperium-line/50 last:border-0">
              <td className="py-1 pr-3 text-stone-400">{FUNNEL_LABELS[etapa]}</td>
              {colunas.map((c) => (
                <td key={c.titulo} className="py-1 px-2 text-right text-stone-100">
                  {c.dados[etapa]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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

  // Escopo: Diretor vê a firma inteira; Líder só o próprio Exército.
  let meuExercitoId: string | null = null;
  if (profile.role === "lider") {
    const { data: meuExercito } = await supabase.from("exercitos").select("id").eq("legado_id", user.id).maybeSingle();
    meuExercitoId = meuExercito?.id ?? null;
  }

  // ---------- dados de funil ----------
  let visaoOntem: Awaited<ReturnType<typeof buscarVisaoDiaria>> | null = null;
  let visaoHoje: Awaited<ReturnType<typeof buscarVisaoDiaria>> | null = null;
  let visaoPeriodo: Awaited<ReturnType<typeof buscarVisaoDiaria>> | null = null;

  if (periodo === "hoje") {
    const ontemStr = ultimoDiaUtilAntes(paraDataUTC(hoje)).toISOString().slice(0, 10);
    [visaoOntem, visaoHoje] = await Promise.all([
      buscarVisaoDiaria(supabase, ontemStr, somarDia(ontemStr)),
      buscarVisaoDiaria(supabase, hoje, hojeFimExclusivo),
    ]);
  } else if (periodo === "semana") {
    const seg = paraDataUTC(hoje);
    seg.setUTCDate(seg.getUTCDate() - ((seg.getUTCDay() + 6) % 7));
    const inicioSemana = seg.toISOString().slice(0, 10);
    visaoPeriodo = await buscarVisaoDiaria(supabase, inicioSemana, hojeFimExclusivo);
  } else {
    const inicioMes = hoje.slice(0, 7) + "-01";
    visaoPeriodo = await buscarVisaoDiaria(supabase, inicioMes, hojeFimExclusivo);
  }

  // ---------- metas de crédito (só semana/mês) ----------
  type MetaEscopo = { meta: number; realizado: number };
  let metaFirma: MetaEscopo | null = null;
  const metaPorExercito = new Map<string, MetaEscopo>();
  const metaPorTribo = new Map<string, MetaEscopo>();

  if (periodo !== "hoje") {
    const [ano, mes] = hoje.split("-").map(Number);
    const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const inicioPeriodo = periodo === "semana" ? (() => {
      const seg = paraDataUTC(hoje);
      seg.setUTCDate(seg.getUTCDate() - ((seg.getUTCDay() + 6) % 7));
      return seg.toISOString().slice(0, 10);
    })() : hoje.slice(0, 7) + "-01";
    const fatorPeriodo = periodo === "semana" ? 7 / diasNoMes : 1;

    const exercitosParaMeta = (visaoPeriodo?.exercitos ?? []).filter((e) => !meuExercitoId || e.id === meuExercitoId);
    const tribosParaMeta = exercitosParaMeta.flatMap((e) => e.tribos);

    const [metaMensalFirma, realizadoFirma, metasExercitos, realizadosExercitos, metasTribos, realizadosTribos] = await Promise.all([
      profile.role === "diretor" ? buscarMetaFirma(supabase) : Promise.resolve(0),
      profile.role === "diretor" ? buscarProducaoPagaFirma(supabase, inicioPeriodo, hojeFimExclusivo) : Promise.resolve(0),
      Promise.all(exercitosParaMeta.map((e) => buscarMetaExercito(supabase, e.id))),
      Promise.all(exercitosParaMeta.map((e) => buscarProducaoPagaExercito(supabase, e.id, inicioPeriodo, hojeFimExclusivo))),
      Promise.all(tribosParaMeta.map((t) => buscarMetaTribo(supabase, t.id))),
      Promise.all(tribosParaMeta.map((t) => buscarProducaoPagaTribo(supabase, t.id, inicioPeriodo, hojeFimExclusivo))),
    ]);

    if (profile.role === "diretor") {
      metaFirma = { meta: metaMensalFirma * fatorPeriodo, realizado: realizadoFirma };
    }
    exercitosParaMeta.forEach((e, i) => {
      metaPorExercito.set(e.id, { meta: metasExercitos[i] * fatorPeriodo, realizado: realizadosExercitos[i] });
    });
    tribosParaMeta.forEach((t, i) => {
      metaPorTribo.set(t.id, { meta: metasTribos[i].metaCreditoTribo * fatorPeriodo, realizado: realizadosTribos[i] });
    });
  }

  const exercitosVisiveis = (
    periodo === "hoje" ? visaoHoje!.exercitos : visaoPeriodo!.exercitos
  ).filter((e) => !meuExercitoId || e.id === meuExercitoId);

  const funilFirma = periodo === "hoje" ? visaoHoje!.funil : visaoPeriodo!.funil;

  const TITULO_PERIODO = { hoje: "Hoje", semana: "Semana", mes: "Mês" } as const;

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

      {/* ---------- Geral (Firma, só Diretor vê) ---------- */}
      {profile.role === "diretor" && (
        <Card title="Produção Geral">
          {metaFirma && metaFirma.meta > 0 && (
            <div className="mb-4 border-b border-imperium-line pb-4">
              <p className="kicker mb-2">{periodo === "semana" ? "Meta da semana" : "Meta do mês"} · Firma</p>
              <BarraMeta realizado={metaFirma.realizado} meta={metaFirma.meta} periodo={periodo === "semana" ? "semana" : "mes"} />
            </div>
          )}
          {periodo === "hoje" ? (
            <TabelaFunil colunas={[{ titulo: "Ontem", dados: visaoOntem!.funil }, { titulo: "Hoje", dados: visaoHoje!.funil }]} />
          ) : (
            <TabelaFunil colunas={[{ titulo: TITULO_PERIODO[periodo], dados: funilFirma }]} />
          )}
        </Card>
      )}

      {/* ---------- por Exército ---------- */}
      {exercitosVisiveis.map((exercito) => {
        const funilOntemExercito = visaoOntem?.exercitos.find((e) => e.id === exercito.id)?.funil ?? funilVazio();
        const meta = metaPorExercito.get(exercito.id);
        return (
          <Card key={exercito.id} title={`Exército · ${exercito.nome}`}>
            {meta && meta.meta > 0 && (
              <div className="mb-4 border-b border-imperium-line pb-4">
                <p className="kicker mb-2">{periodo === "semana" ? "Meta da semana" : "Meta do mês"}</p>
                <BarraMeta realizado={meta.realizado} meta={meta.meta} periodo={periodo === "semana" ? "semana" : "mes"} />
              </div>
            )}
            {periodo === "hoje" ? (
              <TabelaFunil colunas={[{ titulo: "Ontem", dados: funilOntemExercito }, { titulo: "Hoje", dados: exercito.funil }]} />
            ) : (
              <TabelaFunil colunas={[{ titulo: TITULO_PERIODO[periodo], dados: exercito.funil }]} />
            )}

            {/* ---------- por Tribo, expansível ---------- */}
            <div className="mt-4 space-y-2">
              {exercito.tribos.map((tribo) => {
                const funilOntemTribo =
                  visaoOntem?.exercitos.find((e) => e.id === exercito.id)?.tribos.find((t) => t.id === tribo.id)?.funil ??
                  funilVazio();
                const metaT = metaPorTribo.get(tribo.id);
                return (
                  <details key={tribo.id} className="rounded border border-imperium-line bg-imperium-bg/30 p-3">
                    <summary className="cursor-pointer text-sm text-stone-100 [&::-webkit-details-marker]:hidden">
                      <span className="font-display text-gold">▸</span> {tribo.nome}
                      <span className="ml-2 text-[11px] text-stone-500">
                        {tribo.pessoas.length} pessoa{tribo.pessoas.length === 1 ? "" : "s"}
                      </span>
                    </summary>
                    <div className="mt-3 space-y-3">
                      {metaT && metaT.meta > 0 && (
                        <div className="border-b border-imperium-line pb-3">
                          <p className="kicker mb-2">{periodo === "semana" ? "Meta da semana" : "Meta do mês"}</p>
                          <BarraMeta realizado={metaT.realizado} meta={metaT.meta} periodo={periodo === "semana" ? "semana" : "mes"} />
                        </div>
                      )}
                      {periodo === "hoje" ? (
                        <TabelaFunil colunas={[{ titulo: "Ontem", dados: funilOntemTribo }, { titulo: "Hoje", dados: tribo.funil }]} />
                      ) : (
                        <TabelaFunil colunas={[{ titulo: TITULO_PERIODO[periodo], dados: tribo.funil }]} />
                      )}

                      <div className="border-t border-imperium-line pt-3">
                        <p className="kicker mb-2">Por pessoa</p>
                        <div className="space-y-3">
                          {tribo.pessoas.map((pessoa) => {
                            const pessoaOntem =
                              visaoOntem?.exercitos
                                .find((e) => e.id === exercito.id)
                                ?.tribos.find((t) => t.id === tribo.id)
                                ?.pessoas.find((p) => p.id === pessoa.id)?.funil ?? funilVazio();
                            return (
                              <div key={pessoa.id}>
                                <p className="mb-1 text-xs text-stone-300">{pessoa.nome}</p>
                                {periodo === "hoje" ? (
                                  <TabelaFunil
                                    colunas={[
                                      { titulo: "Ontem", dados: pessoaOntem },
                                      { titulo: "Hoje", dados: pessoa.funil },
                                    ]}
                                  />
                                ) : (
                                  <TabelaFunil colunas={[{ titulo: TITULO_PERIODO[periodo], dados: pessoa.funil }]} />
                                )}
                              </div>
                            );
                          })}
                          {tribo.pessoas.length === 0 && <p className="text-xs text-stone-600">Sem membros nessa Tribo.</p>}
                        </div>
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
