"use client";

import { useState, useTransition } from "react";
import { dispararSyncManual } from "@/app/(app)/gestao/actions";

function formatarHora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SincronizarPlanilha({
  compact = false,
  ultimaSyncInicial = null,
}: {
  compact?: boolean;
  ultimaSyncInicial?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{
    funilLinhasGravadas: number;
    vendasInseridas: number;
    naoEncontrados: string[];
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Começa com o que já veio do servidor (última sync — inclusive as
  // automáticas do GitHub Actions/cron); atualiza na hora se essa mesma
  // aba disparar uma sync manual com sucesso.
  const [ultimaSync, setUltimaSync] = useState(ultimaSyncInicial);

  function handleClick() {
    setErro(null);
    setResultado(null);
    startTransition(async () => {
      try {
        const r = await dispararSyncManual();
        setResultado(r);
        setUltimaSync(new Date().toISOString());
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
        {ultimaSync && <p className="mt-1.5 text-[10px] text-stone-500">Última sync em {formatarHora(ultimaSync)}</p>}
        {erro && <p className="mt-1.5 text-[11px] text-wine-bright">{erro}</p>}
        {resultado && (
          <p className="mt-1.5 text-[11px] text-success-bright">
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
          O sync automático roda sozinho de 30 em 30 minutos em horário comercial. Use isso pra puxar os
          dados mais recentes da planilha na hora.
        </p>
      </div>

      {ultimaSync && <p className="mt-2 text-xs text-stone-500">Última sync em {formatarHora(ultimaSync)}</p>}

      {erro && <p className="mt-3 text-sm text-wine-bright">{erro}</p>}

      {resultado && (
        <div className="mt-3 space-y-1 text-sm">
          <p className="text-success-bright">
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
