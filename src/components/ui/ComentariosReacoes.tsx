"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { postarComentario, excluirComentario, reagir } from "@/app/(app)/social-actions";
import { EMOJIS_REACAO, type AlvoTipo, type Comentario, type ReacaoResumo } from "@/lib/social";

type Pessoa = { id: string; nome: string };

function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

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
  const [mencionados, setMencionados] = useState<{ id: string; nome: string }[]>([]);
  const [buscaMencao, setBuscaMencao] = useState<string | null>(null); // null = dropdown fechado
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sugestoes = useMemo(() => {
    if (buscaMencao === null) return [];
    const q = normalizar(buscaMencao);
    return pessoas.filter((p) => normalizar(p.nome).includes(q)).slice(0, 6);
  }, [buscaMencao, pessoas]);

  // Detecta se o cursor está logo depois de um "@" (sem espaço no meio) — é
  // o gatilho pro dropdown, igual Instagram/Facebook/Slack. `@` sozinho no
  // início do texto ou depois de espaço conta; "email@dominio" não conta,
  // porque tem letra colada antes do @.
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const novoTexto = e.target.value;
    setTexto(novoTexto);
    // Solta menções cujo "@Nome" sumiu do texto (a pessoa apagou ou editou).
    setMencionados((atual) => atual.filter((m) => novoTexto.includes(`@${m.nome}`)));

    const cursor = e.target.selectionStart ?? novoTexto.length;
    const antesDoCursor = novoTexto.slice(0, cursor);
    const ultimoArroba = antesDoCursor.lastIndexOf("@");
    if (ultimoArroba === -1) {
      setBuscaMencao(null);
      return;
    }
    const charAntes = ultimoArroba > 0 ? antesDoCursor[ultimoArroba - 1] : " ";
    const trecho = antesDoCursor.slice(ultimoArroba + 1);
    const temEspaco = /\s/.test(trecho);
    const letraColada = /[a-zA-Z0-9À-ÿ]/.test(charAntes);
    if (temEspaco || letraColada) {
      setBuscaMencao(null);
      return;
    }
    setBuscaMencao(trecho);
  }

  function escolherPessoa(p: Pessoa) {
    const ta = textareaRef.current;
    const cursor = ta?.selectionStart ?? texto.length;
    const antesDoCursor = texto.slice(0, cursor);
    const ultimoArroba = antesDoCursor.lastIndexOf("@");
    if (ultimoArroba === -1) return;

    const novoTexto = `${texto.slice(0, ultimoArroba)}@${p.nome} ${texto.slice(cursor)}`;
    setTexto(novoTexto);
    setMencionados((atual) => (atual.some((m) => m.id === p.id) ? atual : [...atual, { id: p.id, nome: p.nome }]));
    setBuscaMencao(null);

    const novaPosicao = ultimoArroba + p.nome.length + 2;
    requestAnimationFrame(() => {
      ta?.focus();
      ta?.setSelectionRange(novaPosicao, novaPosicao);
    });
  }

  function removerMencionado(id: string) {
    setMencionados((atual) => atual.filter((m) => m.id !== id));
  }

  function enviar() {
    if (!texto.trim()) return;
    const fd = new FormData();
    fd.set("alvo_tipo", alvoTipo);
    fd.set("alvo_id", alvoId);
    fd.set("texto", texto.trim());
    for (const m of mencionados) fd.append("mencionado", m.id);
    startTransition(async () => {
      await postarComentario(fd);
      setTexto("");
      setMencionados([]);
      setBuscaMencao(null);
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

      <div className="relative mt-2.5 space-y-1.5">
        <textarea
          ref={textareaRef}
          value={texto}
          onChange={handleChange}
          onBlur={() => setTimeout(() => setBuscaMencao(null), 150)}
          placeholder="Comentar... use @ pra marcar alguém"
          rows={1}
          className="input-imp w-full px-2 py-1.5 text-xs"
        />

        {buscaMencao !== null && sugestoes.length > 0 && (
          <ul className="absolute bottom-full z-10 mb-1 w-56 overflow-hidden rounded border border-gold/40 bg-imperium-surface shadow-xl">
            {sugestoes.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolherPessoa(p)}
                  className="block w-full px-2.5 py-1.5 text-left text-xs text-stone-300 hover:bg-gold/15 hover:text-gold-bright"
                >
                  {p.nome}
                </button>
              </li>
            ))}
          </ul>
        )}

        {mencionados.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {mencionados.map((m) => (
              <span
                key={m.id}
                className="flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] text-gold"
              >
                @{m.nome}
                <button type="button" onClick={() => removerMencionado(m.id)} className="text-gold/70 hover:text-gold-bright">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={enviar}
            disabled={isPending || !texto.trim()}
            className="btn-outline px-2.5 py-1 text-[10px]"
          >
            {isPending ? "..." : "Enviar"}
          </button>
        </div>
      </div>
    </div>
  );
}
