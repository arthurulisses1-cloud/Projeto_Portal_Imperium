"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarRealizado } from "@/app/(app)/negocio/actions";

/** Força a sincronização do realizado (3C Plus + Pipefácil) do negócio aberto. */
export function BotaoAtualizarRealizado({ slug }: { slug: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  function clicar() {
    setMsg(null);
    iniciar(async () => {
      try {
        const r = await atualizarRealizado(slug);
        setMsg({ ok: r.ok, texto: r.mensagem });
        if (r.ok) router.refresh();
      } catch {
        setMsg({ ok: false, texto: "Não foi possível atualizar agora." });
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={clicar}
        disabled={pendente}
        className="rounded border border-imperium-line px-2 py-0.5 text-[11px] text-stone-300 transition hover:border-gold/60 hover:text-gold-bright disabled:cursor-wait disabled:opacity-60"
      >
        {pendente ? "Atualizando…" : "Atualizar agora"}
      </button>
      {msg && !pendente && <span className={`text-[11px] ${msg.ok ? "text-success-bright" : "text-wine-bright"}`}>{msg.texto}</span>}
    </span>
  );
}
