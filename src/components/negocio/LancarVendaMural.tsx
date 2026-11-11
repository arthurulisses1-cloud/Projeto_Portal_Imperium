"use client";

import { useState, type ReactNode } from "react";

export type FormPorNegocio = { slug: string; nome: string; cor: string; form: ReactNode };

/** Atalho do Mural para lançar uma venda sem sair da tela: escolhe o negócio e abre o formulário dele. */
export default function LancarVendaMural({ itens }: { itens: FormPorNegocio[] }) {
  const [aberto, setAberto] = useState(false);
  const [slug, setSlug] = useState(itens[0]?.slug ?? "");
  const atual = itens.find((i) => i.slug === slug) ?? itens[0];
  if (!atual) return null;
  return (
    <div className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">Lançar venda</p>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="rounded border border-gold/50 bg-gold/10 px-3 py-1 text-sm text-gold-bright hover:bg-gold/20"
        >
          {aberto ? "Fechar" : "+ Lançar venda"}
        </button>
      </div>
      {aberto && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {itens.map((i) => (
              <button
                key={i.slug}
                type="button"
                onClick={() => setSlug(i.slug)}
                className={`rounded border px-3 py-1 text-sm ${i.slug === atual.slug ? "text-stone-100" : "border-imperium-line text-stone-400 hover:text-stone-100"}`}
                style={i.slug === atual.slug ? { borderColor: `rgb(${i.cor})`, backgroundColor: `rgb(${i.cor} / 0.15)` } : undefined}
              >
                {i.nome}
              </button>
            ))}
          </div>
          <div key={atual.slug}>{atual.form}</div>
        </div>
      )}
    </div>
  );
}
