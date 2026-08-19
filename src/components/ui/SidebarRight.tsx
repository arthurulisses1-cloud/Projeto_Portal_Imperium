import { createClient } from "@/lib/supabase/server";
import { RANK_LABELS } from "@/lib/labels";
import { STAR_PACE, type Rank } from "@/lib/carreira";
import { lookupComissao, proximoTier } from "@/lib/comissao";
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
    .select("rank, stars_total, tribo_id")
    .eq("id", userId)
    .single();

  if (!profile) return null;
  const rank = profile.rank as Rank;
  const pace = STAR_PACE[rank] ?? STAR_PACE.legionario;
  const totalEstrelas = pace.estrelas || 6;

  const { data: quotes } = await supabase.from("sage_quotes").select("texto, fonte").eq("ativo", true);
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const quote = quotes && quotes.length > 0 ? quotes[(dayOfYear + 1) % quotes.length] : null;

  const { marcos } = await buscarProgressoMarcos(supabase, userId);

  const { data: tiers } = await supabase
    .from("commission_tiers")
    .select("producao_min, fixo, pct_variavel")
    .eq("rank", rank)
    .order("ordem");
  const inicioMes = new Date().toISOString().slice(0, 7) + "-01";
  const { data: vendasMes } = await supabase
    .from("vendas")
    .select("valor")
    .eq("profile_id", userId)
    .gte("data", inicioMes);
  const producaoMes = (vendasMes ?? []).reduce((s, v) => s + Number(v.valor), 0);
  const tiersOrdenados = [...(tiers ?? [])].sort((a, b) => a.producao_min - b.producao_min);
  const tierAtual = lookupComissao(tiersOrdenados, producaoMes);
  const proximo = proximoTier(tiersOrdenados, producaoMes);

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

      {quote && (
        <div className="border-t border-imperium-line pt-4 text-center">
          <p className="kicker mb-2">Oráculo</p>
          <p className="font-serif text-sm italic text-stone-300">&quot;{quote.texto}&quot;</p>
          <p className="mt-1 text-[10px] text-stone-600">{quote.fonte}</p>
        </div>
      )}

      <div className="border-t border-imperium-line pt-4">
        <p className="kicker mb-3">Sistema de Marcos</p>
        {marcos.length > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {marcos.map((m) =>
              m.imagemUrl ? (
                <div
                  key={m.id}
                  className={`relative aspect-square overflow-hidden rounded-lg border ${
                    m.alcancado ? "border-gold" : "border-imperium-line-strong opacity-50 grayscale"
                  }`}
                  title={m.nome}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.imagemUrl} alt={m.nome} className="h-full w-full object-cover" />
                  {!m.alcancado && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-base">
                      🔒
                    </span>
                  )}
                </div>
              ) : (
                <div
                  key={m.id}
                  className={`relative flex aspect-square items-center justify-center rounded-full border text-lg ${
                    m.alcancado
                      ? "border-gold bg-gold/10"
                      : "border-imperium-line-strong bg-imperium-bg/40 opacity-50"
                  }`}
                  title={m.nome}
                >
                  {m.icone}
                  {!m.alcancado && <span className="absolute -bottom-1 -right-1 text-xs">🔒</span>}
                </div>
              )
            )}
          </div>
        ) : (
          <p className="text-xs text-stone-600">Nenhum marco cadastrado ainda.</p>
        )}
      </div>

      {tierAtual && (
        <div className="border-t border-imperium-line pt-4">
          <p className="kicker mb-3">Tabela de Remuneração</p>
          <div className="mb-2 flex items-end justify-center gap-1.5">
            {tiersOrdenados.map((t, i) => {
              const ativo = i === tierAtual.tierIdx;
              return (
                <div key={t.producao_min} className="flex flex-col items-center gap-1" title={moeda(t.producao_min)}>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border font-display text-[10px] ${
                      ativo ? "border-gold bg-gold text-imperium-bg" : "border-imperium-line text-stone-500"
                    }`}
                  >
                    {paraRomano(i + 1)}
                  </span>
                  <div
                    className={`w-6 rounded-t ${ativo ? "bg-gold" : "bg-imperium-line"}`}
                    style={{ height: `${14 + i * 9}px` }}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-center text-xs text-stone-400">
            Tier {paraRomano(tierAtual.tierIdx + 1)} de {paraRomano(tiersOrdenados.length)}
          </p>
          {proximo ? (
            <p className="mt-1 text-center text-xs text-stone-500">
              Faltam <span className="text-gold">{moeda(proximo.faltaProducao)}</span> pro próximo
              tier.
              <br />
              Se alcançar, <span className="text-emerald-400">+{moeda(proximo.ganhoTotal)}</span> na
              comissão.
            </p>
          ) : (
            <p className="mt-1 text-center text-xs text-emerald-400">Tier máximo atingido.</p>
          )}
        </div>
      )}

      {nomeTribo && (
        <div className="border-t border-imperium-line pt-4">
          <p className="kicker mb-3">Minha Tribo · {nomeTribo}</p>

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
        <div className="border-t border-imperium-line pt-4">
          <p className="kicker mb-3">Meu Exército · {exercito.nome}</p>

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
    </aside>
  );
}
