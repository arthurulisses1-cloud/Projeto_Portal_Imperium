"use client";

import { useState, useTransition } from "react";
import { postarComentario, excluirComentario, reagir } from "@/app/(app)/social-actions";
import { EMOJIS_REACAO, type AlvoTipo, type Comentario, type ReacaoResumo } from "@/lib/social";

type Pessoa = { id: string; nome: string };

export default function ComentariosReacoes({
  alvoTipo,
  alvoId,
  meId,
  isDiretor,
  comentarios,
  reacoes,
  pessoas,
}: {
  alvoTipo: AlvoTipo;
  alvoId: string;
  meId: string;
  isDiretor: boolean;
  comentarios: Comentario[];
  reacoes: ReacaoResumo;
  pessoas: Pessoa[];
}) {
  const [isPending, startTransition] = useTransition();
  const [texto, setTexto] = useState("");
  const [mencionados, setMencionados] = useState<string[]>([]);
  const [mostrarMarcar, setMostrarMarcar] = useState(false);

  function toggleMencionado(id: string) {
    setMencionados((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  function enviar() {
    if (!texto.trim()) return;
    const fd = new FormData();
    fd.set("alvo_tipo", alvoTipo);
    fd.set("alvo_id", alvoId);
    fd.set("texto", texto.trim());
    for (const id of mencionados) fd.append("mencionado", id);
    startTransition(async () => {
      await postarComentario(fd);
      setTexto("");
      setMencionados([]);
      setMostrarMarcar(false);
    });
  }

  function excluir(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(() => excluirComentario(fd));
  }

  function clicarReacao(emoji: string) {
    const fd = new FormData();
    fd.set("alvo_tipo", alvoTipo);
    fd.set("alvo_id", alvoId);
    fd.set("emoji", emoji);
    startTransition(() => reagir(fd));
  }

  return (
    <div className="mt-3 border-t border-imperium-line pt-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {EMOJIS_REACAO.map((emoji) => {
          const info = reacoes.porEmoji.find((r) => r.emoji === emoji);
          const ativo = reacoes.minhaReacao === emoji;
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => clicarReacao(emoji)}
              disabled={isPending}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
                ativo ? "border-gold bg-gold/15 text-gold-bright" : "border-imperium-line text-stone-400 hover:border-gold/50"
              }`}
            >
              <span>{emoji}</span>
              {info && info.qtd > 0 && <span>{info.qtd}</span>}
            </button>
          );
        })}
      </div>

      {comentarios.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {comentarios.map((c) => (
            <li key={c.id} className="text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-stone-300">
                    <span className="text-gold-bright">{c.autorNome}</span>: {c.texto}
                  </span>
                  {c.mencionados.length > 0 && (
                    <p className="mt-0.5 text-[10px] text-gold">marcou {c.mencionados.map((n) => `@${n}`).join(" ")}</p>
                  )}
                </div>
                {(c.autorId === meId || isDiretor) && (
                  <button
                    type="button"
                    onClick={() => excluir(c.id)}
                    className="shrink-0 text-[10px] text-stone-600 hover:text-wine-bright"
                  >
                    Excluir
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2.5 space-y-1.5">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Comentar..."
          rows={1}
          className="input-imp w-full px-2 py-1.5 text-xs"
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setMostrarMarcar((v) => !v)}
            className="text-[10px] text-stone-500 hover:text-gold"
          >
            {mencionados.length > 0 ? `${mencionados.length} marcado(s)` : "Marcar alguém"}
          </button>
          <button
            type="button"
            onClick={enviar}
            disabled={isPending || !texto.trim()}
            className="btn-outline px-2.5 py-1 text-[10px]"
          >
            {isPending ? "..." : "Enviar"}
          </button>
        </div>
        {mostrarMarcar && (
          <div className="grid max-h-28 grid-cols-2 gap-1 overflow-y-auto rounded border border-imperium-line p-1.5 sm:grid-cols-3">
            {pessoas.map((p) => (
              <label key={p.id} className="flex items-center gap-1 text-[10px] text-stone-400">
                <input type="checkbox" checked={mencionados.includes(p.id)} onChange={() => toggleMencionado(p.id)} />
                {p.nome}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
