"use client";

import { useState, useTransition } from "react";
import { excluirUsuario } from "@/app/(app)/gestao/actions";

export default function ExcluirUsuarioButton({ profileId, nome }: { profileId: string; nome: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function excluir() {
    setErro(null);
    const fd = new FormData();
    fd.set("profile_id", profileId);
    startTransition(async () => {
      try {
        await excluirUsuario(fd);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao excluir.");
        setConfirmando(false);
      }
    });
  }

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="text-[10px] text-stone-600 hover:text-wine-bright"
      >
        Excluir usuário
      </button>
    );
  }

  return (
    <div className="rounded border border-wine/50 bg-wine/10 p-2">
      <p className="text-[11px] text-wine-bright">
        Apaga {nome} e TODO o dado dele(a) (vendas, produção, comentários...) pra sempre. Sem volta.
      </p>
      <div className="mt-1.5 flex gap-2">
        <button
          type="button"
          onClick={excluir}
          disabled={isPending}
          className="rounded bg-wine px-2 py-1 text-[10px] text-white hover:bg-wine-bright"
        >
          {isPending ? "Excluindo..." : "Sim, apagar de vez"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          disabled={isPending}
          className="btn-outline px-2 py-1 text-[10px]"
        >
          Cancelar
        </button>
      </div>
      {erro && <p className="mt-1.5 text-[11px] text-wine-bright">{erro}</p>}
    </div>
  );
}
