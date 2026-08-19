"use client";

import { useState, useTransition } from "react";
import { dispararSyncManual } from "@/app/(app)/gestao/actions";

export default function SincronizarPlanilha({ compact = false }: { compact?: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{
    funilLinhasGravadas: number;
    vendasInseridas: number;
    naoEncontrados: string[];
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function handleClick() {
    setErro(null);
    setResultado(null);
    startTransition(async () => {
      try {
        const r = await dispararSyncManual();
        setResultado(r);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro desconhecido ao sincronizar.");
      }
    });
  }

  if (compact) {
    return (
      <div>
        <button onClick={handleClick} disabled={isPending} className="btn-gold w-full py-1.5 text-xs">
          {isPending ? "Sincronizando..." : "Sincronizar planilha"}
        </button>
        {erro && <p className="mt-1.5 text-[11px] text-wine-bright">{erro}</p>}
        {resultado && (
          <p className="mt-1.5 text-[11px] text-emerald-400">
            {resultado.funilLinhasGravadas} linhas de funil, {resultado.vendasInseridas} vendas
            {resultado.naoEncontrados.length > 0 && (
              <span className="text-gold-dim"> · {resultado.naoEncontrados.length} nome(s) não bateram</span>
            )}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <button onClick={handleClick} disabled={isPending} className="btn-gold px-4 py-2 text-sm">
          {isPending ? "Sincronizando..." : "Sincronizar agora"}
        </button>
        <p className="text-xs text-stone-500">
          O sync automático roda 1x por dia (madrugada). Use isso pra puxar os dados mais recentes da
          planilha agora.
        </p>
      </div>

      {erro && <p className="mt-3 text-sm text-wine-bright">{erro}</p>}

      {resultado && (
        <div className="mt-3 space-y-1 text-sm">
          <p className="text-emerald-400">
            Sincronizado: {resultado.funilLinhasGravadas} linhas de funil, {resultado.vendasInseridas}{" "}
            vendas.
          </p>
          {resultado.naoEncontrados.length > 0 && (
            <p className="text-gold-dim">
              {resultado.naoEncontrados.length} nome(s) da planilha não bateram com nenhum perfil
              cadastrado: {resultado.naoEncontrados.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
