"use client";

import { useEffect, useTransition } from "react";
import { trocarNegocio, trocarVisual } from "@/app/(app)/negocio-actions";
import { VISUAIS, VISUAL_AUTO } from "@/lib/negocios";

type Opcao = { slug: string; nome: string; arquivado: boolean };

/** Seletor de negócio no cabeçalho. Também aplica a identidade visual do
 *  negócio em foco (atributo data-negocio no <html>, lido pelo globals.css). */
export default function NegocioSwitcher({
  opcoes,
  atual,
  visual,
  visualEscolhido,
  podeConsolidado,
}: {
  opcoes: Opcao[];
  atual: string | null;
  /** slug do visual aplicado agora (null = padrão Senatus) */
  visual: string | null;
  /** valor do cookie: auto, padrao ou slug */
  visualEscolhido: string;
  podeConsolidado: boolean;
}) {
  const [pendente, startTransition] = useTransition();

  useEffect(() => {
    const el = document.documentElement;
    if (visual) el.setAttribute("data-negocio", visual);
    else el.removeAttribute("data-negocio");
  }, [visual]);

  if (opcoes.length <= 1 && !podeConsolidado) return null;

  return (
    <div className="flex items-center gap-3">
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
    <label className="flex items-center gap-2 text-xs text-stone-400">
      <span className="uppercase tracking-widest">Visual</span>
      <select
        value={visualEscolhido}
        disabled={pendente}
        onChange={(e) => {
          const v = e.target.value;
          startTransition(() => {
            void trocarVisual(v);
          });
        }}
        className="rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-sm text-stone-100 focus:border-gold focus:outline-none"
      >
        <option value={VISUAL_AUTO}>Automático (do negócio)</option>
        {VISUAIS.map((v) => (
          <option key={v.slug} value={v.slug}>
            {v.nome}
          </option>
        ))}
      </select>
    </label>
    </div>
  );
}
