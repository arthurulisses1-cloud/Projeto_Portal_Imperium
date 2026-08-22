"use client";

import { useRef, useState, useTransition } from "react";
import { perguntarMinerva, type MensagemChat } from "@/app/(app)/minerva-actions";

const SUGESTOES = ["Quem está zerado esse mês?", "Qual o gap da minha operação?", "Como está a produção do time?"];

export default function MinervaWidget() {
  const [aberto, setAberto] = useState(false);
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
    <div className="fixed bottom-5 left-5 z-40">
      {aberto && (
        <div className="mb-3 flex h-[32rem] w-80 flex-col overflow-hidden rounded-lg border border-gold/40 bg-imperium-surface shadow-2xl sm:w-96">
          <div className="flex items-center gap-2.5 border-b border-imperium-line px-4 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/crests/minerva.png" alt="Minerva" className="h-8 w-8 shrink-0 rounded-full border border-gold/50 object-cover" />
            <div className="min-w-0">
              <p className="font-display text-sm text-gold-bright">Minerva</p>
              <p className="truncate text-[10px] text-stone-500">Pergunte sobre os dados do seu escopo</p>
            </div>
            <button
              onClick={() => setAberto(false)}
              className="ml-auto shrink-0 rounded p-1 text-stone-500 hover:text-gold-bright"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {mensagens.length === 0 && (
              <div className="flex flex-col items-center py-6 text-center">
                <p className="text-xs text-stone-500">Pergunte qualquer coisa sobre os dados do seu escopo.</p>
                <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                  {SUGESTOES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => enviar(s)}
                      className="rounded-full border border-imperium-line px-2.5 py-1 text-[10px] text-stone-400 transition hover:border-gold/50 hover:text-gold"
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
                  className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-xs ${
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
                <div className="rounded-lg border border-imperium-line bg-imperium-bg/60 px-3 py-2 text-xs text-stone-500">
                  Consultando os dados...
                </div>
              </div>
            )}

            {erro && (
              <div className="flex justify-start">
                <div className="rounded-lg border border-wine/40 bg-wine/10 px-3 py-2 text-xs text-wine-bright">{erro}</div>
              </div>
            )}
            <div ref={fimRef} />
          </div>

          <div className="flex items-center gap-2 border-t border-imperium-line p-2.5">
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
              className="input-imp flex-1 text-xs"
            />
            <button
              type="button"
              onClick={() => enviar()}
              disabled={isPending || !pergunta.trim()}
              className="btn-gold px-3 py-2 text-[11px]"
            >
              Enviar
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setAberto((a) => !a)}
        className="block h-14 w-14 overflow-hidden rounded-full border-2 border-gold/60 shadow-xl transition hover:border-gold hover:shadow-gold/30"
        title="Minerva"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/crests/minerva.png" alt="Minerva" className="h-full w-full object-cover" />
      </button>
    </div>
  );
}
