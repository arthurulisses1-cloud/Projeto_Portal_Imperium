"use client";

import { useRef, useState, useTransition } from "react";
import { perguntarMinerva, type MensagemChat } from "@/app/(app)/minerva/actions";
import { IconEagle } from "@/components/ui/icons";

const SUGESTOES = ["Quem está zerado esse mês?", "Qual o gap da minha operação?", "Como está a produção do time?"];

export default function MinervaChat() {
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [pergunta, setPergunta] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fimRef = useRef<HTMLDivElement>(null);

  function enviar(texto?: string) {
    const p = (texto ?? pergunta).trim();
    if (!p || isPending) return;
    setErro(null);
    setPergunta("");
    const historico = mensagens;
    setMensagens((atual) => [...atual, { papel: "user", texto: p }]);
    startTransition(async () => {
      const r = await perguntarMinerva(historico, p);
      if ("erro" in r) {
        setErro(r.erro);
      } else {
        setMensagens((atual) => [...atual, { papel: "assistant", texto: r.resposta }]);
      }
      requestAnimationFrame(() => fimRef.current?.scrollIntoView({ behavior: "smooth" }));
    });
  }

  return (
    <div className="flex flex-col rounded border border-imperium-line bg-imperium-surface">
      <div className="max-h-[60vh] min-h-[240px] space-y-4 overflow-y-auto p-5">
        {mensagens.length === 0 && (
          <div className="watermark-spqr flex flex-col items-center py-10 text-center">
            <IconEagle className="h-10 w-10 text-gold/40" />
            <p className="mt-3 text-sm text-stone-500">Pergunte qualquer coisa sobre os dados do seu escopo.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => enviar(s)}
                  className="rounded-full border border-imperium-line px-3 py-1.5 text-xs text-stone-400 transition hover:border-gold/50 hover:text-gold"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensagens.map((m, i) => (
          <div key={i} className={`flex ${m.papel === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-sm ${
                m.papel === "user"
                  ? "bg-gold text-imperium-bg"
                  : "border border-imperium-line bg-imperium-bg/60 text-stone-200"
              }`}
            >
              {m.texto}
            </div>
          </div>
        ))}

        {isPending && (
          <div className="flex justify-start">
            <div className="rounded-lg border border-imperium-line bg-imperium-bg/60 px-3.5 py-2.5 text-sm text-stone-500">
              Consultando os dados...
            </div>
          </div>
        )}

        {erro && (
          <div className="flex justify-start">
            <div className="rounded-lg border border-wine/40 bg-wine/10 px-3.5 py-2.5 text-sm text-wine-bright">{erro}</div>
          </div>
        )}
        <div ref={fimRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-imperium-line p-3">
        <input
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
          placeholder="Pergunte à Minerva..."
          className="input-imp flex-1 text-sm"
        />
        <button
          type="button"
          onClick={() => enviar()}
          disabled={isPending || !pergunta.trim()}
          className="btn-gold px-4 py-2 text-xs"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
