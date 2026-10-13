"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { progressoDaSerie, proximoEpisodio, urlDoEpisodio, type Serie } from "@/lib/imperioflix-util";

function fundoDaCapa(serie: Pick<Serie, "capaUrl" | "gradiente">) {
  return serie.capaUrl ? `url("${serie.capaUrl.replace(/"/g, "%22")}") center/cover` : serie.gradiente;
}

export function BarraProgresso({ pct, className = "" }: { pct: number; className?: string }) {
  return (
    <div className={`h-1 overflow-hidden rounded-full bg-white/15 ${className}`}>
      <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

// Pôster de série (card da prateleira) — pôster vertical como na Netflix, com
// título e progresso sobre a imagem e um "play" que aparece no hover.
export function Poster({ serie, vistos, className = "" }: { serie: Serie; vistos: Set<string>; className?: string }) {
  const prog = progressoDaSerie(serie, vistos);
  return (
    <Link
      href={`/academy/imperioflix/${serie.id}`}
      className={`group relative block shrink-0 snap-start overflow-hidden rounded-xl border border-imperium-line shadow-md transition duration-300 hover:z-10 hover:scale-[1.06] hover:border-gold/60 hover:shadow-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${className}`}
      aria-label={serie.titulo}
    >
      <div className="relative aspect-[2/3] w-full" style={{ background: fundoDaCapa(serie) }}>
        {!serie.capaUrl && <span className="absolute inset-0 flex items-center justify-center pb-10 text-6xl text-white/90">{serie.icone}</span>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />

        {serie.bloqueado && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 text-white">
            <span className="text-3xl">🔒</span>
            <span className="text-[10px] uppercase tracking-wide">Bloqueado</span>
          </div>
        )}

        {!serie.bloqueado && (
          <span className="absolute left-1/2 top-[42%] flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-gold text-imperium-bg opacity-0 shadow-lg transition group-hover:opacity-100">
            ▶
          </span>
        )}

        {prog.pct === 100 && (
          <span className="absolute right-2 top-2 rounded-full bg-success px-2 py-0.5 text-[10px] font-semibold text-white">✓ Concluída</span>
        )}

        <div className="absolute inset-x-0 bottom-0 space-y-1 p-3">
          <p className="line-clamp-2 text-sm font-semibold leading-tight text-white drop-shadow">{serie.titulo}</p>
          <p className="text-[11px] text-white/70">
            {serie.episodios.length} {serie.episodios.length === 1 ? "aula" : "aulas"}
            {prog.feitos > 0 && prog.pct < 100 && ` · ${prog.pct}%`}
          </p>
          {prog.feitos > 0 && prog.pct < 100 && <BarraProgresso pct={prog.pct} />}
        </div>
      </div>
    </Link>
  );
}

// Prateleira com rolagem horizontal e setas (aparecem ao passar o mouse).
export function Prateleira({ titulo, children }: { titulo: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  function rolar(dir: 1 | -1) {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  }
  return (
    <section className="group/row space-y-2.5">
      <h2 className="font-display text-xl text-stone-100">{titulo}</h2>
      <div className="relative">
        <button
          type="button"
          onClick={() => rolar(-1)}
          aria-label="Voltar"
          className="absolute -left-3 top-1/2 z-20 hidden h-12 w-9 -translate-y-1/2 items-center justify-center rounded-md bg-black/70 text-xl text-white opacity-0 transition hover:bg-black group-hover/row:opacity-100 md:flex"
        >
          ‹
        </button>
        <div ref={ref} className="flex snap-x gap-4 overflow-x-auto scroll-smooth px-1 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
        <button
          type="button"
          onClick={() => rolar(1)}
          aria-label="Avançar"
          className="absolute -right-3 top-1/2 z-20 hidden h-12 w-9 -translate-y-1/2 items-center justify-center rounded-md bg-black/70 text-xl text-white opacity-0 transition hover:bg-black group-hover/row:opacity-100 md:flex"
        >
          ›
        </button>
      </div>
    </section>
  );
}

// "Top 5" no estilo Top 10 da Netflix: número grande vazado ao lado do pôster.
export function Top5({ series, vistos }: { series: Serie[]; vistos: Set<string> }) {
  return (
    <Prateleira titulo="🔥 Top 5 do Império">
      {series.slice(0, 5).map((s, i) => (
        <div key={s.id} className="flex shrink-0 snap-start items-end">
          <span
            className="-mr-4 select-none font-display text-[8.5rem] font-bold leading-[0.8] text-transparent"
            style={{ WebkitTextStroke: "3px rgb(var(--c-gold) / 0.65)" }}
            aria-hidden
          >
            {i + 1}
          </span>
          <Poster serie={s} vistos={vistos} className="w-36 sm:w-40" />
        </div>
      ))}
    </Prateleira>
  );
}

// Destaque (billboard) — usado na home e no topo da página da série. Fundo
// com a capa desfocada, texto à esquerda e o pôster nítido à direita.
export function Destaque({
  serie,
  vistos,
  modo,
}: {
  serie: Serie;
  vistos: Set<string>;
  modo: "home" | "serie";
}) {
  const prog = progressoDaSerie(serie, vistos);
  const proximo = proximoEpisodio(serie, vistos);
  const indiceProximo = proximo ? serie.episodios.findIndex((e) => e.id === proximo.id) + 1 : 0;
  const comecou = prog.feitos > 0;
  const rotuloCta = prog.pct === 100 ? "Rever do início" : comecou ? `Continuar · Aula ${indiceProximo}` : "Começar agora";

  return (
    <section className="relative overflow-hidden rounded-2xl border border-imperium-line">
      <div className="absolute inset-0 scale-110 opacity-80 blur-xl" style={{ background: fundoDaCapa(serie) }} />
      <div className="absolute inset-0 bg-gradient-to-r from-imperium-bg via-imperium-bg/70 to-imperium-bg/10" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-imperium-bg to-transparent" />

      <div className="relative grid min-h-[22rem] items-center gap-8 p-6 sm:p-10 md:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="max-w-2xl space-y-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-gold">
            {modo === "home" ? (comecou ? "Continue assistindo" : "Em destaque") : serie.tipo === "trilha" ? "Trilha oficial" : "Módulo"}
            {serie.categoria && ` · ${serie.categoria}`}
          </p>
          <h1 className="font-display text-3xl font-bold leading-tight text-stone-50 sm:text-5xl">
            {serie.icone} {serie.titulo}
          </h1>
          {serie.descricao && <p className="line-clamp-3 text-sm text-stone-300 sm:text-base">{serie.descricao}</p>}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-400">
            <span>
              {serie.episodios.length} {serie.episodios.length === 1 ? "aula" : "aulas"}
            </span>
            {comecou && (
              <span className={prog.pct === 100 ? "text-success-bright" : "text-gold-bright"}>
                {prog.feitos} de {prog.total} concluídas · {prog.pct}%
              </span>
            )}
          </div>
          {comecou && <BarraProgresso pct={prog.pct} className="max-w-sm" />}

          <div className="flex flex-wrap gap-3 pt-1">
            {serie.bloqueado ? (
              <span className="rounded-md border border-imperium-line px-5 py-2.5 text-sm text-stone-400">🔒 Liberado em um rank mais alto</span>
            ) : proximo ? (
              <Link href={urlDoEpisodio(serie.id, proximo.id)} className="inline-flex items-center gap-2 rounded-md bg-gold px-6 py-2.5 text-sm font-semibold text-imperium-bg transition hover:bg-gold-bright">
                ▶ {rotuloCta}
              </Link>
            ) : (
              <span className="rounded-md border border-imperium-line px-5 py-2.5 text-sm text-stone-500">Aulas em breve</span>
            )}
            {modo === "home" && (
              <Link href={`/academy/imperioflix/${serie.id}`} className="inline-flex items-center gap-2 rounded-md border border-stone-500/60 bg-white/10 px-5 py-2.5 text-sm text-stone-100 transition hover:bg-white/20">
                ⓘ Ver todas as aulas
              </Link>
            )}
          </div>
        </div>

        <div
          className="relative hidden aspect-[2/3] w-56 overflow-hidden rounded-xl border border-white/10 shadow-2xl md:block"
          style={{ background: fundoDaCapa(serie) }}
        >
          {!serie.capaUrl && <span className="absolute inset-0 flex items-center justify-center text-7xl">{serie.icone}</span>}
        </div>
      </div>
    </section>
  );
}
