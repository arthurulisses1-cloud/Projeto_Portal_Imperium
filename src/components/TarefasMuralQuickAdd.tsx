"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarTarefa } from "@/app/(app)/tarefas/actions";

// Cardzinho simplificado (Nome + Prazo) pedido pelo Diretor (2026-08-27) —
// diferente do Quick Add de /tarefas, que é NLP num campo só ("ligar pro
// João amanhã às 14h"). Aqui é formulário mesmo, sem IA no meio, porque o
// Mural é pra ser rápido de bater o olho, não de escrever frase.
export default function TarefasMuralQuickAdd() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [prazo, setPrazo] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    const fd = new FormData();
    fd.set("titulo", titulo.trim());
    fd.set("due_date", prazo);
    startTransition(async () => {
      await criarTarefa(fd);
      setTitulo("");
      setPrazo("");
      setAberto(false);
      router.refresh();
    });
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => {
          setAberto(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="mt-3 text-[11px] text-stone-500 hover:text-gold-bright hover:underline"
      >
        + Nova tarefa rápida
      </button>
    );
  }

  return (
    <form onSubmit={salvar} className="mt-3 space-y-1.5 rounded-md border border-imperium-line bg-imperium-bg/50 p-2.5">
      <input
        ref={inputRef}
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="Nome da tarefa"
        className="input-imp w-full text-sm"
      />
      <div className="flex items-center gap-2">
        <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="input-imp flex-1 text-sm" />
        <button type="submit" disabled={isPending || !titulo.trim()} className="btn-outline px-3 py-1.5 text-xs">
          {isPending ? "..." : "Criar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAberto(false);
            setTitulo("");
            setPrazo("");
          }}
          className="text-xs text-stone-500 hover:text-stone-300"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
