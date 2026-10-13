"use client";

import { useMemo, useState } from "react";
import { progressoDaSerie, normalizarBusca, type Serie } from "@/lib/imperioflix-util";
import { Destaque, Poster, Prateleira, Top5 } from "./ImperioflixUi";

// Home da Imperioflix no formato Netflix: destaque no topo (a série em
// andamento ou a primeira em destaque) e prateleiras abaixo — Continue
// assistindo, Trilhas, Top 5 e uma por categoria.
export default function ImperioflixHome({
  series,
  assistidos,
  categorias,
}: {
  series: Serie[];
  assistidos: string[];
  categorias: { value: string; label: string }[];
}) {
  const vistos = useMemo(() => new Set(assistidos), [assistidos]);
  const [busca, setBusca] = useState("");

  const acessiveis = series.filter((s) => !s.bloqueado && s.episodios.length > 0);
  const emAndamento = acessiveis.filter((s) => {
    const p = progressoDaSerie(s, vistos);
    return p.feitos > 0 && p.pct < 100;
  });
  const destaqueEscolhido: Serie | undefined =
    emAndamento[0] ?? series.find((s) => s.destaque && !s.bloqueado && s.episodios.length > 0) ?? acessiveis[0] ?? series[0];

  const trilhas = series.filter((s) => s.tipo === "trilha");
  const top5 = series.filter((s) => s.tipo === "modulo" && s.destaque);
  const modulos = series.filter((s) => s.tipo === "modulo");
  const porCategoria = categorias
    .map((c) => ({ titulo: c.label, itens: modulos.filter((m) => m.categoria === c.value) }))
    .filter((p) => p.itens.length > 0);
  const semCategoria = modulos.filter((m) => !m.categoria || !categorias.some((c) => c.value === m.categoria));

  const termo = normalizarBusca(busca);
  const resultados = termo
    ? series.filter((s) => normalizarBusca(`${s.titulo} ${s.descricao ?? ""} ${s.episodios.map((e) => e.titulo).join(" ")}`).includes(termo))
    : [];

  if (series.length === 0) {
    return <p className="rounded-xl border border-imperium-line px-6 py-16 text-center text-sm text-stone-500">Nenhum conteúdo disponível ainda.</p>;
  }

  return (
    <div className="space-y-10">
      <div className="flex justify-end">
        <label className="relative block w-full sm:w-72">
          <span className="sr-only">Buscar conteúdo</span>
          <input
            id="busca-imperioflix"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar trilha, módulo ou aula…"
            className="input-imp w-full pl-9 text-sm"
          />
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-500">🔍</span>
        </label>
      </div>

      {termo ? (
        <section className="space-y-3">
          <h2 className="font-display text-xl text-stone-100">
            {resultados.length} resultado{resultados.length === 1 ? "" : "s"} para &quot;{busca.trim()}&quot;
          </h2>
          {resultados.length === 0 ? (
            <p className="text-sm text-stone-500">Nada encontrado. Tente outra palavra.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {resultados.map((s) => (
                <Poster key={s.id} serie={s} vistos={vistos} className="w-full" />
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {destaqueEscolhido && <Destaque serie={destaqueEscolhido} vistos={vistos} modo="home" />}

          {emAndamento.length > 0 && (
            <Prateleira titulo="Continue assistindo">
              {emAndamento.map((s) => (
                <Poster key={s.id} serie={s} vistos={vistos} className="w-40 sm:w-48" />
              ))}
            </Prateleira>
          )}

          {trilhas.length > 0 && (
            <Prateleira titulo="Trilhas de formação">
              {trilhas.map((s) => (
                <Poster key={s.id} serie={s} vistos={vistos} className="w-40 sm:w-48" />
              ))}
            </Prateleira>
          )}

          {top5.length > 0 && <Top5 series={top5} vistos={vistos} />}

          {porCategoria.map((p) => (
            <Prateleira key={p.titulo} titulo={p.titulo}>
              {p.itens.map((s) => (
                <Poster key={s.id} serie={s} vistos={vistos} className="w-40 sm:w-48" />
              ))}
            </Prateleira>
          ))}

          {semCategoria.length > 0 && (
            <Prateleira titulo="Mais conteúdos">
              {semCategoria.map((s) => (
                <Poster key={s.id} serie={s} vistos={vistos} className="w-40 sm:w-48" />
              ))}
            </Prateleira>
          )}
        </>
      )}
    </div>
  );
}
