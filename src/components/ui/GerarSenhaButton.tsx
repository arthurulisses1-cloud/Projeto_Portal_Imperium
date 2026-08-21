"use client";

import { useState, useTransition } from "react";
import { gerarSenhaNova } from "@/app/(app)/gestao/actions";
import { IconCheck } from "./icons";

export default function GerarSenhaButton({ profileId }: { profileId: string }) {
  const [isPending, startTransition] = useTransition();
  const [senha, setSenha] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  function gerar() {
    setErro(null);
    setSenha(null);
    setCopiado(false);
    const fd = new FormData();
    fd.set("profile_id", profileId);
    startTransition(async () => {
      try {
        const r = await gerarSenhaNova(fd);
        setSenha(r.senha);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao gerar senha.");
      }
    });
  }

  function copiar() {
    if (!senha) return;
    navigator.clipboard.writeText(senha);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div>
      <button
        type="button"
        onClick={gerar}
        disabled={isPending}
        className="btn-outline px-3 py-1.5 text-xs"
      >
        {isPending ? "Gerando..." : "Gerar senha nova"}
      </button>

      {senha && (
        <div className="mt-2 rounded border border-gold/50 bg-gold/10 p-2.5">
          <p className="text-[10px] uppercase tracking-wide text-gold">
            Essa senha só aparece agora — copie e mande pra pessoa
          </p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 rounded bg-imperium-bg px-2 py-1 text-sm text-gold-bright">{senha}</code>
            <button
              type="button"
              onClick={copiar}
              className="btn-outline flex shrink-0 items-center gap-1 px-2 py-1 text-[10px]"
            >
              {copiado ? (
                <>
                  <IconCheck className="h-3 w-3" /> Copiado
                </>
              ) : (
                "Copiar"
              )}
            </button>
          </div>
        </div>
      )}

      {erro && <p className="mt-1.5 text-[11px] text-wine-bright">{erro}</p>}
    </div>
  );
}
