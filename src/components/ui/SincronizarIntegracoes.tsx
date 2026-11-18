"use client";

import { useState, useTransition } from "react";
import { sincronizarTodasIntegracoes, type RespostaSincronizarTudo } from "@/app/(app)/sincronizar-integracoes/actions";

/** Botão do Diretor: sincroniza de uma vez as integrações de todos os negócios (3C Plus, Pipefácil e Sunne). */
export default function SincronizarIntegracoes() {
  const [isPending, startTransition] = useTransition();
  const [resposta, setResposta] = useState<RespostaSincronizarTudo | null>(null);
  const [quando, setQuando] = useState<string | null>(null);

  function handleClick() {
    setResposta(null);
    startTransition(async () => {
      try {
        const r = await sincronizarTodasIntegracoes();
        setResposta(r);
        setQuando(new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }));
      } catch (e) {
        setResposta({ ok: false, mensagem: e instanceof Error ? e.message : "Erro ao sincronizar. Tente de novo.", erros: [], negocios: 0 });
      }
    });
  }

  return (
    <div>
      <button onClick={handleClick} disabled={isPending} className="btn-gold w-full py-1.5 text-xs">
        {isPending ? "Sincronizando integrações..." : "Sincronizar todas as integrações"}
      </button>
      {isPending && <p className="mt-1.5 text-[10px] text-stone-500">Pode levar até 1 minuto.</p>}
      {resposta && (
        <div className="mt-1.5 text-[11px]">
          <p className={resposta.ok ? "text-success-bright" : "text-wine-bright"}>
            {resposta.mensagem}
            {quando && resposta.ok && <span className="text-stone-500"> · {quando}</span>}
          </p>
          {resposta.erros.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-stone-400">
              {resposta.erros.slice(0, 5).map((e, i) => (
                <li key={i} className="break-words">
                  {e}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
