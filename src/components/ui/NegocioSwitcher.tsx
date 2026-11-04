"use client";

import { useEffect, useTransition } from "react";
import { trocarNegocio } from "@/app/(app)/negocio-actions";

type Opcao = { slug: string; nome: string; arquivado: boolean };

/** Seletor de negócio no cabeçalho. Também aplica a identidade visual do
 *  negócio em foco (atributo data-negocio no <html>, lido pelo globals.css). */
export default function NegocioSwitcher({
  opcoes,
  atual,
  podeConsolidado,
}: {
  opcoes: Opcao[];
  atual: string | null;
  podeConsolidado: boolean;
}) {
  const [pendente, startTransition] = useTransition();

  useEffect(() => {
    const el = document.documentElement;
    if (atual) el.setAttribute("data-negocio", atual);
    else el.removeAttribute("data-negocio");
  }, [atual]);

  if (opcoes.length <= 1 && !podeConsolidado) return null;

  return (
    <label className="flex items-center gap-2 text-xs text-stone-400">
      <span className="uppercase tracking-widest">Negócio</span>
      <select
        value={atual ?? "todos"}
        disabled={pendente}
        onChange={(e) => {
          const v = e.target.value;
          startTransition(() => {
            void trocarNegocio(v);
          });
        }}
        className="rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-sm text-stone-100 focus:border-gold focus:outline-none"
      >
        {podeConsolidado && <option value="todos">Todos (consolidado)</option>}
        {opcoes.map((o) => (
          <option key={o.slug} value={o.slug}>
            {o.nome}
            {o.arquivado ? " · arquivado" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
