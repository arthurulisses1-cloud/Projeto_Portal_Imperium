"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { salvarOrdemSlides } from "./actions";

export default function ConfigView({
  ordemInicial,
  labelPorChave,
}: {
  ordemInicial: string[];
  labelPorChave: Record<string, string>;
}) {
  const [ordem, setOrdem] = useState(ordemInicial);
  const [isPending, startTransition] = useTransition();
  const [salvo, setSalvo] = useState(false);

  function mover(i: number, direcao: -1 | 1) {
    const j = i + direcao;
    if (j < 0 || j >= ordem.length) return;
    const nova = [...ordem];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setOrdem(nova);
    setSalvo(false);
  }

  function salvar() {
    const fd = new FormData();
    fd.set("ordem", ordem.join(","));
    startTransition(async () => {
      await salvarOrdemSlides(fd);
      setSalvo(true);
    });
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Ordem do Painel TV</h1>
        <p className="text-xs text-stone-400">
          Arraste a prioridade das telas com as setas — a ordem aqui é a ordem do rodízio em{" "}
          <Link href="/tv" className="text-gold hover:underline">/tv</Link>.
        </p>
      </div>

      <div className="space-y-2">
        {ordem.map((chave, i) => (
          <div key={chave} className="flex items-center gap-3 rounded border border-imperium-line bg-imperium-surface px-4 py-3">
            <span className="font-display text-sm text-stone-500">{i + 1}</span>
            <span className="flex-1 text-sm text-stone-100">{labelPorChave[chave] ?? chave}</span>
            <button
              type="button"
              onClick={() => mover(i, -1)}
              disabled={i === 0}
              className="text-stone-400 hover:text-gold disabled:opacity-20"
              title="Mover pra cima"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => mover(i, 1)}
              disabled={i === ordem.length - 1}
              className="text-stone-400 hover:text-gold disabled:opacity-20"
              title="Mover pra baixo"
            >
              ▼
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={salvar} disabled={isPending} className="btn-gold px-4 py-2 text-sm">
          {isPending ? "Salvando…" : "Salvar ordem"}
        </button>
        {salvo && !isPending && <span className="text-xs text-success-bright">✓ Salvo</span>}
      </div>
    </main>
  );
}
