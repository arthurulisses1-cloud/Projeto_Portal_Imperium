import { createClient } from "@/lib/supabase/server";
import { RANK_LABELS } from "@/lib/labels";
import { RANK_ORDER, NEXT_RANK, NEXT_TRANSICAO, BLOCO_LABELS, type Rank } from "@/lib/carreira";
import { registrarMetaPessoal, escolherLivro, marcarApresentado } from "./actions";
import Card from "@/components/ui/Card";
import RankBadge from "@/components/ui/RankBadge";
import Laurel from "@/components/ui/Laurel";

const STAR_PACE: Record<Rank, { estrelas: number; cheia: number; meia: number }> = {
  legionario: { estrelas: 0, cheia: 0, meia: 0 },
  centuriao: { estrelas: 6, cheia: 3, meia: 2 },
  tribuno: { estrelas: 8, cheia: 5, meia: 3 },
  pretor: { estrelas: 10, cheia: 7, meia: 5 },
  legado: { estrelas: 12, cheia: 10, meia: 6 },
};

export default async function CarreiraPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, rank, stars_total")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const rankAtual = profile.rank as Rank;
  const proximoRank = NEXT_RANK[rankAtual];
  const transicao = NEXT_TRANSICAO[rankAtual];

  type Criterio = {
    id: string;
    bloco: number;
    texto: string;
    tipo: string;
    target_value: number | null;
    dias_strikes: number | null;
    ordem: number;
  };

  const { data: criterios } = transicao
    ? await supabase
        .from("promotion_criteria")
        .select("id, bloco, texto, tipo, target_value, dias_strikes, ordem")
        .eq("transicao", transicao)
        .order("bloco")
        .order("ordem")
    : { data: [] as Criterio[] };

  const { count: strikesRecentesTotal } = await supabase
    .from("strikes")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id);

  const { data: metas } = await supabase
    .from("metas_pessoais")
    .select("id, nivel_alvo, data_alvo, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const metaAtual = metas?.[0];

  const { data: pdi } = await supabase
    .from("pdi_registros")
    .select("id, observacao, plano_acao, proxima_revisao, created_at")
    .eq("profile_id", user.id)
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
          .eq("profile_id", user.id)
          .in("livro_id", livroIds)
      : { data: [] };
  const escolha = escolhas?.[0];
  const livroEscolhido = livros?.find((l) => l.id === escolha?.livro_id);

  const paceAtual = STAR_PACE[proximoRank ?? "legionario"];
  const progressoEstrelas =
    paceAtual.estrelas > 0 ? Math.min(100, (profile.stars_total / paceAtual.estrelas) * 100) : 100;

  // ritmo necessário pra meta pessoal
  let ritmo: { semanasRestantes: number; estrelasFaltando: number; vendasPorSemana: number } | null =
    null;
  if (metaAtual && proximoRank) {
    const pace = STAR_PACE[metaAtual.nivel_alvo as Rank];
    const hoje = new Date();
    const alvo = new Date(metaAtual.data_alvo + "T00:00:00");
    const semanasRestantes = Math.max(
      1,
      Math.ceil((alvo.getTime() - hoje.getTime()) / (7 * 86400000))
    );
    const estrelasFaltando = Math.max(0, pace.estrelas - profile.stars_total);
    const vendasPorSemana = (estrelasFaltando / semanasRestantes) * pace.cheia;
    ritmo = { semanasRestantes, estrelasFaltando, vendasPorSemana };
  }

  const criteriosPorBloco = new Map<number, Criterio[]>();
  for (const c of (criterios ?? []) as Criterio[]) {
    if (!criteriosPorBloco.has(c.bloco)) criteriosPorBloco.set(c.bloco, []);
    criteriosPorBloco.get(c.bloco)!.push(c);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Plano de Carreira</h1>
        <p className="kicker mt-1">Cursus Honorum</p>
      </div>

      <Card className="watermark-spqr">
        <div className="mb-6 flex items-end justify-center gap-3 sm:gap-6">
          {RANK_ORDER.map((r, i) => {
            const atual = r === rankAtual;
            const alcancado = RANK_ORDER.indexOf(r) <= RANK_ORDER.indexOf(rankAtual);
            return (
              <div
                key={r}
                className="flex flex-col items-center gap-2"
                style={{ marginBottom: `${i * 6}px` }}
              >
                <RankBadge rank={r} size={atual ? "lg" : "sm"} active={alcancado} />
                <p className={`text-[11px] ${atual ? "text-gold-bright" : "text-stone-500"}`}>
                  {RANK_LABELS[r]}
                </p>
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

      <Card
        title={
          proximoRank ? `Requisitos para ${RANK_LABELS[proximoRank]}` : "Topo do Cursus Honorum"
        }
      >
        <div className="mb-5">
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-stone-400">
              {profile.stars_total} de {paceAtual.estrelas || "—"} estrelas
            </span>
            <span className="text-gold">{progressoEstrelas.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-imperium-line">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold to-gold-bright"
              style={{ width: `${progressoEstrelas}%` }}
            />
          </div>
        </div>
        {Array.from(criteriosPorBloco.entries()).map(([bloco, itens]) => (
          <div key={bloco} className="mb-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gold">
              Bloco {bloco} — {BLOCO_LABELS[bloco]}
            </p>
            <ul className="space-y-1">
              {itens!.map((item) => (
                <li key={item.id} className="flex justify-between text-sm">
                  <span className="text-stone-300">{item.texto}</span>
                  {item.tipo === "strikes" && (
                    <span
                      className={
                        (strikesRecentesTotal ?? 0) === 0 ? "text-emerald-400" : "text-wine-bright"
                      }
                    >
                      {strikesRecentesTotal ?? 0} strike(s)
                    </span>
                  )}
                  {item.tipo === "manual" && (
                    <span className="text-stone-500">registro do líder</span>
                  )}
                </li>
              ))}
            </ul>
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
                <p className="mt-2 text-emerald-400">Apresentação pública concluída</p>
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
