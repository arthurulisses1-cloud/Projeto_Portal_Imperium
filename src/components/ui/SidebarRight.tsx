import { createClient } from "@/lib/supabase/server";
import { RANK_LABELS } from "@/lib/labels";
import {
  STAR_PACE,
  avaliarProntidaoPromocao,
  inicioSemanaISO,
  resultadoSemanaEstrela,
  type Rank,
} from "@/lib/carreira";
import { proximoTier } from "@/lib/comissao";
import { buscarRemuneracaoMes } from "@/lib/remuneracao";
import { buscarProgressoMarcos } from "@/lib/marcos";
import { paraRomano } from "@/lib/numerals";
import { EXERCITO_CREST } from "@/lib/exercito-crests";
import RankBadge from "./RankBadge";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function iniciais(nome: string) {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export default async function SidebarRight({ userId }: { userId: string }) {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("rank, stars_total, tribo_id, role")
    .eq("id", userId)
    .single();

  if (!profile) return null;
  const rank = profile.rank as Rank;
  const pace = STAR_PACE[rank] ?? STAR_PACE.legionario;
  const totalEstrelas = pace.estrelas || 6;

  // Mini-indicador da semana atual de Estrelas (SDR/Closer só) — mesmo
  // cálculo de /estrelas, pra dar o "check rápido" sem precisar entrar na aba.
  let semanaEstrelas: { qtd: number } | null = null;
  if ((profile.role === "sdr" || profile.role === "closer") && pace.cheia > 0) {
    const inicioSemanaAtual = inicioSemanaISO(new Date().toISOString().slice(0, 10));
    const { data: vendasSemana } = await supabase
      .from("vendas")
      .select("id")
      .eq("profile_id", userId)
      .in("papel", profile.role === "sdr" ? ["sdr", "ambos"] : ["closer", "ambos"])
      .gte("data", inicioSemanaAtual);
    semanaEstrelas = { qtd: (vendasSemana ?? []).length };
  }

  // Resumo do Plano de Carreira (SDR/Closer só — líder não tem "próximo
  // rank" no mesmo sentido) — mesma avaliação de /carreira, pra nunca dar
  // número diferente entre a lateral e a tela cheia.
  const carreiraResumo = await avaliarProntidaoPromocao(supabase, userId, profile.role, rank, profile.stars_total);

  const { data: quotes } = await supabase.from("sage_quotes").select("texto, fonte").eq("ativo", true);
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const quote = quotes && quotes.length > 0 ? quotes[(dayOfYear + 1) % quotes.length] : null;

  const { marcos } = await buscarProgressoMarcos(supabase, userId);

  const inicioMes = new Date().toISOString().slice(0, 7) + "-01";
  const { tiers: tiersOrdenados, remuneracao, producaoPrincipal, papelPrincipal } = await buscarRemuneracaoMes(
    supabase,
    userId,
    profile.role,
    rank,
    inicioMes
  );
  const tierAtual = remuneracao;
  const proximo = remuneracao ? proximoTier(tiersOrdenados, producaoPrincipal, papelPrincipal) : null;

  // ---------- Minha Tribo (com o Tribuno/Pretor em destaque) + Meu Exército ----------
  type Pessoa = { id: string; nome: string; rank: Rank; avatarUrl: string | null };
  let nomeTribo: string | null = null;
  let logoTribo: string | null = null;
  let closer: Pessoa | null = null;
  let sdrsDaTribo: (Pessoa & { producao: number })[] = [];
  let exercito: { nome: string; legado: Pessoa | null } | null = null;

  if (profile.tribo_id) {
    const { data: tribo } = await supabase
      .from("tribos")
      .select(
        "nome, logo_url, exercito_id, closer:profiles!tribos_closer_id_fkey(id, full_name, rank, avatar_url)"
      )
      .eq("id", profile.tribo_id)
      .single();

    nomeTribo = tribo?.nome ?? null;
    logoTribo = tribo?.logo_url ?? null;
    const closerRow = tribo?.closer as unknown as { id: string; full_name: string; rank: Rank; avatar_url: string | null } | null;
    closer = closerRow
      ? { id: closerRow.id, nome: closerRow.full_name, rank: closerRow.rank, avatarUrl: closerRow.avatar_url }
      : null;

    const { data: membros } = await supabase
      .from("profiles")
      .select("id, full_name, rank, avatar_url")
      .eq("tribo_id", profile.tribo_id)
      .eq("role", "sdr");

    const idsMembros = (membros ?? []).map((m) => m.id);
    const { data: vendasMembros } =
      idsMembros.length > 0
        ? await supabase.from("vendas").select("profile_id, valor").in("profile_id", idsMembros).gte("data", inicioMes)
        : { data: [] };
    const producaoPorMembro = new Map<string, number>();
    for (const v of vendasMembros ?? []) {
      producaoPorMembro.set(v.profile_id, (producaoPorMembro.get(v.profile_id) ?? 0) + Number(v.valor));
    }
    sdrsDaTribo = (membros ?? [])
      .map((m) => ({
        id: m.id,
        nome: m.full_name,
        rank: m.rank as Rank,
        avatarUrl: m.avatar_url,
        producao: producaoPorMembro.get(m.id) ?? 0,
      }))
      .sort((a, b) => b.producao - a.producao);

    if (tribo?.exercito_id) {
      const { data: ex } = await supabase
        .from("exercitos")
        .select("nome, legado:profiles!exercitos_legado_id_fkey(id, full_name, rank, avatar_url)")
        .eq("id", tribo.exercito_id)
        .single();
      const legadoRow = ex?.legado as unknown as { id: string; full_name: string; rank: Rank; avatar_url: string | null } | null;
      exercito = ex
        ? {
            nome: ex.nome,
            legado: legadoRow
              ? { id: legadoRow.id, nome: legadoRow.full_name, rank: legadoRow.rank, avatarUrl: legadoRow.avatar_url }
              : null,
          }
        : null;
    }
  }

  // ---------- Líder de Exército: não tem tribo_id (lidera o Exército inteiro,
  // não uma Tribo específica) — em vez de "Minha Tribo", mostra o Exército
  // como um todo: "Minhas Tribos" (logo + Closer de cada Tribo) e "Meu Time"
  // (todo mundo — SDR e Closer — de todas as Tribos, com foto e Tribo).
  type TriboDoExercito = { id: string; nome: string; logoUrl: string | null; closer: Pessoa | null; producao: number };
  type MembroDoExercito = Pessoa & { role: string; triboNome: string };
  let exercitoLiderado: { nome: string; tribos: TriboDoExercito[]; membros: MembroDoExercito[] } | null = null;

  if (profile.role === "lider" && !profile.tribo_id) {
    const { data: ex } = await supabase.from("exercitos").select("id, nome").eq("legado_id", userId).maybeSingle();
    if (ex) {
      const { data: tribosDoExercito } = await supabase
        .from("tribos")
        .select("id, nome, logo_url, closer:profiles!tribos_closer_id_fkey(id, full_name, rank, avatar_url)")
        .eq("exercito_id", ex.id)
        .order("nome");
      const triboIds = (tribosDoExercito ?? []).map((t) => t.id);
      const nomeTriboPorId = new Map((tribosDoExercito ?? []).map((t) => [t.id, t.nome]));

      const closerIds = (tribosDoExercito ?? [])
        .map((t) => (t.closer as unknown as { id: string } | null)?.id)
        .filter((id): id is string => !!id);
      const { data: vendasClosers } =
        closerIds.length > 0
          ? await supabase.from("vendas").select("profile_id, valor").in("profile_id", closerIds).gte("data", inicioMes)
          : { data: [] };
      const producaoPorCloser = new Map<string, number>();
      for (const v of vendasClosers ?? []) {
        producaoPorCloser.set(v.profile_id, (producaoPorCloser.get(v.profile_id) ?? 0) + Number(v.valor));
      }

      const { data: membrosDoExercito } =
        triboIds.length > 0
          ? await supabase
              .from("profiles")
              .select("id, full_name, rank, avatar_url, role, tribo_id")
              .in("tribo_id", triboIds)
              .in("role", ["sdr", "closer"])
              .order("full_name")
          : { data: [] };

      exercitoLiderado = {
        nome: ex.nome,
        tribos: (tribosDoExercito ?? []).map((t) => {
          const closerRow = t.closer as unknown as { id: string; full_name: string; rank: Rank; avatar_url: string | null } | null;
          return {
            id: t.id,
            nome: t.nome,
            logoUrl: t.logo_url,
            closer: closerRow
              ? { id: closerRow.id, nome: closerRow.full_name, rank: closerRow.rank, avatarUrl: closerRow.avatar_url }
              : null,
            producao: closerRow ? producaoPorCloser.get(closerRow.id) ?? 0 : 0,
          };
        }),
        membros: (membrosDoExercito ?? []).map((m) => ({
          id: m.id,
          nome: m.full_name,
          rank: m.rank as Rank,
          avatarUrl: m.avatar_url,
          role: m.role,
          triboNome: (m.tribo_id && nomeTriboPorId.get(m.tribo_id)) || "—",
        })),
      };
    }
  }

  return (
    <aside className="hidden w-72 shrink-0 space-y-6 border-l border-imperium-line bg-imperium-surface p-5 xl:block">
      <div className="watermark-spqr text-center">
        <p className="kicker mb-3">Cargo Atual</p>
        <RankBadge rank={rank} size="lg" />
        <p className="mt-2 font-display text-base text-gold-bright">{RANK_LABELS[rank]}</p>
        <p className="mt-1 text-lg tracking-widest">
          {Array.from({ length: totalEstrelas }).map((_, i) => (
            <span key={i} className={i < profile.stars_total ? "text-gold" : "text-imperium-line-strong"}>
              ★
            </span>
          ))}
        </p>
      </div>

      {semanaEstrelas &&
        (() => {
          const r = resultadoSemanaEstrela(semanaEstrelas.qtd, pace);
          return (
            <a
              href="/estrelas"
              className="block rounded border border-imperium-line px-3 py-2 text-center text-xs transition hover:border-gold/50 hover:bg-gold/5"
            >
              <span className="text-stone-500">Essa semana: </span>
              <span className={r.cor}>
                {r.icone} {r.label}
              </span>
              <span className="text-stone-600"> · {semanaEstrelas.qtd}/{pace.cheia} pagos</span>
            </a>
          );
        })()}

      {carreiraResumo && (
        <a
          href="/carreira"
          className="block rounded border border-imperium-line p-3 transition hover:border-gold/50 hover:bg-gold/5"
        >
          <div className="flex items-center justify-between">
            <p className="kicker">Plano de Carreira</p>
            <span className="text-[10px] text-gold">ver tudo →</span>
          </div>
          <p className="mt-1.5 text-xs text-stone-300">
            Rumo a <span className="text-gold-bright">{RANK_LABELS[carreiraResumo.proximoRank]}</span>:{" "}
            <span className="text-gold-bright">{carreiraResumo.ok}</span>/{carreiraResumo.total} critérios
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-imperium-line">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold to-gold-bright"
              style={{ width: `${(carreiraResumo.ok / carreiraResumo.total) * 100}%` }}
            />
          </div>
        </a>
      )}

      {quote && (
        <div className="border-t border-imperium-line pt-4 text-center">
          <p className="kicker mb-2">Oráculo</p>
          <p className="font-serif text-sm italic text-stone-300">&quot;{quote.texto}&quot;</p>
          <p className="mt-1 text-[10px] text-stone-600">{quote.fonte}</p>
        </div>
      )}

      {tierAtual && (
        <a
          href="/comissao"
          className="block border-t border-imperium-line pt-4 transition hover:opacity-80"
        >
          <div className="flex items-center justify-between">
            <p className="kicker">Comissão do mês</p>
            <span className="text-[10px] text-gold">ver tudo →</span>
          </div>
          <p className="mt-1.5 text-xs text-stone-300">
            Tier <span className="text-gold-bright">{paraRomano(tierAtual.tierIdx + 1)}</span> de{" "}
            {paraRomano(tiersOrdenados.length)}
            {proximo ? (
              <>
                {" "}
                — faltam <span className="text-gold">{moeda(proximo.faltaProducao)}</span> pro próximo
              </>
            ) : (
              <span className="text-success-bright"> — tier máximo</span>
            )}
          </p>
        </a>
      )}

      {/* Marcos e Tribo/Exército: bloco secundário, colapsado por padrão — a
          lateral aparece em TODA página, então empilhar tudo sempre aberto
          soma densidade em cada uma delas. Só identidade/estrelas/carreira/
          comissão (o que dá pra bater o olho rápido) fica sempre visível. */}
      {(marcos.length > 0 || nomeTribo || exercito || exercitoLiderado) && (
        <details className="border-t border-imperium-line pt-4 group">
          <summary className="kicker flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
            <span>Time e Marcos</span>
            <span className="text-[10px] normal-case text-stone-500 transition group-open:rotate-180">▾</span>
          </summary>

          {marcos.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-[10px] uppercase tracking-wide text-stone-500">Sistema de Marcos</p>
              <div className="grid grid-cols-3 gap-2">
                {marcos.map((m) =>
                  m.imagemUrl ? (
                    <div
                      key={m.id}
                      className={`relative aspect-square overflow-hidden rounded-lg border ${
                        m.alcancado
                          ? "border-gold"
                          : m.elegivel
                            ? "border-gold/50 border-dashed"
                            : "border-imperium-line-strong opacity-50 grayscale"
                      }`}
                      title={m.elegivel ? `${m.nome} — disponível este mês, fale com o Diretor` : m.nome}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.imagemUrl} alt={m.nome} className="h-full w-full object-cover" />
                      {!m.alcancado && !m.elegivel && (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-base">
                          🔒
                        </span>
                      )}
                      {m.elegivel && (
                        <span className="absolute -bottom-1 -right-1 text-xs">🎁</span>
                      )}
                    </div>
                  ) : (
                    <div
                      key={m.id}
                      className={`relative flex aspect-square items-center justify-center rounded-full border text-lg ${
                        m.alcancado
                          ? "border-gold bg-gold/10"
                          : m.elegivel
                            ? "border-gold/50 border-dashed bg-gold/5"
                            : "border-imperium-line-strong bg-imperium-bg/40 opacity-50"
                      }`}
                      title={m.elegivel ? `${m.nome} — disponível este mês, fale com o Diretor` : m.nome}
                    >
                      {m.icone}
                      {!m.alcancado && !m.elegivel && <span className="absolute -bottom-1 -right-1 text-xs">🔒</span>}
                      {m.elegivel && <span className="absolute -bottom-1 -right-1 text-xs">🎁</span>}
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {nomeTribo && (
            <div className="mt-4">
              <p className="mb-2 text-[10px] uppercase tracking-wide text-stone-500">Minha Tribo · {nomeTribo}</p>

              <div className="mb-3 flex items-center gap-3 rounded border border-gold/30 bg-gold/5 p-2.5">
                {logoTribo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoTribo}
                    alt={nomeTribo}
                    className="h-11 w-11 shrink-0 rounded-full border border-gold/50 object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-gold/40 text-[9px] text-stone-600">
                    Bandeira
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {closer ? (
                    <>
                      <p className="truncate text-sm text-gold-bright">{closer.nome}</p>
                      <p className="text-[10px] uppercase tracking-wide text-stone-500">
                        {RANK_LABELS[closer.rank] ?? closer.rank} · líder da Tribo
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-stone-600">Tribo sem Closer definido</p>
                  )}
                </div>
              </div>

              {sdrsDaTribo.length > 0 ? (
                <ul className="space-y-2">
                  {sdrsDaTribo.map((m) => (
                    <li key={m.id} className="flex items-center gap-2.5">
                      {m.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.avatarUrl}
                          alt={m.nome}
                          className="h-7 w-7 shrink-0 rounded-full border border-imperium-line-strong object-cover"
                        />
                      ) : (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-imperium-line-strong bg-imperium-bg text-[9px] text-stone-500">
                          {iniciais(m.nome)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-stone-200">{m.nome}</p>
                      </div>
                      <span className="shrink-0 text-[10px] text-gold">{moeda(m.producao)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-stone-600">Nenhum SDR na Tribo ainda.</p>
              )}
            </div>
          )}

          {exercito && (
            <div className="mt-4">
              <p className="mb-2 text-[10px] uppercase tracking-wide text-stone-500">Meu Exército · {exercito.nome}</p>

              <div className="flex items-center gap-3 rounded border border-wine/30 bg-wine/5 p-2.5">
                {EXERCITO_CREST[exercito.nome] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={EXERCITO_CREST[exercito.nome]}
                    alt={exercito.nome}
                    className="h-11 w-11 shrink-0 rounded-full border border-wine/50 object-cover"
                  />
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed border-wine/40 text-[9px] text-stone-600">
                    Bandeira
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  {exercito.legado ? (
                    <>
                      <p className="truncate text-sm text-gold-bright">{exercito.legado.nome}</p>
                      <p className="text-[10px] uppercase tracking-wide text-stone-500">Legado do Exército</p>
                    </>
                  ) : (
                    <p className="text-xs text-stone-600">Exército sem Legado definido</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {exercitoLiderado && (
            <div className="mt-4">
              <p className="mb-2 text-[10px] uppercase tracking-wide text-stone-500">Meu Exército · {exercitoLiderado.nome}</p>

              <p className="mb-2 text-[10px] uppercase tracking-wide text-stone-500">Minhas Tribos</p>
              {exercitoLiderado.tribos.length > 0 ? (
                <ul className="space-y-3">
                  {exercitoLiderado.tribos.map((t) => (
                    <li key={t.id} className="flex items-center gap-2.5">
                      {t.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={t.logoUrl}
                          alt={t.nome}
                          className="h-9 w-9 shrink-0 rounded-full border border-gold/40 object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-gold/40 text-[8px] text-stone-600">
                          Bandeira
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-gold-bright">{t.nome}</p>
                        <p className="truncate text-[10px] text-stone-500">
                          {t.closer ? t.closer.nome : "sem Closer definido"}
                        </p>
                      </div>
                      {t.closer && <span className="shrink-0 text-[10px] text-gold">{moeda(t.producao)}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-stone-600">Nenhuma Tribo neste Exército ainda.</p>
              )}

              <p className="mb-2 mt-4 text-[10px] uppercase tracking-wide text-stone-500">
                Meu Time ({exercitoLiderado.membros.length})
              </p>
              {exercitoLiderado.membros.length > 0 ? (
                <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {exercitoLiderado.membros.map((m) => (
                    <li key={m.id} className="flex items-center gap-2.5">
                      {m.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.avatarUrl}
                          alt={m.nome}
                          className="h-7 w-7 shrink-0 rounded-full border border-imperium-line-strong object-cover"
                        />
                      ) : (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-imperium-line-strong bg-imperium-bg text-[9px] text-stone-500">
                          {iniciais(m.nome)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-stone-200">{m.nome}</p>
                        <p className="truncate text-[10px] text-stone-500">{m.triboNome}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-stone-600">Nenhum membro nas Tribos ainda.</p>
              )}
            </div>
          )}
        </details>
      )}
    </aside>
  );
}
