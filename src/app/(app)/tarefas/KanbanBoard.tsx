"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarTarefa, editarTarefa, moverTarefa, alternarPrivado, excluirTarefa } from "./actions";

export type Tarefa = {
  id: string;
  titulo: string;
  due_date: string | null;
  coluna: string;
  prioridade: string;
  privado: boolean;
  profile_id: string;
  atribuido_por: string | null;
};

type Pessoa = { id: string; full_name: string };

const COLUNAS = [
  { valor: "backlog", label: "Backlog", cor: "bg-stone-500" },
  { valor: "afazer", label: "A Fazer", cor: "bg-gold" },
  { valor: "andamento", label: "Em Andamento", cor: "bg-purpura" },
  { valor: "bloqueado", label: "Bloqueado", cor: "bg-wine" },
  { valor: "concluido", label: "Concluído", cor: "bg-success" },
] as const;

const PRIORIDADE_COR: Record<string, string> = {
  alta: "border-l-wine bg-wine/5",
  media: "border-l-warning bg-warning/5",
  baixa: "border-l-imperium-line-strong",
};
const PRIORIDADE_LABEL: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
const PRIORIDADE_TEXTO: Record<string, string> = { alta: "text-wine-bright", media: "text-warning-bright", baixa: "text-stone-500" };

function iniciais(nome: string) {
  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

// Semáforo de prazo (mesma ideia do Trello): vencida = vermelho, hoje/
// amanhã = âmbar (ainda dá tempo, mas chama atenção), depois = neutro.
function statusPrazo(dueDate: string, coluna: string, hoje: string, amanha: string): "atrasada" | "proxima" | "neutra" {
  if (coluna === "concluido") return "neutra";
  if (dueDate < hoje) return "atrasada";
  if (dueDate === hoje || dueDate === amanha) return "proxima";
  return "neutra";
}

export default function KanbanBoard({
  tarefasIniciais,
  liderados,
  userId,
  nomePorId,
}: {
  tarefasIniciais: Tarefa[];
  liderados: Pessoa[];
  userId: string;
  nomePorId: Map<string, string>;
}) {
  const router = useRouter();
  const [tarefas, setTarefas] = useState(tarefasIniciais);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
  const [composerAberto, setComposerAberto] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [ocultarConcluidas, setOcultarConcluidas] = useState(false);
  const [, startTransition] = useTransition();

  const hoje = new Date().toISOString().slice(0, 10);
  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const tarefasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return tarefas.filter((t) => !termo || t.titulo.toLowerCase().includes(termo));
  }, [tarefas, busca]);

  const porColuna = useMemo(() => {
    const mapa = new Map<string, Tarefa[]>();
    for (const c of COLUNAS) mapa.set(c.valor, []);
    for (const t of tarefasFiltradas) mapa.get(t.coluna)?.push(t);
    return mapa;
  }, [tarefasFiltradas]);

  const totalConcluidas = tarefas.filter((t) => t.coluna === "concluido").length;

  function onDrop(coluna: string) {
    setColunaAlvo(null);
    const id = arrastando;
    setArrastando(null);
    if (!id) return;
    const tarefa = tarefas.find((t) => t.id === id);
    if (!tarefa || tarefa.coluna === coluna) return;

    const anterior = tarefa.coluna;
    setTarefas((prev) => prev.map((t) => (t.id === id ? { ...t, coluna } : t)));
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", id);
        fd.set("coluna", coluna);
        await moverTarefa(fd);
      } catch {
        setTarefas((prev) => prev.map((t) => (t.id === id ? { ...t, coluna: anterior } : t)));
      }
    });
  }

  async function onCriar(fd: FormData) {
    await criarTarefa(fd);
    setComposerAberto(null);
    router.refresh();
  }

  async function onEditar(fd: FormData) {
    await editarTarefa(fd);
    setEditando(null);
    router.refresh();
  }

  async function onAlternarPrivado(t: Tarefa) {
    setTarefas((prev) => prev.map((x) => (x.id === t.id ? { ...x, privado: !x.privado } : x)));
    const fd = new FormData();
    fd.set("id", t.id);
    fd.set("privado", String(t.privado));
    await alternarPrivado(fd);
    router.refresh();
  }

  async function onExcluir(id: string) {
    setTarefas((prev) => prev.filter((t) => t.id !== id));
    const fd = new FormData();
    fd.set("id", id);
    await excluirTarefa(fd);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cartão..."
          className="input-imp max-w-xs text-sm"
        />
        {totalConcluidas > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-stone-400">
            <input type="checkbox" checked={ocultarConcluidas} onChange={(e) => setOcultarConcluidas(e.target.checked)} />
            Ocultar concluídas ({totalConcluidas})
          </label>
        )}
      </div>

      <div className="flex gap-4">
        {COLUNAS.filter((c) => !(ocultarConcluidas && c.valor === "concluido")).map((c) => {
          const itens = porColuna.get(c.valor) ?? [];
          const emDrop = colunaAlvo === c.valor;
          return (
            <div
              key={c.valor}
              onDragOver={(e) => {
                e.preventDefault();
                setColunaAlvo(c.valor);
              }}
              onDragLeave={() => setColunaAlvo((cur) => (cur === c.valor ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(c.valor);
              }}
              className={`flex min-w-0 flex-1 flex-col rounded-lg border bg-imperium-surface/60 transition ${
                emDrop ? "border-gold/60 bg-gold/5" : "border-imperium-line"
              }`}
            >
              <div className="flex items-center justify-between gap-2 border-b border-imperium-line px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${c.cor}`} />
                  <h2 className="truncate text-sm font-medium text-stone-200">{c.label}</h2>
                </div>
                <span className="shrink-0 rounded-full bg-imperium-bg/60 px-2 py-0.5 text-[11px] text-stone-500">{itens.length}</span>
              </div>

              <div className="flex-1 space-y-2 p-2.5">
                {itens.map((t) => {
                  const prazo = t.due_date ? statusPrazo(t.due_date, t.coluna, hoje, amanha) : null;
                  const souDono = t.profile_id === userId;
                  const nomeResponsavel = nomePorId.get(t.profile_id) ?? "—";

                  if (editando === t.id) {
                    return (
                      <form
                        key={t.id}
                        action={onEditar}
                        className="space-y-1.5 rounded-md border border-gold/40 bg-imperium-bg/80 p-2"
                      >
                        <input type="hidden" name="id" value={t.id} />
                        <textarea name="titulo" required defaultValue={t.titulo} rows={2} className="input-imp text-sm" />
                        <div className="flex gap-1.5">
                          <select name="prioridade" defaultValue={t.prioridade} className="input-imp text-xs">
                            <option value="alta">Alta</option>
                            <option value="media">Média</option>
                            <option value="baixa">Baixa</option>
                          </select>
                          <input type="date" name="due_date" defaultValue={t.due_date ?? ""} className="input-imp text-xs" />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button type="submit" className="btn-gold flex-1 py-1.5 text-xs">
                            Salvar
                          </button>
                          <button type="button" onClick={() => setEditando(null)} className="text-xs text-stone-500 hover:text-stone-300">
                            Cancelar
                          </button>
                        </div>
                      </form>
                    );
                  }

                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => {
                        setArrastando(t.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setArrastando(null);
                        setColunaAlvo(null);
                      }}
                      className={`group cursor-grab rounded-md border-l-4 border border-imperium-line bg-imperium-bg/70 p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${
                        PRIORIDADE_COR[t.prioridade] ?? "border-l-imperium-line-strong"
                      } ${arrastando === t.id ? "opacity-40" : ""}`}
                    >
                      <p className="text-sm text-stone-100">{t.titulo}</p>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className={`text-[10px] font-medium uppercase tracking-wide ${PRIORIDADE_TEXTO[t.prioridade] ?? "text-stone-500"}`}>
                          {PRIORIDADE_LABEL[t.prioridade] ?? t.prioridade}
                        </span>
                        {t.due_date && (
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] ${
                              prazo === "atrasada"
                                ? "bg-wine/20 text-wine-bright"
                                : prazo === "proxima"
                                  ? "bg-warning/20 text-warning-bright"
                                  : "bg-imperium-line/60 text-stone-400"
                            }`}
                          >
                            {prazo === "atrasada" ? "Atrasada · " : ""}
                            {new Date(t.due_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                          </span>
                        )}
                        {t.privado && <span className="text-[10px] text-stone-600" title="Oculta dos superiores">🔒</span>}
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5" title={souDono ? undefined : nomeResponsavel}>
                          {!souDono && (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-imperium-raised text-[9px] text-stone-400">
                              {iniciais(nomeResponsavel)}
                            </span>
                          )}
                          {souDono && t.atribuido_por && (
                            <span className="text-[10px] text-stone-600">de {nomePorId.get(t.atribuido_por) ?? "—"}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => setEditando(t.id)}
                            className="text-[10px] text-stone-500 hover:text-gold-bright"
                            title="Editar"
                          >
                            ✎
                          </button>
                          {souDono && (
                            <button
                              type="button"
                              onClick={() => onAlternarPrivado(t)}
                              className="text-[10px] text-stone-500 hover:text-gold-bright"
                              title={t.privado ? "Tornar visível pros superiores" : "Ocultar dos superiores"}
                            >
                              {t.privado ? "🔒" : "🔓"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onExcluir(t.id)}
                            className="text-[10px] text-stone-600 hover:text-wine-bright"
                            title="Excluir"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {composerAberto === c.valor ? (
                  <form
                    action={onCriar}
                    className="space-y-1.5 rounded-md border border-gold/30 bg-imperium-bg/70 p-2"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setComposerAberto(null);
                    }}
                  >
                    <input type="hidden" name="coluna" value={c.valor} />
                    <textarea
                      name="titulo"
                      required
                      autoFocus
                      rows={2}
                      placeholder="Descreva a tarefa..."
                      className="input-imp text-sm"
                    />
                    {liderados.length > 0 && (
                      <select name="profile_id" defaultValue={userId} className="input-imp text-xs">
                        <option value={userId}>Eu mesmo</option>
                        {liderados.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.full_name}
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="flex gap-1.5">
                      <select name="prioridade" defaultValue="media" className="input-imp text-xs">
                        <option value="alta">Alta</option>
                        <option value="media">Média</option>
                        <option value="baixa">Baixa</option>
                      </select>
                      <input type="date" name="due_date" className="input-imp text-xs" />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="submit" className="btn-gold flex-1 py-1.5 text-xs">
                        Adicionar
                      </button>
                      <button type="button" onClick={() => setComposerAberto(null)} className="text-xs text-stone-500 hover:text-stone-300">
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setComposerAberto(c.valor)}
                    className="w-full rounded-md px-2 py-1.5 text-left text-xs text-stone-500 hover:bg-imperium-bg/60 hover:text-gold-bright"
                  >
                    + Adicionar cartão
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
