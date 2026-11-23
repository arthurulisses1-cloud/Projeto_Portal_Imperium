"use client";
// Filtro de múltipla seleção para formulários GET: cada opção marcada vira um campo repetido (?nome=A&nome=B).
// Tudo marcado (ou nada) = sem filtro: nenhum campo é enviado.
import { useEffect, useRef, useState } from "react";

export function FiltroMultiplo({ nome, rotulo, opcoes, selecionadas }: { nome: string; rotulo: string; opcoes: string[]; selecionadas: string[] }) {
  const [marcadas, setMarcadas] = useState<string[]>(selecionadas.length > 0 ? selecionadas : opcoes);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const semFiltro = marcadas.length === 0 || marcadas.length === opcoes.length;
  const desmarcadas = opcoes.filter((o) => !marcadas.includes(o));
  const resumo = semFiltro
    ? "Todas"
    : marcadas.length === 1
      ? marcadas[0]
      : desmarcadas.length === 1
        ? `Todas menos ${desmarcadas[0]}`
        : `${marcadas.length} de ${opcoes.length}`;
  const alternar = (o: string) => setMarcadas((m) => (m.includes(o) ? m.filter((x) => x !== o) : [...m, o]));

  return (
    <div ref={caixa} className="relative flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-stone-500">{rotulo}</span>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-label={`${rotulo}: ${resumo}`}
        className="flex max-w-60 items-center gap-2 rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-left text-stone-200"
      >
        <span className="truncate">{resumo}</span>
        <span aria-hidden="true" className="text-[10px] text-stone-500">▾</span>
      </button>
      {!semFiltro && marcadas.map((o) => <input key={o} type="hidden" name={nome} value={o} />)}
      {aberto && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 max-w-[85vw] rounded-md border border-imperium-line bg-imperium-raised p-2 shadow-lg">
          <div className="mb-1 flex gap-3 border-b border-imperium-line px-1 pb-1.5 text-xs">
            <button type="button" onClick={() => setMarcadas(opcoes)} className="text-gold-bright hover:underline">
              Marcar todas
            </button>
            <button type="button" onClick={() => setMarcadas([])} className="text-stone-400 hover:underline">
              Desmarcar todas
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {opcoes.map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-stone-200 hover:bg-imperium-surface">
                <input type="checkbox" checked={marcadas.includes(o)} onChange={() => alternar(o)} className="accent-current" />
                {o}
              </label>
            ))}
          </div>
          <button type="submit" className="mt-2 w-full rounded border border-gold/60 px-3 py-1 text-gold-bright hover:bg-gold/10">
            Filtrar
          </button>
        </div>
      )}
    </div>
  );
}
