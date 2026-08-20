import { createClient } from "@/lib/supabase/server";
import { RANK_LABELS } from "@/lib/labels";
import {
  RANK_ORDER,
  NEXT_RANK,
  NEXT_TRANSICAO,
  BLOCO_LABELS,
  RANK_SUBTITLE,
  STAR_PACE,
  avaliarCriterioAutomatico,
  buscarContextoAvaliacaoCriterios,
  type Rank,
  type CriterioPromocao,
} from "@/lib/carreira";
import { registrarMetaPessoal, escolherLivro, marcarApresentado, solicitarEvidencia, solicitarPromocao } from "./actions";
import Card from "@/components/ui/Card";
import RankBadge from "@/components/ui/RankBadge";
import Laurel from "@/components/ui/Laurel";
import { getViewerContext } from "@/lib/preview";
import { IconLaurel, IconBell } from "@/components/ui/icons";
import { Badge } from "@/components/ui/Badge";

export default async function CarreiraPage() {
  const supabase = await createClient();
  const viewer = await getViewerContext(supabase);
  if (!viewer) return null;
  const meId = viewer.effectiveId;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, rank, stars_total")
    .eq("id", meId)
    .single();

  if (!profile) return null;

  const rankAtual = profile.rank as Rank;
  const proximoRank = NEXT_RANK[rankAtual];
  const transicao = NEXT_TRANSICAO[rankAtual];

  const { data: criterios } = transicao
    ? await supabase
        .from("promotion_criteria")
        .select("id, bloco, texto, tipo, target_value, dias_strikes, ordem")
        .eq("transicao", transicao)
        .order("bloco")
        .order("ordem")
    : { data: [] as CriterioPromocao[] };

  const { count: strikesRecentesTotal } = await supabase
    .from("strikes")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", meId);

  const { data: metas } = await supabase
    .from("metas_pessoais")
    .select("id, nivel_alvo, data_alvo, created_at")
    .eq("profile_id", meId)
    .order("created_at", { ascending: false })
    .limit(1);

  const metaAtual = metas?.[0];

  const { data: pdi } = await supabase
    .from("pdi_registros")
    .select("id, observacao, plano_acao, proxima_revisao, created_at")
    .eq("profile_id", meId)
    .order("created_at", { ascending: false });

  const { data: livros } = proximoRank
    ? await supabase
        .from("biblioteca_livros")
        .select("id, titulo, autor, ordem")
        .eq("nivel", proximoRank)
        .order("ordem")
    : { data: [] };

  const livroIds = (livros ?? []).map((l) => l.id);
  const { data: escolhas } =
    livroIds.length > 0
      ? await supabase
          .from("biblioteca_escolhas")
          .select("id, livro_id, apresentado")
          .eq("profile_id", meId)
          .in("livro_id", livroIds)
      : { data: [] };
  const escolha = escolhas?.[0];
  const livroEscolhido = livros?.find((l) => l.id === escolha?.livro_id);

  // ---------- Dados pra avaliação automática dos critérios ----------
  const hoje = new Date();
  const ctxAvaliacao = await buscarContextoAvaliacaoCriterios(
    supabase,
    meId,
    profile.stars_total,
    escolha ? !!escolha.apresentado : null
  );

  // ---------- Solicitações de evidência (critérios sem dado automático) ----------
  const criterioIds = (criterios ?? []).map((c) => c.id);
  const { data: evidenciasRows } =
    criterioIds.length > 0
      ? await supabase
          .from("promotion_evidence")
          .select("id, criterio_id, status, valor_atual, evidencia_url, created_at")
          .eq("profile_id", meId)
          .in("criterio_id", criterioIds)
          .order("created_at", { ascending: false })
      : { data: [] };
  // Uma por critério — a mais recente (já vem ordenado desc)
  const evidenciaPorCriterio = new Map<string, { id: string; status: string; valor_atual: string | null; evidencia_url: string | null }>();
  for (const e of evidenciasRows ?? []) {
    if (!evidenciaPorCriterio.has(e.criterio_id)) evidenciaPorCriterio.set(e.criterio_id, e);
  }

  const { data: promoRequestRows } = transicao
    ? await supabase
        .from("promotion_requests")
        .select("id, status, created_at")
        .eq("profile_id", meId)
        .eq("transicao", transicao)
        .order("created_at", { ascending: false })
        .limit(1)
    : { data: [] };
  const promoRequestAtual = promoRequestRows?.[0];

  const paceAtual = STAR_PACE[proximoRank ?? "legionario"];
  const progressoEstrelas =
    paceAtual.estrelas > 0 ? Math.min(100, (profile.stars_total / paceAtual.estrelas) * 100) : 100;

  // ritmo necessário pra meta pessoal
  let ritmo: { semanasRestantes: number; estrelasFaltando: number; vendasPorSemana: number } | null =
    null;
  if (metaAtual && proximoRank) {
    const pace = STAR_PACE[metaAtual.nivel_alvo as Rank];
    const alvo = new Date(metaAtual.data_alvo + "T00:00:00");
    const semanasRestantes = Math.max(
      1,
      Math.ceil((alvo.getTime() - hoje.getTime()) / (7 * 86400000))
    );
    const estrelasFaltando = Math.max(0, pace.estrelas - profile.stars_total);
    const vendasPorSemana = (estrelasFaltando / semanasRestantes) * pace.cheia;
    ritmo = { semanasRestantes, estrelasFaltando, vendasPorSemana };
  }

  const criteriosPorBloco = new Map<number, CriterioPromocao[]>();
  for (const c of (criterios ?? []) as CriterioPromocao[]) {
    if (!criteriosPorBloco.has(c.bloco)) criteriosPorBloco.set(c.bloco, []);
    criteriosPorBloco.get(c.bloco)!.push(c);
  }

  // ---------- Resumo geral: quantos critérios já estão OK ----------
  const semStrikesGeral = (strikesRecentesTotal ?? 0) === 0;
  let totalCriterios = 0;
  let criteriosOk = 0;
  for (const c of (criterios ?? []) as CriterioPromocao[]) {
    totalCriterios++;
    if (c.tipo === "strikes") {
      if (semStrikesGeral) criteriosOk++;
      continue;
    }
    const auto = avaliarCriterioAutomatico(c, ctxAvaliacao);
    if (auto) {
      if (auto.cumprido) criteriosOk++;
    } else if (evidenciaPorCriterio.get(c.id)?.status === "aprovado") {
      criteriosOk++;
    }
  }
  const pctGeral = totalCriterios > 0 ? Math.round((criteriosOk / totalCriterios) * 100) : 0;
  const prontoPraPromocao = totalCriterios > 0 && criteriosOk === totalCriterios;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Plano de Carreira</h1>
        <p className="kicker mt-1">Cursus Honorum</p>
      </div>

      <Card className="watermark-spqr">
        <div className="mb-6 flex items-start justify-center gap-3 sm:gap-6">
          {RANK_ORDER.map((r, i) => {
            const atual = r === rankAtual;
            const alcancado =
              (rankAtual as string) === "diretor" ||
              RANK_ORDER.indexOf(r) <= RANK_ORDER.indexOf(rankAtual);
            return (
              <div key={r} className="flex items-start">
                {i > 0 && (
                  <div
                    className={`mt-8 h-px w-4 shrink-0 sm:w-8 ${
                      RANK_ORDER.indexOf(r) <= RANK_ORDER.indexOf(rankAtual)
                        ? "bg-gold/60"
                        : "border-t border-dashed border-imperium-line-strong"
                    }`}
                  />
                )}
                <div className="flex flex-col items-center gap-2">
                  <div className={atual ? "rounded-full shadow-[0_0_18px_rgba(201,162,74,0.5)]" : ""}>
                    <RankBadge rank={r} size="lg" active={alcancado} />
                  </div>
                  <p className={`text-xs font-medium ${atual ? "text-gold-bright" : "text-stone-400"}`}>
                    {RANK_LABELS[r]}
                  </p>
                  <p className="text-[10px] text-stone-600">{RANK_SUBTITLE[r]}</p>
                </div>
              </div>
            );
          })}
        </div>
        <Laurel className="mx-auto mb-4 h-3 w-28 text-gold/40" />
        <p className="text-center font-serif text-base italic text-stone-400">
          &quot;Esse Quam Videri&quot; — Ser, ao invés de parecer. Nenhuma patente é dada por
          completar checklist; é dada porque a pessoa já opera, na prática, como o
          próximo nível.
        </p>
      </Card>

      {proximoRank && totalCriterios > 0 && (
        <Card className={prontoPraPromocao ? "border-gold" : undefined}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="kicker mb-1">Progresso pra {RANK_LABELS[proximoRank]}</p>
              <p className="font-display text-2xl text-gold-bright">
                {criteriosOk} de {totalCriterios} critérios <span className="text-base text-stone-500">({pctGeral}%)</span>
              </p>
            </div>
            {prontoPraPromocao &&
              (promoRequestAtual && promoRequestAtual.status !== "rejeitado" ? (
                <Badge tone={promoRequestAtual.status === "aprovado" ? "success" : "gold"} variant={promoRequestAtual.status === "aprovado" ? "solid" : "pill"}>
                  {promoRequestAtual.status === "aprovado" ? (
                    <>
                      <IconLaurel className="h-3.5 w-3.5" /> Promoção aprovada
                    </>
                  ) : (
                    "Solicitação enviada, aguardando o Diretor"
                  )}
                </Badge>
              ) : (
                <form action={solicitarPromocao}>
                  <input type="hidden" name="transicao" value={transicao ?? ""} />
                  <button type="submit" className="btn-gold flex items-center gap-1.5">
                    <IconBell className="h-4 w-4" /> Solicitar promoção
                  </button>
                </form>
              ))}
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-imperium-line">
            <div
              className="h-full rounded-full bg-gold"
              style={{ width: `${pctGeral}%` }}
            />
          </div>
        </Card>
      )}

      <Card
        title={
          proximoRank ? `Requisitos para ${RANK_LABELS[proximoRank]}` : "Topo do Cursus Honorum"
        }
      >
        <div className="mb-5">
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-stone-400">
              {profile.stars_total} de {paceAtual.estrelas || "—"} estrelas —{" "}
              <a href="/estrelas" className="text-gold hover:underline">
                ver semana a semana
              </a>
            </span>
            <span className="text-gold">{progressoEstrelas.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-imperium-line">
            <div
              className="h-full rounded-full bg-gold"
              style={{ width: `${progressoEstrelas}%` }}
            />
          </div>
        </div>
        {Array.from(criteriosPorBloco.entries()).map(([bloco, itens]) => (
          <div key={bloco} className="mb-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gold">
              Bloco {bloco} — {BLOCO_LABELS[bloco]}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {itens!.map((item) => {
                const auto = avaliarCriterioAutomatico(item, ctxAvaliacao);
                const semStrikes = (strikesRecentesTotal ?? 0) === 0;
                const evidencia = evidenciaPorCriterio.get(item.id);

                const cumprido = item.tipo === "strikes" ? semStrikes : auto?.cumprido ?? evidencia?.status === "aprovado";

                return (
                  <div
                    key={item.id}
                    className={`rounded border p-3 ${
                      cumprido ? "border-success/30 bg-success/5" : "border-imperium-line bg-imperium-bg/40"
                    }`}
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <p className="text-sm text-stone-300">{item.texto}</p>
                      <span
                        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                          cumprido ? "bg-success-bright" : evidencia?.status === "pendente" ? "bg-gold" : "bg-stone-600"
                        }`}
                      />
                    </div>

                    {item.tipo === "strikes" && (
                      <p className={`text-xs ${semStrikes ? "text-success-bright" : "text-wine-bright"}`}>
                        {strikesRecentesTotal ?? 0} strike(s) nos últimos {item.dias_strikes} dias
                      </p>
                    )}

                    {item.tipo !== "strikes" && auto && (
                      <div>
                        {auto.meta !== null && auto.atual !== null && (
                          <div className="mb-1 h-1 overflow-hidden rounded-full bg-imperium-line">
                            <div
                              className={`h-full rounded-full ${auto.cumprido ? "bg-success-bright" : "bg-gold"}`}
                              style={{ width: `${Math.min(100, (auto.atual / auto.meta) * 100)}%` }}
                            />
                          </div>
                        )}
                        <p className={`text-[11px] ${auto.cumprido ? "text-success-bright" : "text-stone-500"}`}>
                          {auto.detalhe}
                        </p>
                      </div>
                    )}

                    {item.tipo !== "strikes" && !auto && (
                      <div>
                        {evidencia ? (
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-[11px] uppercase ${
                                evidencia.status === "aprovado"
                                  ? "text-success-bright"
                                  : evidencia.status === "rejeitado"
                                    ? "text-wine-bright"
                                    : "text-gold"
                              }`}
                            >
                              {evidencia.status === "aprovado"
                                ? "Aprovado pelo Diretor"
                                : evidencia.status === "rejeitado"
                                  ? "Rejeitado — pode reenviar"
                                  : "Enviado, aguardando aprovação"}
                            </span>
                            {evidencia.status === "rejeitado" && (
                              <details className="text-[11px]">
                                <summary className="cursor-pointer text-stone-400 hover:text-gold-bright">
                                  Reenviar
                                </summary>
                                <form action={solicitarEvidencia} className="mt-2 space-y-1.5">
                                  <input type="hidden" name="criterio_id" value={item.id} />
                                  <input
                                    name="valor_atual"
                                    placeholder="Ex: 5M na live de 15/08"
                                    className="input-imp px-2 py-1 text-xs"
                                  />
                                  <input
                                    name="evidencia_url"
                                    placeholder="Link da evidência (opcional)"
                                    className="input-imp px-2 py-1 text-xs"
                                  />
                                  <button type="submit" className="btn-outline px-2 py-1 text-[11px]">
                                    Enviar de novo
                                  </button>
                                </form>
                              </details>
                            )}
                          </div>
                        ) : (
                          <details className="text-[11px]">
                            <summary className="cursor-pointer text-stone-500 hover:text-gold-bright">
                              Solicitar aprovação
                            </summary>
                            <form action={solicitarEvidencia} className="mt-2 space-y-1.5">
                              <input type="hidden" name="criterio_id" value={item.id} />
                              <input
                                name="valor_atual"
                                placeholder="Ex: 5M na live de 15/08"
                                className="input-imp px-2 py-1 text-xs"
                              />
                              <input
                                name="evidencia_url"
                                placeholder="Link da evidência (opcional)"
                                className="input-imp px-2 py-1 text-xs"
                              />
                              <button type="submit" className="btn-outline px-2 py-1 text-[11px]">
                                Enviar pro Diretor
                              </button>
                            </form>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </Card>

      {proximoRank && (
        <Card title="Meta pessoal de médio prazo">
          {metaAtual ? (
            <div className="text-sm text-stone-300">
              <p>
                Alvo: <span className="text-gold">{RANK_LABELS[metaAtual.nivel_alvo]}</span> até{" "}
                {new Date(metaAtual.data_alvo + "T00:00:00").toLocaleDateString("pt-BR")}
              </p>
              {ritmo && (
                <p className="mt-2 text-stone-400">
                  Faltam {ritmo.estrelasFaltando} estrelas em ~{ritmo.semanasRestantes} semanas —
                  ritmo estimado de{" "}
                  <span className="text-gold">{ritmo.vendasPorSemana.toFixed(1)} vendas/semana</span>.
                </p>
              )}
            </div>
          ) : (
            <form action={registrarMetaPessoal} className="flex flex-wrap items-end gap-4">
              <div>
                <label className="mb-1 block text-xs text-stone-400">Nível alvo</label>
                <select
                  name="nivel_alvo"
                  defaultValue={proximoRank}
                  className="input-imp"
                >
                  {RANK_ORDER.filter((r) => RANK_ORDER.indexOf(r) > RANK_ORDER.indexOf(rankAtual)).map(
                    (r) => (
                      <option key={r} value={r}>
                        {RANK_LABELS[r]}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-stone-400">Data alvo</label>
                <input type="date" name="data_alvo" required className="input-imp" />
              </div>
              <button type="submit" className="btn-gold">
                Definir meta
              </button>
            </form>
          )}
        </Card>
      )}

      {proximoRank && (
        <Card title={`Biblioteca — rumo a ${RANK_LABELS[proximoRank]}`}>
          {livroEscolhido ? (
            <div className="text-sm">
              <p className="text-stone-100">
                {livroEscolhido.titulo} — <span className="text-stone-400">{livroEscolhido.autor}</span>
              </p>
              {escolha?.apresentado ? (
                <p className="mt-2 text-success-bright">Apresentação pública concluída</p>
              ) : (
                <form action={marcarApresentado} className="mt-2">
                  <input type="hidden" name="escolha_id" value={escolha!.id} />
                  <button type="submit" className="btn-outline">
                    Marcar apresentação como feita
                  </button>
                </form>
              )}
            </div>
          ) : (
            <form action={escolherLivro} className="space-y-3">
              {(livros ?? []).map((livro) => (
                <label key={livro.id} className="flex items-center gap-2 text-sm text-stone-300">
                  <input type="radio" name="livro_id" value={livro.id} required />
                  {livro.titulo} — <span className="text-stone-500">{livro.autor}</span>
                </label>
              ))}
              <button type="submit" className="btn-gold">
                Escolher livro
              </button>
            </form>
          )}
        </Card>
      )}

      <Card title="Feedback / PDI">
        {pdi && pdi.length > 0 ? (
          <ul className="space-y-3">
            {pdi.map((p) => (
              <li key={p.id} className="border-b border-imperium-line pb-3 last:border-0">
                <p className="text-sm text-stone-100">{p.observacao}</p>
                {p.plano_acao && <p className="text-xs text-stone-400">{p.plano_acao}</p>}
                {p.proxima_revisao && (
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-stone-600">
                    Próxima revisão:{" "}
                    {new Date(p.proxima_revisao + "T00:00:00").toLocaleDateString("pt-BR")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">Nenhum registro do seu líder ainda.</p>
        )}
      </Card>
    </main>
  );
}
