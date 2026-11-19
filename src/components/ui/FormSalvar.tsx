"use client";

import { useState, useTransition, type ReactNode } from "react";

/**
 * Formulário que chama uma Server Action e mostra o retorno na tela ("Salvando…", "Salvo às HH:MM" ou o erro),
 * para quem digita não ficar clicando sem saber se gravou. Ignora o clique enquanto o anterior ainda está salvando.
 */
export default function FormSalvar({ action, className, children }: { action: (formData: FormData) => Promise<void>; className?: string; children: ReactNode }) {
  const [pendente, iniciar] = useTransition();
  const [retorno, setRetorno] = useState<{ ok: boolean; texto: string } | null>(null);

  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (pendente) return;
        const dados = new FormData(e.currentTarget);
        setRetorno(null);
        iniciar(async () => {
          try {
            await action(dados);
            const hora = new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
            setRetorno({ ok: true, texto: "Salvo às " + hora });
          } catch (erro) {
            setRetorno({ ok: false, texto: erro instanceof Error && erro.message ? "Não salvou: " + erro.message : "Não salvou. Tente de novo." });
          }
        });
      }}
    >
      {children}
      <div aria-live="polite" className="min-h-[1.25rem] text-xs">
        {pendente && <span className="text-stone-400">Salvando…</span>}
        {!pendente && retorno && <span className={retorno.ok ? "text-success-bright" : "text-wine-bright"}>{retorno.texto}</span>}
      </div>
    </form>
  );
}
