"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  criarTarefa,
  criarTarefaRapida,
  editarTarefa,
  moverTarefa,
  adiarTarefa,
  transferirTarefa,
  alternarPrivado,
  excluirTarefa,
  adicionarChecklistItem,
  alternarChecklistItem,
  excluirChecklistItem,
  adicionarComentario,
  excluirComentario,
  definirDependencia,
  removerDependencia,
  iniciarCronometro,
  pararCronometro,
} from "./actions";

export type Tarefa = {
  id: string;
  titulo: string;
  descricao: string | null;
  due_date: string | null;
  due_time: string | null;
  coluna: string;
  prioridade: string;
  privado: boolean;
  profile_id: string;
  atribuido_por: string | null;
  tags: string[];
  tempo_estimado_min: number | null;
  tempo_gasto_seg: number;
  cronometro_iniciado_em: string | null;
  updated_at: string;
};
export type ChecklistItem = { id: string; task_id: string; titulo: string; feito: boolean; ordem: number };
export type Comentario = { id: string; task_id: string; autor_id: string; texto: string; created_at: string };
export type Dependencia = { task_id: string; depende_de_id: string };

type Pessoa = { id: string; full_name: string };

const COLUNAS = [
  { valor: "backlog", label: "Backlog", cor: "bg-stone-500" },
  { valor: "afazer", label: "A Fazer", cor: "bg-gold" },
  { valor: "andamento", label: "Em Andamento", cor: "bg-purpura" },
  { valor: "bloqueado", label: "Bloqueado", cor: "bg-wine" },
  { valor: "concluido", label: "Concluído", cor: "bg-success" },
] as const;

const PRIORIDADE_ORDEM = ["critica", "alta", "normal", "baixa"];
const PRIORIDADE_COR: Record<string, string> = {
  critica: "border-l-wine-bright bg-wine/10",
  alta: "border-l-wine bg-wine/5",
  normal: "border-l-warning bg-warning/5",
  baixa: "border-l-imperium-line-strong",
};
const PRIORIDADE_LABEL: Record<string, string> = { critica: "🔥 Crítica", alta: "Alta", normal: "Normal", baixa: "Baixa" };
const PRIORIDADE_TEXTO: Record<string, string> = {
  critica: "text-wine-bright",
  alta: "text-wine-bright",
  normal: "text-warning-bright",
  baixa: "text-stone-500",
};

function iniciais(nome: string) {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function statusPrazo(dueDate: string, coluna: string, hoje: string, amanha: string): "atrasada" | "proxima" | "neutra" {
  if (coluna === "concluido") return "neutra";
  if (dueDate < hoje) return "atrasada";
  if (dueDate === hoje || dueDate === amanha) return "proxima";
  return "neutra";
}

function formatarDuracao(segundos: number): string {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  return `${m}min`;
}

function TagChip({ tag }: { tag: string }) {
  return <span className="rounded-full bg-imperium-line/60 px-1.5 py-0.5 text-[9px] text-stone-300">{tag}</span>;
}

export default function TarefasApp({
  tarefasIniciais,
  checklistInicial,
  comentariosIniciais,
  dependenciasIniciais,
  liderados,
  userId,
  nomePorId,
}: {
  tarefasIniciais: Tarefa[];
  checklistInicial: ChecklistItem[];
  comentariosIniciais: Comentario[];
  dependenciasIniciais: Dependencia[];
  liderados: Pessoa[];
  userId: string;
  nomePorId: Map<string, string>;
}) {
  const router = useRouter();
  const [tarefas, setTarefas] = useState(tarefasIniciais);
  const [checklist, setChecklist] = useState(checklistInicial);
  const [comentarios, setComentarios] = useState(comentariosIniciais);
  const [dependencias, setDependencias] = useState(dependenciasIniciais);

  const [view, setView] = useState<"quadro" | "meu-dia" | "por-pessoa">("quadro");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
  const [composerAberto, setComposerAberto] = useState<string | null>(null);
  const [tarefaAberta, setTarefaAberta] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [ocultarConcluidas, setOcultarConcluidas] = useState(false);
  const [textoRapido, setTextoRapido] = useState("");
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

  const checklistPorTarefa = useMemo(() => {
    const mapa = new Map<string, ChecklistItem[]>();
    for (const item of checklist) {
      if (!mapa.has(item.task_id)) mapa.set(item.task_id, []);
      mapa.get(item.task_id)!.push(item);
    }
    return mapa;
  }, [checklist]);

  const dependenciaPorTarefa = useMemo(() => {
    const mapa = new Map<string, string[]>(); // task_id -> [depende_de_id]
    for (const d of dependencias) {
      if (!mapa.has(d.task_id)) mapa.set(d.task_id, []);
      mapa.get(d.task_id)!.push(d.depende_de_id);
    }
    return mapa;
  }, [dependencias]);

  const tarefaPorId = useMemo(() => new Map(tarefas.map((t) => [t.id, t])), [tarefas]);

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

  async function onCriarRapida() {
    if (!textoRapido.trim()) return;
    const fd = new FormData();
    fd.set("texto", textoRapido);
    setTextoRapido("");
    await criarTarefaRapida(fd);
    router.refresh();
  }

  async function onExcluir(id: string) {
    setTarefas((prev) => prev.filter((t) => t.id !== id));
    if (tarefaAberta === id) setTarefaAberta(null);
    const fd = new FormData();
    fd.set("id", id);
    await excluirTarefa(fd);
  }

  async function onAdiar(t: Tarefa) {
    const fd = new FormData();
    fd.set("id", t.id);
    fd.set("due_date", t.due_date ?? "");
    await adiarTarefa(fd);
    router.refresh();
  }

  const tarefaSelecionada = tarefaAberta ? tarefaPorId.get(tarefaAberta) ?? null : null;

  return (
    <div className="space-y-4">
      {/* Quick Add — sempre visível, cria pra mim mesmo com data/hora por texto */}
      <form
        action={onCriarRapida}
        className="flex items-center gap-2 rounded-lg border border-gold/30 bg-imperium-surface/60 p-2"
      >
        <span className="pl-1 text-gold-bright">⚡</span>
        <input
          value={textoRapido}
          onChange={(e) => setTextoRapido(e.target.value)}
          placeholder='O que você precisa fazer? Ex: "ligar pro João amanhã às 14h"'
          className="input-imp flex-1 border-none bg-transparent text-sm focus:border-none"
        />
        <button type="submit" className="btn-gold px-3 py-1.5 text-xs">
          Adicionar
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-imperium-line bg-imperium-surface/60 p-1 text-xs">
          {(
            [
              ["quadro", "🗃️ Quadro"],
              ["meu-dia", "⚔️ Meu Dia"],
              ["por-pessoa", "👥 Por Pessoa"],
            ] as const
          ).map(([valor, label]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setView(valor)}
              className={`rounded px-3 py-1.5 transition ${view === valor ? "bg-gold/15 text-gold-bright" : "text-stone-400 hover:text-stone-200"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {view === "quadro" && (
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
        )}
      </div>

      {view === "quadro" && (
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
                  {itens.map((t) => (
                    <CartaoTarefa
                      key={t.id}
                      t={t}
                      userId={userId}
                      nomePorId={nomePorId}
                      hoje={hoje}
                      amanha={amanha}
                      checklistItens={checklistPorTarefa.get(t.id) ?? []}
                      qtdComentarios={comentarios.filter((cm) => cm.task_id === t.id).length}
                      dependeDe={(dependenciaPorTarefa.get(t.id) ?? []).map((id) => tarefaPorId.get(id)).filter((x): x is Tarefa => !!x)}
                      arrastando={arrastando === t.id}
                      onDragStart={() => setArrastando(t.id)}
                      onDragEnd={() => {
                        setArrastando(null);
                        setColunaAlvo(null);
                      }}
                      onAbrir={() => setTarefaAberta(t.id)}
                      onAdiar={() => onAdiar(t)}
                      onExcluir={() => onExcluir(t.id)}
                    />
                  ))}

                  {composerAberto === c.valor ? (
                    <form
                      action={onCriar}
                      className="space-y-1.5 rounded-md border border-gold/30 bg-imperium-bg/70 p-2"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setComposerAberto(null);
                      }}
                    >
                      <input type="hidden" name="coluna" value={c.valor} />
                      <textarea name="titulo" required autoFocus rows={2} placeholder="Descreva a tarefa..." className="input-imp text-sm" />
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
                        <select name="prioridade" defaultValue="normal" className="input-imp text-xs">
                          {PRIORIDADE_ORDEM.map((p) => (
                            <option key={p} value={p}>
                              {PRIORIDADE_LABEL[p]}
                            </option>
                          ))}
                        </select>
                        <input type="date" name="due_date" className="input-imp text-xs" />
                        <input type="time" name="due_time" className="input-imp text-xs" />
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
      )}

      {view === "meu-dia" && (
        <MeuDia tarefas={tarefas} userId={userId} hoje={hoje} dependenciaPorTarefa={dependenciaPorTarefa} tarefaPorId={tarefaPorId} onAbrir={setTarefaAberta} />
      )}

      {view === "por-pessoa" && <PorPessoa tarefas={tarefas} pessoas={[{ id: userId, full_name: "Você" }, ...liderados]} hoje={hoje} />}

      {tarefaSelecionada && (
        <TaskModal
          tarefa={tarefaSelecionada}
          userId={userId}
          nomePorId={nomePorId}
          liderados={liderados}
          checklistItens={checklistPorTarefa.get(tarefaSelecionada.id) ?? []}
          comentariosItens={comentarios.filter((c) => c.task_id === tarefaSelecionada.id)}
          dependeDeIds={dependenciaPorTarefa.get(tarefaSelecionada.id) ?? []}
          outrasTarefas={tarefas.filter((t) => t.id !== tarefaSelecionada.id)}
          onFechar={() => setTarefaAberta(null)}
          onChecklistLocal={setChecklist}
          onDependenciaLocal={setDependencias}
          onComentarioLocal={setComentarios}
        />
      )}
    </div>
  );
}

function CartaoTarefa({
  t,
  userId,
  nomePorId,
  hoje,
  amanha,
  checklistItens,
  qtdComentarios,
  dependeDe,
  arrastando,
  onDragStart,
  onDragEnd,
  onAbrir,
  onAdiar,
  onExcluir,
}: {
  t: Tarefa;
  userId: string;
  nomePorId: Map<string, string>;
  hoje: string;
  amanha: string;
  checklistItens: ChecklistItem[];
  qtdComentarios: number;
  dependeDe: Tarefa[];
  arrastando: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onAbrir: () => void;
  onAdiar: () => void;
  onExcluir: () => void;
}) {
  const prazo = t.due_date ? statusPrazo(t.due_date, t.coluna, hoje, amanha) : null;
  const souDono = t.profile_id === userId;
  const nomeResponsavel = nomePorId.get(t.profile_id) ?? "—";
  const checklistFeitos = checklistItens.filter((i) => i.feito).length;
  const dependePendente = dependeDe.filter((d) => d.coluna !== "concluido");
  const tempoTotal = t.tempo_gasto_seg + (t.cronometro_iniciado_em ? Math.floor((Date.now() - new Date(t.cronometro_iniciado_em).getTime()) / 1000) : 0);

  return (
    <div
      draggable
      onDragStart={(e) => {
        onDragStart();
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={onDragEnd}
      className={`group cursor-grab rounded-md border-l-4 border border-imperium-line bg-imperium-bg/70 p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${
        PRIORIDADE_COR[t.prioridade] ?? "border-l-imperium-line-strong"
      } ${arrastando ? "opacity-40" : ""}`}
    >
      <button type="button" onClick={onAbrir} className="block w-full text-left">
        <p className="text-sm text-stone-100">{t.titulo}</p>
      </button>

      {dependePendente.length > 0 && (
        <p className="mt-1.5 text-[10px] text-warning-bright">🔗 aguardando: {dependePendente.map((d) => d.titulo).join(", ")}</p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={`text-[10px] font-medium uppercase tracking-wide ${PRIORIDADE_TEXTO[t.prioridade] ?? "text-stone-500"}`}>
          {PRIORIDADE_LABEL[t.prioridade] ?? t.prioridade}
        </span>
        {t.due_date && (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              prazo === "atrasada" ? "bg-wine/20 text-wine-bright" : prazo === "proxima" ? "bg-warning/20 text-warning-bright" : "bg-imperium-line/60 text-stone-400"
            }`}
          >
            {prazo === "atrasada" ? "Atrasada · " : ""}
            {new Date(t.due_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
            {t.due_time ? ` ${t.due_time.slice(0, 5)}` : ""}
          </span>
        )}
        {checklistItens.length > 0 && (
          <span className="rounded bg-imperium-line/60 px-1.5 py-0.5 text-[10px] text-stone-400">
            ☑ {checklistFeitos}/{checklistItens.length}
          </span>
        )}
        {qtdComentarios > 0 && <span className="text-[10px] text-stone-500">💬 {qtdComentarios}</span>}
        {tempoTotal > 0 && (
          <span className={`text-[10px] ${t.cronometro_iniciado_em ? "text-gold-bright" : "text-stone-500"}`}>
            ⏱ {formatarDuracao(tempoTotal)}
            {t.cronometro_iniciado_em ? "…" : ""}
          </span>
        )}
        {t.privado && (
          <span className="text-[10px] text-stone-600" title="Oculta dos superiores">
            🔒
          </span>
        )}
      </div>

      {t.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {t.tags.map((tag) => (
            <TagChip key={tag} tag={tag} />
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5" title={souDono ? undefined : nomeResponsavel}>
          {!souDono && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-imperium-raised text-[9px] text-stone-400">
              {iniciais(nomeResponsavel)}
            </span>
          )}
          {souDono && t.atribuido_por && <span className="text-[10px] text-stone-600">de {nomePorId.get(t.atribuido_por) ?? "—"}</span>}
        </div>
        <div className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
          {t.due_date && t.coluna !== "concluido" && (
            <button type="button" onClick={onAdiar} className="text-[10px] text-stone-500 hover:text-gold-bright" title="Adiar 1 dia">
              ⏰
            </button>
          )}
          <button type="button" onClick={onAbrir} className="text-[10px] text-stone-500 hover:text-gold-bright" title="Editar">
            ✎
          </button>
          <button type="button" onClick={onExcluir} className="text-[10px] text-stone-600 hover:text-wine-bright" title="Excluir">
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function MeuDia({
  tarefas,
  userId,
  hoje,
  dependenciaPorTarefa,
  tarefaPorId,
  onAbrir,
}: {
  tarefas: Tarefa[];
  userId: string;
  hoje: string;
  dependenciaPorTarefa: Map<string, string[]>;
  tarefaPorId: Map<string, Tarefa>;
  onAbrir: (id: string) => void;
}) {
  const minhas = tarefas.filter((t) => t.profile_id === userId && t.coluna !== "concluido");
  const prioridadeMaxima = minhas.filter((t) => (t.prioridade === "critica" || t.prioridade === "alta") && (!t.due_date || t.due_date <= hoje));
  const idsPrioridadeMaxima = new Set(prioridadeMaxima.map((t) => t.id));
  const deHoje = minhas.filter((t) => t.due_date === hoje && !idsPrioridadeMaxima.has(t.id));
  const aguardando = minhas.filter((t) => {
    const deps = (dependenciaPorTarefa.get(t.id) ?? []).map((id) => tarefaPorId.get(id)).filter((x): x is Tarefa => !!x);
    return deps.some((d) => d.coluna !== "concluido");
  });
  // `updated_at` tem trigger automático (trg_tasks_updated_at) — atualiza
  // sempre que a tarefa muda, então "mudou pra Concluído hoje" ~= "coluna
  // concluído E updated_at é de hoje". Não é 100% preciso (qualquer outra
  // edição no mesmo dia também conta), mas é muito melhor que mostrar TODA
  // tarefa concluída alguma vez, sem filtro de data nenhum.
  const concluidasHoje = tarefas.filter((t) => t.profile_id === userId && t.coluna === "concluido" && t.updated_at.slice(0, 10) === hoje);

  const totalDia = new Set([...prioridadeMaxima, ...deHoje].map((t) => t.id)).size;
  const progresso = totalDia + concluidasHoje.length > 0 ? Math.round((concluidasHoje.length / (totalDia + concluidasHoje.length)) * 100) : 0;

  const dataFmt = new Date(hoje + "T00:00:00");
  const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  function Lista({ titulo, itens, icone }: { titulo: string; itens: Tarefa[]; icone: string }) {
    if (itens.length === 0) return null;
    return (
      <div className="card-imp p-4">
        <h3 className="kicker mb-2">
          {icone} {titulo} <span className="text-stone-600">({itens.length})</span>
        </h3>
        <ul className="space-y-1.5">
          {itens.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => onAbrir(t.id)} className="w-full text-left text-sm text-stone-200 hover:text-gold-bright">
                {t.titulo}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card-imp p-5 text-center">
        <p className="font-display text-lg text-gold-bright">
          {DIAS[dataFmt.getDay()]} — {dataFmt.getDate()} de {MESES[dataFmt.getMonth()]}
        </p>
        <p className="mt-1 text-xs text-stone-500">Progresso do dia: {progresso}%</p>
        <div className="mx-auto mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-imperium-line">
          <div className="h-full rounded-full bg-gold-bright transition-all" style={{ width: `${progresso}%` }} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Lista titulo="Prioridade máxima" itens={prioridadeMaxima} icone="🔥" />
        <Lista titulo="Hoje" itens={deHoje} icone="🎯" />
        <Lista titulo="Aguardando" itens={aguardando} icone="⏳" />
        <Lista titulo="Concluído" itens={concluidasHoje} icone="✅" />
      </div>

      {prioridadeMaxima.length === 0 && deHoje.length === 0 && aguardando.length === 0 && concluidasHoje.length === 0 && (
        <p className="text-center text-sm text-stone-500">Nada pra hoje — bom sinal, ou hora de olhar o Backlog.</p>
      )}
    </div>
  );
}

function PorPessoa({ tarefas, pessoas, hoje }: { tarefas: Tarefa[]; pessoas: Pessoa[]; hoje: string }) {
  const linhas = pessoas.map((p) => {
    const doPerfil = tarefas.filter((t) => t.profile_id === p.id);
    const afazer = doPerfil.filter((t) => t.coluna === "backlog" || t.coluna === "afazer").length;
    const andamento = doPerfil.filter((t) => t.coluna === "andamento" || t.coluna === "bloqueado").length;
    const atrasadas = doPerfil.filter((t) => t.due_date && t.due_date < hoje && t.coluna !== "concluido").length;
    const concluidas = doPerfil.filter((t) => t.coluna === "concluido").length;
    const abertas = afazer + andamento;
    return { ...p, afazer, andamento, atrasadas, concluidas, abertas };
  });

  const mediaAbertas = linhas.length > 0 ? linhas.reduce((s, l) => s + l.abertas, 0) / linhas.length : 0;
  const sobrecarregados = linhas.filter((l) => mediaAbertas > 0 && l.abertas > mediaAbertas * 1.5 && l.abertas >= 4);
  const folgados = linhas.filter((l) => mediaAbertas > 0 && l.abertas < mediaAbertas * 0.5);

  return (
    <div className="space-y-4">
      <div className="card-imp overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-imperium-line text-left text-[11px] uppercase tracking-wide text-stone-500">
              <th className="pb-2">Pessoa</th>
              <th className="pb-2 text-right">A fazer</th>
              <th className="pb-2 text-right">Em andamento</th>
              <th className="pb-2 text-right">Atrasadas</th>
              <th className="pb-2 text-right">Concluídas</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-imperium-line/50 last:border-0">
                <td className="py-2 text-stone-200">{l.full_name}</td>
                <td className="py-2 text-right text-stone-400">{l.afazer}</td>
                <td className="py-2 text-right text-stone-400">{l.andamento}</td>
                <td className={`py-2 text-right ${l.atrasadas > 0 ? "text-wine-bright" : "text-stone-400"}`}>{l.atrasadas}</td>
                <td className="py-2 text-right text-success-bright">{l.concluidas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(sobrecarregados.length > 0 || folgados.length > 0) && (
        <div className="card-imp p-4">
          <h3 className="kicker mb-2">⚖️ Balanceamento de carga</h3>
          {sobrecarregados.map((l) => (
            <p key={l.id} className="text-sm text-stone-300">
              <span className="text-warning-bright">{l.full_name}</span> está com {l.abertas} tarefas abertas — bem acima da média do time ({mediaAbertas.toFixed(1)}).
              {folgados.length > 0 && <> Considere transferir algumas pra {folgados.map((f) => f.full_name).join(" ou ")}.</>}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskModal({
  tarefa,
  userId,
  nomePorId,
  liderados,
  checklistItens,
  comentariosItens,
  dependeDeIds,
  outrasTarefas,
  onFechar,
  onChecklistLocal,
  onDependenciaLocal,
  onComentarioLocal,
}: {
  tarefa: Tarefa;
  userId: string;
  nomePorId: Map<string, string>;
  liderados: Pessoa[];
  checklistItens: ChecklistItem[];
  comentariosItens: Comentario[];
  dependeDeIds: string[];
  outrasTarefas: Tarefa[];
  onFechar: () => void;
  onChecklistLocal: (fn: (prev: ChecklistItem[]) => ChecklistItem[]) => void;
  onDependenciaLocal: (fn: (prev: Dependencia[]) => Dependencia[]) => void;
  onComentarioLocal: (fn: (prev: Comentario[]) => Comentario[]) => void;
}) {
  const router = useRouter();
  const souDono = tarefa.profile_id === userId;
  const [tick, setTick] = useState(0);
  const [novoItemChecklist, setNovoItemChecklist] = useState("");
  const [novoComentario, setNovoComentario] = useState("");

  useEffect(() => {
    if (!tarefa.cronometro_iniciado_em) return;
    const id = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [tarefa.cronometro_iniciado_em]);
  void tick;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onFechar]);

  const tempoTotal = tarefa.tempo_gasto_seg + (tarefa.cronometro_iniciado_em ? Math.floor((Date.now() - new Date(tarefa.cronometro_iniciado_em).getTime()) / 1000) : 0);

  async function onSalvarDetalhes(fd: FormData) {
    await editarTarefa(fd);
    router.refresh();
  }

  async function onAdicionarItem() {
    if (!novoItemChecklist.trim()) return;
    const fd = new FormData();
    fd.set("task_id", tarefa.id);
    fd.set("titulo", novoItemChecklist);
    fd.set("ordem", String(checklistItens.length));
    const titulo = novoItemChecklist;
    setNovoItemChecklist("");
    onChecklistLocal((prev) => [...prev, { id: `otimista-${Date.now()}`, task_id: tarefa.id, titulo, feito: false, ordem: prev.length }]);
    await adicionarChecklistItem(fd);
    router.refresh();
  }

  async function onAlternarItem(item: ChecklistItem) {
    onChecklistLocal((prev) => prev.map((i) => (i.id === item.id ? { ...i, feito: !i.feito } : i)));
    const fd = new FormData();
    fd.set("id", item.id);
    fd.set("feito", String(item.feito));
    await alternarChecklistItem(fd);
    router.refresh();
  }

  async function onExcluirItem(id: string) {
    onChecklistLocal((prev) => prev.filter((i) => i.id !== id));
    const fd = new FormData();
    fd.set("id", id);
    await excluirChecklistItem(fd);
    router.refresh();
  }

  async function onAdicionarComentario() {
    if (!novoComentario.trim()) return;
    const fd = new FormData();
    fd.set("task_id", tarefa.id);
    fd.set("texto", novoComentario);
    setNovoComentario("");
    await adicionarComentario(fd);
    router.refresh();
  }

  async function onExcluirComentario(id: string) {
    onComentarioLocal((prev) => prev.filter((c) => c.id !== id));
    const fd = new FormData();
    fd.set("id", id);
    await excluirComentario(fd);
    router.refresh();
  }

  async function onAdicionarDependencia(dependeDeId: string) {
    if (!dependeDeId) return;
    onDependenciaLocal((prev) => [...prev, { task_id: tarefa.id, depende_de_id: dependeDeId }]);
    const fd = new FormData();
    fd.set("task_id", tarefa.id);
    fd.set("depende_de_id", dependeDeId);
    await definirDependencia(fd);
    router.refresh();
  }

  async function onRemoverDependencia(dependeDeId: string) {
    onDependenciaLocal((prev) => prev.filter((d) => !(d.task_id === tarefa.id && d.depende_de_id === dependeDeId)));
    const fd = new FormData();
    fd.set("task_id", tarefa.id);
    fd.set("depende_de_id", dependeDeId);
    await removerDependencia(fd);
    router.refresh();
  }

  async function onIniciarCronometro() {
    const fd = new FormData();
    fd.set("id", tarefa.id);
    await iniciarCronometro(fd);
    router.refresh();
  }

  async function onPararCronometro() {
    const fd = new FormData();
    fd.set("id", tarefa.id);
    fd.set("cronometro_iniciado_em", tarefa.cronometro_iniciado_em ?? "");
    fd.set("tempo_gasto_seg", String(tarefa.tempo_gasto_seg));
    await pararCronometro(fd);
    router.refresh();
  }

  const checklistFeitos = checklistItens.filter((i) => i.feito).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="card-imp my-8 w-full max-w-2xl space-y-5 p-6">
        <div className="flex items-start justify-between gap-3">
          <form action={onSalvarDetalhes} className="flex-1 space-y-3">
            <input type="hidden" name="id" value={tarefa.id} />
            <textarea
              name="titulo"
              required
              defaultValue={tarefa.titulo}
              rows={2}
              className="w-full border-none bg-transparent font-display text-lg text-gold-bright outline-none"
            />
            <textarea
              name="descricao"
              defaultValue={tarefa.descricao ?? ""}
              placeholder="Descrição (opcional)..."
              rows={2}
              className="input-imp text-sm"
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <select name="prioridade" defaultValue={tarefa.prioridade} className="input-imp text-xs">
                {PRIORIDADE_ORDEM.map((p) => (
                  <option key={p} value={p}>
                    {PRIORIDADE_LABEL[p]}
                  </option>
                ))}
              </select>
              <input type="date" name="due_date" defaultValue={tarefa.due_date ?? ""} className="input-imp text-xs" />
              <input type="time" name="due_time" defaultValue={tarefa.due_time?.slice(0, 5) ?? ""} className="input-imp text-xs" />
              <input
                type="number"
                name="tempo_estimado_min"
                defaultValue={tarefa.tempo_estimado_min ?? ""}
                placeholder="Estimativa (min)"
                className="input-imp text-xs"
              />
            </div>
            <input name="tags" defaultValue={tarefa.tags.join(", ")} placeholder="tags separadas por vírgula" className="input-imp text-xs" />
            <button type="submit" className="btn-gold px-3 py-1.5 text-xs">
              Salvar
            </button>
          </form>
          <button type="button" onClick={onFechar} className="text-stone-500 hover:text-stone-200">
            ✕
          </button>
        </div>

        {/* Responsável / transferir / ocultar */}
        <div className="flex flex-wrap items-center gap-3 border-t border-imperium-line pt-3 text-xs">
          <span className="text-stone-500">
            Responsável: <span className="text-stone-200">{nomePorId.get(tarefa.profile_id) ?? "—"}</span>
          </span>
          {liderados.length > 0 && (
            <form
              action={async (fd) => {
                await transferirTarefa(fd);
                router.refresh();
              }}
              className="flex items-center gap-1.5"
            >
              <input type="hidden" name="id" value={tarefa.id} />
              <select name="profile_id" defaultValue="" className="input-imp py-1 text-[11px]">
                <option value="" disabled>
                  Transferir pra...
                </option>
                <option value={userId}>Eu mesmo</option>
                {liderados.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.full_name}
                  </option>
                ))}
              </select>
              <button type="submit" className="text-[11px] text-gold hover:text-gold-bright">
                OK
              </button>
            </form>
          )}
          {souDono && (
            <form
              action={async (fd) => {
                await alternarPrivado(fd);
                router.refresh();
              }}
            >
              <input type="hidden" name="id" value={tarefa.id} />
              <input type="hidden" name="privado" value={String(tarefa.privado)} />
              <button type="submit" className={tarefa.privado ? "text-gold-bright" : "text-stone-500 hover:text-gold-bright"}>
                {tarefa.privado ? "🔒 Oculta dos superiores" : "🔓 Ocultar dos superiores"}
              </button>
            </form>
          )}
        </div>

        {/* Cronômetro */}
        <div className="flex items-center justify-between border-t border-imperium-line pt-3">
          <div className="text-sm">
            <span className="text-stone-500">Tempo: </span>
            <span className="text-gold-bright">{formatarDuracao(tempoTotal)}</span>
            {tarefa.tempo_estimado_min && <span className="text-stone-600"> / estimado {tarefa.tempo_estimado_min}min</span>}
          </div>
          {tarefa.cronometro_iniciado_em ? (
            <button type="button" onClick={onPararCronometro} className="btn-outline px-3 py-1 text-xs">
              ⏸ Parar
            </button>
          ) : (
            <button type="button" onClick={onIniciarCronometro} className="btn-outline px-3 py-1 text-xs">
              ▶ Iniciar
            </button>
          )}
        </div>

        {/* Dependência */}
        <div className="border-t border-imperium-line pt-3">
          <h3 className="kicker mb-2">🔗 Depende de</h3>
          <div className="space-y-1">
            {dependeDeIds.map((id) => {
              const dep = outrasTarefas.find((t) => t.id === id);
              if (!dep) return null;
              return (
                <div key={id} className="flex items-center justify-between text-sm">
                  <span className={dep.coluna === "concluido" ? "text-success-bright line-through" : "text-stone-300"}>{dep.titulo}</span>
                  <button type="button" onClick={() => onRemoverDependencia(id)} className="text-[11px] text-stone-600 hover:text-wine-bright">
                    remover
                  </button>
                </div>
              );
            })}
          </div>
          <select
            defaultValue=""
            onChange={(e) => {
              onAdicionarDependencia(e.target.value);
              e.target.value = "";
            }}
            className="input-imp mt-2 text-xs"
          >
            <option value="" disabled>
              + Adicionar dependência...
            </option>
            {outrasTarefas
              .filter((t) => !dependeDeIds.includes(t.id))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.titulo}
                </option>
              ))}
          </select>
        </div>

        {/* Checklist */}
        <div className="border-t border-imperium-line pt-3">
          <h3 className="kicker mb-2">
            ☑ Checklist {checklistItens.length > 0 && <span className="text-stone-600">({checklistFeitos}/{checklistItens.length})</span>}
          </h3>
          <div className="space-y-1.5">
            {checklistItens.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={item.feito} onChange={() => onAlternarItem(item)} />
                <span className={`flex-1 ${item.feito ? "text-stone-600 line-through" : "text-stone-200"}`}>{item.titulo}</span>
                <button type="button" onClick={() => onExcluirItem(item.id)} className="text-[11px] text-stone-600 hover:text-wine-bright">
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={novoItemChecklist}
              onChange={(e) => setNovoItemChecklist(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAdicionarItem();
                }
              }}
              placeholder="Novo item..."
              className="input-imp flex-1 text-xs"
            />
            <button type="button" onClick={onAdicionarItem} className="btn-outline px-3 py-1 text-xs">
              +
            </button>
          </div>
        </div>

        {/* Comentários */}
        <div className="border-t border-imperium-line pt-3">
          <h3 className="kicker mb-2">💬 Comentários</h3>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {comentariosItens.map((c) => (
              <div key={c.id} className="group text-sm">
                <p className="flex items-center justify-between text-[11px] text-stone-500">
                  <span>
                    {nomePorId.get(c.autor_id) ?? "—"} · {new Date(c.created_at).toLocaleDateString("pt-BR")}
                  </span>
                  {c.autor_id === userId && (
                    <button
                      type="button"
                      onClick={() => onExcluirComentario(c.id)}
                      className="opacity-0 hover:text-wine-bright group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  )}
                </p>
                <p className="text-stone-200">{c.texto}</p>
              </div>
            ))}
            {comentariosItens.length === 0 && <p className="text-xs text-stone-600">Nenhum comentário ainda.</p>}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={novoComentario}
              onChange={(e) => setNovoComentario(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onAdicionarComentario();
                }
              }}
              placeholder="Escreva um comentário..."
              className="input-imp flex-1 text-xs"
            />
            <button type="button" onClick={onAdicionarComentario} className="btn-outline px-3 py-1 text-xs">
              Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
