import { createClient } from "@/lib/supabase/server";
import { RANK_LABELS } from "@/lib/labels";
import { RANK_ORDER, NEXT_RANK, NEXT_TRANSICAO, BLOCO_LABELS, type Rank } from "@/lib/carreira";
import { registrarMetaPessoal, escolherLivro, marcarApresentado } from "./actions";

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
        <h1 className="font-serif text-xl text-amber-400">Plano de Carreira</h1>
        <p className="text-xs text-stone-400">Cursus Honorum</p>
      </div>

      <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
        <div className="mb-4 flex justify-between">
          {RANK_ORDER.map((r) => (
            <div key={r} className="text-center">
              <div
                className={`mx-auto mb-1 h-3 w-3 rounded-full ${
                  r === rankAtual ? "bg-amber-400" : "bg-stone-700"
                }`}
              />
              <p
                className={`text-xs ${
                  r === rankAtual ? "text-amber-400" : "text-stone-500"
                }`}
              >
                {RANK_LABELS[r]}
              </p>
            </div>
          ))}
        </div>
        <p className="text-center text-xs italic text-stone-500">
          &quot;Esse Quam Videri&quot; — Ser, ao invés de parecer. Nenhuma patente é dada por
          completar checklist; é dada porque a pessoa já opera, na prática, como o
          próximo nível.
        </p>
      </section>

      <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-stone-400">
          {proximoRank
            ? `Requisitos para ${RANK_LABELS[proximoRank]}`
            : "Você está no topo do Cursus Honorum"}
        </h2>
        <p className="mb-4 text-sm text-stone-300">
          Estrelas acumuladas: <span className="text-amber-400">{profile.stars_total}</span>
        </p>
        {Array.from(criteriosPorBloco.entries()).map(([bloco, itens]) => (
          <div key={bloco} className="mb-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-amber-500">
              Bloco {bloco} — {BLOCO_LABELS[bloco]}
            </p>
            <ul className="space-y-1">
              {itens!.map((item) => (
                <li key={item.id} className="flex justify-between text-sm">
                  <span className="text-stone-300">{item.texto}</span>
                  {item.tipo === "strikes" && (
                    <span
                      className={
                        (strikesRecentesTotal ?? 0) === 0 ? "text-emerald-400" : "text-red-400"
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
      </section>

      {proximoRank && (
        <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-stone-400">
            Meta pessoal de médio prazo
          </h2>
          {metaAtual ? (
            <div className="text-sm text-stone-300">
              <p>
                Alvo: <span className="text-amber-400">{RANK_LABELS[metaAtual.nivel_alvo]}</span>{" "}
                até{" "}
                {new Date(metaAtual.data_alvo + "T00:00:00").toLocaleDateString("pt-BR")}
              </p>
              {ritmo && (
                <p className="mt-2 text-stone-400">
                  Faltam {ritmo.estrelasFaltando} estrelas em ~{ritmo.semanasRestantes}{" "}
                  semanas — ritmo estimado de{" "}
                  <span className="text-amber-400">
                    {ritmo.vendasPorSemana.toFixed(1)} vendas/semana
                  </span>
                  .
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
                  className="rounded border border-stone-700 bg-[#0b0f19] px-3 py-2 text-stone-100"
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
                <input
                  type="date"
                  name="data_alvo"
                  required
                  className="rounded border border-stone-700 bg-[#0b0f19] px-3 py-2 text-stone-100"
                />
              </div>
              <button
                type="submit"
                className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-[#0b0f19] hover:bg-amber-400"
              >
                Definir meta
              </button>
            </form>
          )}
        </section>
      )}

      {proximoRank && (
        <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-stone-400">
            Biblioteca — rumo a {RANK_LABELS[proximoRank]}
          </h2>
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
                  <button
                    type="submit"
                    className="rounded border border-amber-500 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500 hover:text-[#0b0f19]"
                  >
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
              <button
                type="submit"
                className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-[#0b0f19] hover:bg-amber-400"
              >
                Escolher livro
              </button>
            </form>
          )}
        </section>
      )}

      <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-stone-400">
          Feedback / PDI
        </h2>
        {pdi && pdi.length > 0 ? (
          <ul className="space-y-3">
            {pdi.map((p) => (
              <li key={p.id} className="border-b border-stone-800 pb-3 last:border-0">
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
      </section>
    </main>
  );
}
