"use client";

import { useState, useTransition } from "react";
import { enviarLinkAcesso } from "@/app/(app)/gestao/actions";

export default function EnviarAcessoForm({ profileId, emailAtual }: { profileId: string; emailAtual: string | null }) {
  const [email, setEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  function enviar() {
    if (!email.trim()) return;
    setResultado(null);
    const fd = new FormData();
    fd.set("profile_id", profileId);
    fd.set("email_real", email.trim());
    startTransition(async () => {
      try {
        const r = await enviarLinkAcesso(fd);
        setResultado({ tipo: "ok", texto: `Link enviado pra ${r.email}.` });
        setEmail("");
      } catch (e) {
        setResultado({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao enviar." });
      }
    });
  }

  return (
    <div className="rounded border border-imperium-line bg-imperium-bg/40 p-2.5">
      <p className="mb-1.5 text-[10px] uppercase tracking-wide text-stone-500">
        Email atual: <span className="text-stone-400">{emailAtual ?? "—"}</span>
      </p>
      <div className="flex items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email.real@dominio.com"
          className="input-imp flex-1 px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={isPending || !email.trim()}
          className="btn-outline shrink-0 px-3 py-1.5 text-xs"
        >
          {isPending ? "Enviando..." : "Trocar e enviar link"}
        </button>
      </div>
      {resultado && (
        <p className={`mt-1.5 text-[11px] ${resultado.tipo === "ok" ? "text-success-bright" : "text-wine-bright"}`}>
          {resultado.texto}
        </p>
      )}
    </div>
  );
}
