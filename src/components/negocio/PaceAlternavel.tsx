"use client";

import { useState, type ReactNode } from "react";

type Opcao = { chave: string; rotulo: string; conteudo: ReactNode };

/** Um pace por vez, à escolha de quem olha (ex.: recebido ou MRR), para o Mural não ficar poluído. */
export default function PaceAlternavel({ opcoes }: { opcoes: Opcao[] }) {
  const [ativa, setAtiva] = useState(opcoes[0]?.chave);
  const atual = opcoes.find((o) => o.chave === ativa) ?? opcoes[0];
  if (!atual) return null;
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5" role="tablist" aria-label="Pace a mostrar">
        {opcoes.map((o) => (
          <button
            key={o.chave}
            type="button"
            role="tab"
            aria-selected={o.chave === atual.chave}
            onClick={() => setAtiva(o.chave)}
            className={`rounded border px-3 py-1 text-xs transition-colors ${
              o.chave === atual.chave ? "border-gold bg-gold/10 text-stone-100" : "border-imperium-line text-stone-400 hover:text-stone-100"
            }`}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
      {atual.conteudo}
    </div>
  );
}
