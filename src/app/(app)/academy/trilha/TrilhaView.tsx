"use client";

import { useMemo, useState } from "react";
import type { Trilha, Aula, Material } from "@/lib/academy";
import { visualDaTrilha } from "@/lib/academy-visual";
import MonthCalendar, { type EventoCalendario } from "@/components/academy/MonthCalendar";

function fmtData(iso: string | null) {
  if (!iso) return "sem data";
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", weekday: "short" });
}

export default function TrilhaView({
  trilhas,
  aulasPorTrilha,
  materiaisPorAula,
}: {
  trilhas: Trilha[];
  aulasPorTrilha: Record<string, Aula[]>;
  materiaisPorAula: Record<string, Material[]>;
}) {
  const [trilhaSelecionada, setTrilhaSelecionada] = useState<string>(trilhas[0]?.id ?? "");
  const trilhaPorId = useMemo(() => Object.fromEntries(trilhas.map((t) => [t.id, t])), [trilhas]);

  const todasAulas = trilhas.flatMap((t) => aulasPorTrilha[t.id] ?? []);

  const eventos: EventoCalendario[] = useMemo(
    () =>
      todasAulas
        .filter((a) => a.data)
        .map((a) => {
          const trilha = trilhaPorId[a.trilhaId];
          const visual = visualDaTrilha(trilha?.nome ?? "");
          return {
            id: a.id,
            data: a.data as string,
            tema: a.tema,
            trilhaNome: trilha?.nome ?? "—",
            cor: visual.cor,
            icone: visual.icone,
            marco: a.marco,
            realizada: a.realizada,
          };
        }),
    [todasAulas, trilhaPorId]
  );

  const legenda = trilhas.map((t) => {
    const v = visualDaTrilha(t.nome);
    return { nome: t.nome, cor: v.cor, icone: v.icone };
  });

  const trilhaAtual = trilhaPorId[trilhaSelecionada];
  const aulasAtual = (aulasPorTrilha[trilhaSelecionada] ?? []).slice().sort((a, b) => a.ordem - b.ordem);
  const visualAtual = trilhaAtual ? visualDaTrilha(trilhaAtual.nome) : null;
  const total = aulasAtual.length;
  const feitas = aulasAtual.filter((a) => a.realizada).length;
  const pct = total > 0 ? Math.round((feitas / total) * 100) : 0;
  const hoje = new Date().toISOString().slice(0, 10);
  const proxima = aulasAtual.find((a) => !a.realizada && (a.data ?? "9999") >= hoje);

  if (trilhas.length === 0) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="font-display text-2xl text-gold-bright">Imperium Academy</h1>
        <p className="mt-2 text-sm text-stone-500">Nenhuma trilha de formação configurada pro seu cargo ainda.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Imperium Academy</h1>
        <p className="text-xs text-stone-400">Trilha de Formação — sua jornada de aprendizado.</p>
      </div>

      <MonthCalendar eventos={eventos} legenda={legenda} />

      {trilhas.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {trilhas.map((t) => {
            const v = visualDaTrilha(t.nome);
            const ativa = t.id === trilhaSelecionada;
            return (
              <button
                key={t.id}
                onClick={() => setTrilhaSelecionada(t.id)}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition"
                style={ativa ? { background: v.gradiente, color: "#fff" } : { border: `1px solid ${v.cor}55`, color: v.cor, background: v.bg }}
              >
                {v.icone} {t.nome}
              </button>
            );
          })}
        </div>
      )}

      {trilhaAtual && visualAtual && (
        <section className="card-imp space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg p-4 text-white" style={{ background: visualAtual.gradiente }}>
            <div>
              <p className="text-xs uppercase tracking-wide opacity-80">Sua jornada</p>
              <h2 className="font-display text-xl">{visualAtual.icone} {trilhaAtual.nome}</h2>
              {proxima && <p className="mt-1 text-xs opacity-90">Próxima aula: {fmtData(proxima.data)} — {proxima.tema}</p>}
            </div>
            <div className="text-right">
              <p className="font-display text-3xl">{pct}%</p>
              <p className="text-[10px] uppercase tracking-wide opacity-80">{feitas}/{total} aulas concluídas</p>
            </div>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-imperium-bg/60">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: visualAtual.gradiente }} />
          </div>

          <div className="space-y-2">
            {aulasAtual.map((aula) => {
              const materiais = materiaisPorAula[aula.id] ?? [];
              return (
                <div
                  key={aula.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border border-imperium-line p-3"
                  style={{
                    borderLeftColor: visualAtual.cor,
                    borderLeftWidth: 3,
                    opacity: aula.realizada ? 1 : aula.data && aula.data < hoje ? 0.6 : 1,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      style={{ background: aula.realizada ? visualAtual.gradiente : "transparent", border: `1px solid ${visualAtual.cor}`, color: aula.realizada ? "#fff" : visualAtual.cor }}
                    >
                      {aula.realizada ? "✓" : String(aula.ordem).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="text-sm text-stone-100">
                        {aula.marco && "★ "}
                        {aula.tema}
                      </p>
                      <p className="text-[11px] text-stone-500">
                        {fmtData(aula.data)} · {aula.instrutorNome ?? "instrutor a definir"}
                      </p>
                    </div>
                  </div>
                  {materiais.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {materiais.map((m) => (
                        <a
                          key={m.id}
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full px-2 py-1 text-[10px] hover:underline"
                          style={{ background: visualAtual.bg, color: visualAtual.cor }}
                        >
                          📎 {m.nome}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
