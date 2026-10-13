import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { carregarCatalogo } from "@/lib/imperioflix";
import { progressoDaSerie, proximoEpisodio, urlDoEpisodio, type Episodio } from "@/lib/imperioflix-util";
import { BarraProgresso, Destaque, Poster } from "@/components/imperioflix/ImperioflixUi";
import { GerenciarModulo } from "@/components/imperioflix/GerenciarImperioflix";

function dataBr(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

// Página da série (trilha ou módulo) no formato "título da Netflix" + visão
// geral do curso (G4/Conquer): destaque com o botão de continuar, a lista de
// aulas com status e, ao lado, sobre/progresso e outras séries parecidas.
export default async function SeriePage({ params }: { params: { serieId: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const catalogo = await carregarCatalogo(supabase, user.id);
  const serie = catalogo.series.find((s) => s.id === params.serieId);
  if (!serie) notFound();

  const vistos = catalogo.assistidos;
  const prog = progressoDaSerie(serie, vistos);
  const proximo = proximoEpisodio(serie, vistos);
  const parecidas = catalogo.series
    .filter((s) => s.id !== serie.id && !s.bloqueado && (serie.categoria ? s.categoria === serie.categoria : s.tipo === serie.tipo))
    .slice(0, 3);

  return (
    <main className="mx-auto max-w-[1400px] space-y-8 px-4 py-8 sm:px-6">
      <nav className="text-sm text-stone-1000" aria-label="Navegação">
        <Link href="/academy/imperioflix" className="hover:text-gold">
          Imperioflix
        </Link>
        <span className="mx-2">›</span>
        <span className="text-stone-300">{serie.titulo}</span>
      </nav>

      <Destaque serie={serie} vistos={vistos} modo="serie" />

      {catalogo.isDiretor && serie.tipo === "modulo" && <GerenciarModulo modulo={serie} categorias={catalogo.categorias} />}
      {catalogo.isDiretor && serie.tipo === "trilha" && (
        <p className="rounded-xl border border-gold/40 bg-imperium-surface/80 px-5 py-4 text-sm text-stone-300">
          As aulas das trilhas oficiais são criadas e agendadas em{" "}
          <Link href="/academy" className="text-gold underline">
            Academy Geral
          </Link>
          . O vídeo e o resumo de cada aula você edita dentro da própria aula, aqui na Imperioflix.
        </p>
      )}

      {serie.bloqueado ? (
        <p className="rounded-xl border border-imperium-line px-6 py-12 text-center text-sm text-stone-400">
          🔒 Esse conteúdo é liberado em um rank mais alto. Continue evoluindo no Plano de Carreira para desbloquear.
        </p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-xl text-stone-100">Aulas</h2>
              <span className="text-xs text-stone-1000">
                {prog.feitos}/{prog.total} concluídas
              </span>
            </div>

            {serie.episodios.length === 0 ? (
              <p className="rounded-xl border border-imperium-line px-6 py-10 text-center text-sm text-stone-1000">
                Nenhuma aula cadastrada ainda. Assim que a primeira for publicada, ela aparece aqui.
              </p>
            ) : (
              <ol className="space-y-2.5">
                {serie.episodios.map((ep, i) => (
                  <LinhaEpisodio
                    key={ep.id}
                    serieId={serie.id}
                    ep={ep}
                    numero={i + 1}
                    visto={vistos.has(ep.id)}
                    proxima={proximo?.id === ep.id && prog.pct < 100}
                    fundo={serie.capaUrl ? `url("${serie.capaUrl.replace(/"/g, "%22")}") center/cover` : serie.gradiente}
                    icone={serie.icone}
                  />
                ))}
              </ol>
            )}
          </section>

          <aside className="space-y-6">
            <div className="space-y-3 rounded-xl border border-imperium-line bg-imperium-surface/60 p-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">Seu progresso</h3>
              <p className="font-display text-4xl text-stone-100">{prog.pct}%</p>
              <BarraProgresso pct={prog.pct} />
              <p className="text-xs text-stone-1000">
                {prog.feitos} de {prog.total} {prog.total === 1 ? "aula concluída" : "aulas concluídas"}
              </p>
            </div>

            {serie.descricao && (
              <div className="space-y-2 rounded-xl border border-imperium-line bg-imperium-surface/60 p-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">Sobre</h3>
                <p className="text-sm leading-relaxed text-stone-300">{serie.descricao}</p>
              </div>
            )}

            {parecidas.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">Mais como este</h3>
                <div className="grid grid-cols-3 gap-2.5 lg:grid-cols-2">
                  {parecidas.map((s) => (
                    <Poster key={s.id} serie={s} vistos={vistos} className="w-full" />
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}

function LinhaEpisodio({
  serieId,
  ep,
  numero,
  visto,
  proxima,
  fundo,
  icone,
}: {
  serieId: string;
  ep: Episodio;
  numero: number;
  visto: boolean;
  proxima: boolean;
  fundo: string;
  icone: string;
}) {
  return (
    <li>
      <Link
        href={urlDoEpisodio(serieId, ep.id)}
        className={`group flex gap-4 rounded-xl border p-3 transition hover:border-gold/60 hover:bg-imperium-surface ${
          proxima ? "border-gold/60 bg-gold/5" : "border-imperium-line bg-imperium-surface/40"
        }`}
      >
        <div className="relative hidden aspect-video w-44 shrink-0 overflow-hidden rounded-lg sm:block" style={{ background: fundo }}>
          <div className="absolute inset-0 bg-black/45" />
          <span className="absolute left-2 top-1.5 font-display text-2xl font-bold text-white/90">{numero}</span>
          <span className="absolute inset-0 flex items-center justify-center text-2xl text-white opacity-80 transition group-hover:scale-110 group-hover:opacity-100">
            {ep.tipo === "item" && !ep.videoUrl ? "📄" : "▶"}
          </span>
          <span className="sr-only">{icone}</span>
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-medium leading-snug text-stone-100">
              <span className="mr-2 text-stone-1000 sm:hidden">{numero}.</span>
              {ep.titulo}
            </h3>
            {visto ? (
              <span className="shrink-0 rounded-full bg-success/20 px-2 py-0.5 text-[11px] font-medium text-success-bright">✓ Concluída</span>
            ) : proxima ? (
              <span className="shrink-0 rounded-full bg-gold/20 px-2 py-0.5 text-[11px] font-medium text-gold-bright">Próxima</span>
            ) : null}
          </div>
          {ep.resumo && <p className="line-clamp-2 text-sm text-stone-400">{ep.resumo}</p>}
          <p className="text-xs text-stone-600">
            {[ep.instrutorNome ? `com ${ep.instrutorNome}` : null, ep.data ? dataBr(ep.data) : null, ep.videoUrl ? "Vídeo" : ep.arquivoUrl ? "Material" : null, ep.marco ? "Marco" : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </Link>
    </li>
  );
}
