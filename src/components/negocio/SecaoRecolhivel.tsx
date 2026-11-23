"use client";

import { useState, type ReactNode } from "react";

/** Seção que começa fechada, com um botão para abrir e fechar e o resumo sempre à vista. */
export function SecaoRecolhivel({ titulo, resumo, children }: { titulo: string; resumo?: string; children: ReactNode }) {
  const [aberta, setAberta] = useState(false);
  return (
    <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">{titulo}</p>
          {resumo && <p className="text-xs text-stone-400">{resumo}</p>}
        </div>
        <button
          type="button"
          aria-expanded={aberta}
          onClick={() => setAberta(!aberta)}
          className="rounded border border-imperium-line px-3 py-1 text-xs text-stone-300 hover:text-stone-100"
        >
          {aberta ? "Fechar ▴" : "Abrir ▾"}
        </button>
      </div>
      {aberta && <div className="mt-4">{children}</div>}
    </section>
  );
}
