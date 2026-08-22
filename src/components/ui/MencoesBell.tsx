"use client";

import { useState, useTransition } from "react";
import { marcarMencaoLida } from "@/app/(app)/social-actions";
import { IconBell } from "./icons";
import type { AlvoTipo } from "@/lib/social";

type Mencao = {
  id: string;
  comentarioTexto: string;
  autorNome: string;
  alvoTipo: AlvoTipo;
  alvoId: string;
};

export default function MencoesBell({ mencoes }: { mencoes: Mencao[] }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (mencoes.length === 0) return null;

  function irParaPost(m: Mencao) {
    setOpen(false);
    const fd = new FormData();
    fd.set("id", m.id);
    startTransition(() => marcarMencaoLida(fd));
    const ancora = m.alvoTipo === "mural_post" ? `post-${m.alvoId}` : `campanha-${m.alvoId}`;
    window.location.hash = ancora;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-imperium-line text-stone-300 hover:border-gold/50 hover:text-gold"
        title="Você foi marcado"
      >
        <IconBell className="h-4 w-4" />
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-wine px-1 text-[9px] text-white">
          {mencoes.length}
        </span>
      </button>

      {open && (
        <>
          <button aria-label="Fechar" onClick={() => setOpen(false)} className="fixed inset-0 z-10 cursor-default" />
          <div className="absolute right-0 top-12 z-20 w-72 rounded border border-imperium-line bg-imperium-surface p-2 shadow-xl">
            <p className="mb-1.5 px-1 text-[10px] uppercase tracking-wide text-stone-500">Você foi marcado</p>
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {mencoes.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => irParaPost(m)}
                    disabled={isPending}
                    className="block w-full rounded px-2 py-1.5 text-left text-xs text-stone-300 hover:bg-imperium-raised"
                  >
                    <span className="text-gold-bright">{m.autorNome}</span> marcou você: {m.comentarioTexto}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
