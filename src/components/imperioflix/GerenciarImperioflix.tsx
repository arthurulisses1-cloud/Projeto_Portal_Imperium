"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  criarModulo,
  atualizarModulo,
  excluirModulo,
  registrarModuloItem,
  atualizarModuloItem,
  excluirModuloItem,
  moverModuloItem,
  salvarResumoAula,
} from "@/app/(app)/academy/actions";
import { RANK_ORDER } from "@/lib/carreira";
import { RANK_LABELS } from "@/lib/labels";
import type { Episodio, Serie } from "@/lib/imperioflix-util";

type Categoria = { value: string; label: string };

function Campo({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-stone-400">
        {label}
      </label>
      {children}
    </div>
  );
}

function CamposModulo({ categorias, modulo }: { categorias: Categoria[]; modulo?: Serie }) {
  const sufixo = modulo?.id ?? "novo";
  return (
    <>
      <Campo id={`titulo-${sufixo}`} label="Título do módulo">
        <input id={`titulo-${sufixo}`} name="titulo" required defaultValue={modulo?.titulo} placeholder="Ex: Prospecção Ativa" className="input-imp text-sm" />
      </Campo>
      <Campo id={`desc-${sufixo}`} label="Descrição (opcional)">
        <textarea id={`desc-${sufixo}`} name="descricao" rows={2} defaultValue={modulo?.descricao ?? ""} className="input-imp text-sm" />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id={`capa-${sufixo}`} label={modulo ? "Trocar capa (vertical, 2:3)" : "Capa (vertical, 2:3)"}>
          <input id={`capa-${sufixo}`} type="file" name="capa" accept="image/*" className="block w-full text-xs text-stone-300 file:mr-3 file:rounded file:border-0 file:bg-imperium-surface file:px-3 file:py-1.5 file:text-xs file:text-stone-200" />
        </Campo>
        <Campo id={`cat-${sufixo}`} label="Categoria (prateleira)">
          <select id={`cat-${sufixo}`} name="categoria" defaultValue={modulo?.categoria ?? ""} className="input-imp text-sm">
            <option value="">Sem categoria</option>
            {categorias.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-stone-300">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="destaque" defaultChecked={modulo?.destaque} className="accent-gold" />
          Destacar no Top 5
        </label>
        {modulo && (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="ativo" defaultChecked={modulo.ativo} className="accent-gold" />
            Visível para o time
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-stone-400">
        <span>Liberado para (nenhum marcado = todos):</span>
        {RANK_ORDER.map((r) => (
          <label key={r} className="flex items-center gap-1.5">
            <input type="checkbox" name="ranks_liberados" value={r} defaultChecked={modulo?.ranksLiberados.includes(r)} className="accent-gold" />
            {RANK_LABELS[r] ?? r}
          </label>
        ))}
      </div>
    </>
  );
}

// Botão "+ Novo módulo" da home (só Diretor).
export function NovoModulo({ categorias }: { categorias: Categoria[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function criar(fd: FormData) {
    setErro(null);
    startTransition(async () => {
      try {
        await criarModulo(fd);
        setAberto(false);
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível criar o módulo.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setAberto((v) => !v)} className="btn-outline px-4 py-2 text-sm">
        {aberto ? "Cancelar" : "+ Novo módulo"}
      </button>
      {aberto && (
        <form action={criar} className="space-y-3 rounded-xl border border-imperium-line bg-imperium-surface/80 p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">Novo módulo</p>
          <CamposModulo categorias={categorias} />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={isPending} className="btn-gold px-4 py-2 text-sm disabled:opacity-50">
              {isPending ? "Criando…" : "Criar módulo"}
            </button>
            {erro && <span className="text-xs text-wine-bright">{erro}</span>}
          </div>
          <p className="text-xs text-stone-500">Depois de criar, abra o módulo para adicionar vídeos e materiais.</p>
        </form>
      )}
    </div>
  );
}

// Painel do Diretor na página do módulo: conteúdo (adicionar/editar/ordenar/
// excluir) e configurações do módulo.
export function GerenciarModulo({ modulo, categorias }: { modulo: Serie; categorias: Categoria[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"video" | "arquivo">("video");
  const [enviando, setEnviando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [chave, setChave] = useState(0);

  function rodar(acao: () => Promise<void>) {
    setErro(null);
    startTransition(async () => {
      try {
        await acao();
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
      }
    });
  }

  async function adicionar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const dados = new FormData(form);
    setErro(null);
    setEnviando(true);
    try {
      const fd = new FormData();
      fd.set("modulo_id", modulo.id);
      fd.set("titulo", String(dados.get("titulo") ?? ""));
      fd.set("resumo", String(dados.get("resumo") ?? ""));
      fd.set("tipo", tipo);
      if (tipo === "video") {
        fd.set("video_url", String(dados.get("video_url") ?? ""));
      } else {
        const arquivo = (form.elements.namedItem("arquivo") as HTMLInputElement).files?.[0];
        if (!arquivo) throw new Error("Selecione o arquivo.");
        const supabase = createClient();
        const ext = arquivo.name.split(".").pop() || "bin";
        const path = `itens/${Date.now()}-${modulo.id}.${ext}`;
        const { error } = await supabase.storage.from("academy-modulos").upload(path, arquivo, { contentType: arquivo.type || undefined });
        if (error) throw error;
        fd.set("arquivo_url", supabase.storage.from("academy-modulos").getPublicUrl(path).data.publicUrl);
      }
      await registrarModuloItem(fd);
      form.reset();
      setChave((k) => k + 1);
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível adicionar.");
    } finally {
      setEnviando(false);
    }
  }

  function editarItem(fd: FormData) {
    rodar(async () => {
      await atualizarModuloItem(fd);
      setEditandoId(null);
    });
  }

  function acaoSimples(acao: (fd: FormData) => Promise<void>, campos: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    rodar(() => acao(fd));
  }

  return (
    <section className="space-y-6 rounded-xl border border-gold/40 bg-imperium-surface/80 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-xl text-stone-100">Gerenciar módulo</h2>
          <p className="text-xs text-stone-500">Só você vê este painel.</p>
        </div>
        {!modulo.ativo && <span className="rounded-full bg-warning/20 px-3 py-1 text-xs text-warning-bright">Oculto para o time</span>}
      </div>

      {/* conteúdo atual */}
      <div className="space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">Conteúdo ({modulo.episodios.length})</h3>
        {modulo.episodios.length === 0 ? (
          <p className="rounded-lg border border-dashed border-imperium-line-strong px-4 py-5 text-center text-sm text-stone-500">
            Nenhuma aula ainda. Adicione o primeiro vídeo ou arquivo abaixo.
          </p>
        ) : (
          <ul className="space-y-2">
            {modulo.episodios.map((ep, i) => (
              <li key={ep.id} className="rounded-lg border border-imperium-line bg-imperium-bg/60">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="w-5 text-center text-xs text-stone-500">{i + 1}</span>
                  <span className="text-base">{ep.videoUrl ? "▶️" : "📄"}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-stone-100">{ep.titulo}</span>
                  <button type="button" disabled={isPending || i === 0} onClick={() => acaoSimples(moverModuloItem, { id: ep.id, direcao: "cima" })} aria-label="Mover para cima" className="rounded px-2 py-1 text-xs text-stone-400 hover:bg-imperium-raised disabled:opacity-30">
                    ↑
                  </button>
                  <button type="button" disabled={isPending || i === modulo.episodios.length - 1} onClick={() => acaoSimples(moverModuloItem, { id: ep.id, direcao: "baixo" })} aria-label="Mover para baixo" className="rounded px-2 py-1 text-xs text-stone-400 hover:bg-imperium-raised disabled:opacity-30">
                    ↓
                  </button>
                  <button type="button" onClick={() => setEditandoId(editandoId === ep.id ? null : ep.id)} className="rounded px-2 py-1 text-xs text-gold hover:bg-imperium-raised">
                    {editandoId === ep.id ? "Fechar" : "Editar"}
                  </button>
                  <button type="button" disabled={isPending} onClick={() => confirm_(ep, acaoSimples)} className="rounded px-2 py-1 text-xs text-stone-500 hover:bg-wine/20 hover:text-wine-bright">
                    ✕
                  </button>
                </div>
                {editandoId === ep.id && <FormEditarItem ep={ep} onSalvar={editarItem} pendente={isPending} />}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* adicionar */}
      <form key={chave} onSubmit={adicionar} className="space-y-3 rounded-lg border border-dashed border-imperium-line-strong p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">Adicionar aula ao módulo</h3>
        <div className="flex flex-wrap gap-4 text-sm text-stone-200">
          <label className="flex items-center gap-2">
            <input type="radio" name="tipo-novo" checked={tipo === "video"} onChange={() => setTipo("video")} className="accent-gold" />
            Vídeo (link do YouTube, Vimeo, Loom)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="tipo-novo" checked={tipo === "arquivo"} onChange={() => setTipo("arquivo")} className="accent-gold" />
            Arquivo (PDF, slides, planilha)
          </label>
        </div>
        <Campo id="novo-item-titulo" label="Título">
          <input id="novo-item-titulo" name="titulo" required placeholder="Ex: Como abordar o primeiro contato" className="input-imp text-sm" />
        </Campo>
        <Campo id="novo-item-resumo" label="Resumo (opcional)">
          <textarea id="novo-item-resumo" name="resumo" rows={2} className="input-imp text-sm" />
        </Campo>
        {tipo === "video" ? (
          <Campo id="novo-item-video" label="Link do vídeo">
            <input id="novo-item-video" name="video_url" type="url" required placeholder="https://www.youtube.com/watch?v=…" className="input-imp text-sm" />
          </Campo>
        ) : (
          <Campo id="novo-item-arquivo" label="Arquivo">
            <input id="novo-item-arquivo" name="arquivo" type="file" required className="block w-full text-xs text-stone-300 file:mr-3 file:rounded file:border-0 file:bg-imperium-surface file:px-3 file:py-1.5 file:text-xs file:text-stone-200" />
          </Campo>
        )}
        <button type="submit" disabled={enviando} className="btn-gold px-4 py-2 text-sm disabled:opacity-50">
          {enviando ? "Enviando…" : "Adicionar"}
        </button>
      </form>

      {/* configurações do módulo */}
      <details className="rounded-lg border border-imperium-line">
        <summary className="cursor-pointer px-4 py-3 text-sm text-stone-200">Configurações do módulo (título, capa, categoria, acesso)</summary>
        <form
          key={modulo.id + modulo.titulo}
          action={(fd) => rodar(() => atualizarModulo(fd))}
          className="space-y-3 border-t border-imperium-line p-4"
        >
          <input type="hidden" name="id" value={modulo.id} />
          <CamposModulo categorias={categorias} modulo={modulo} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={isPending} className="btn-gold px-4 py-2 text-sm disabled:opacity-50">
              Salvar configurações
            </button>
            {confirmarExclusao ? (
              <span className="flex items-center gap-2 text-xs text-stone-300">
                Excluir o módulo e todas as aulas?
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("id", modulo.id);
                    setErro(null);
                    startTransition(async () => {
                      try {
                        await excluirModulo(fd);
                        router.push("/academy/imperioflix");
                        router.refresh();
                      } catch (e) {
                        setErro(e instanceof Error ? e.message : "Não foi possível excluir.");
                      }
                    });
                  }}
                  className="rounded bg-wine px-3 py-1.5 text-white"
                >
                  Sim, excluir
                </button>
                <button type="button" onClick={() => setConfirmarExclusao(false)} className="text-stone-500 hover:text-stone-300">
                  Cancelar
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmarExclusao(true)} className="text-xs text-stone-500 hover:text-wine-bright">
                Excluir módulo
              </button>
            )}
          </div>
        </form>
      </details>

      {erro && <p className="text-xs text-wine-bright">{erro}</p>}
    </section>
  );
}

// Confirma antes de excluir (sem alert: o botão vira "confirmar" no próprio lugar via estado local).
function confirm_(ep: Episodio, acao: (a: (fd: FormData) => Promise<void>, c: Record<string, string>) => void) {
  if (typeof window !== "undefined" && !window.confirm(`Excluir "${ep.titulo}"?`)) return;
  acao(excluirModuloItem, { id: ep.id });
}

function FormEditarItem({ ep, onSalvar, pendente }: { ep: Episodio; onSalvar: (fd: FormData) => void; pendente: boolean }) {
  return (
    <form action={onSalvar} className="space-y-3 border-t border-imperium-line p-3">
      <input type="hidden" name="id" value={ep.id} />
      <Campo id={`ed-titulo-${ep.id}`} label="Título">
        <input id={`ed-titulo-${ep.id}`} name="titulo" required defaultValue={ep.titulo} className="input-imp text-sm" />
      </Campo>
      <Campo id={`ed-resumo-${ep.id}`} label="Resumo">
        <textarea id={`ed-resumo-${ep.id}`} name="resumo" rows={2} defaultValue={ep.resumo ?? ""} className="input-imp text-sm" />
      </Campo>
      {ep.videoUrl !== null && (
        <Campo id={`ed-video-${ep.id}`} label="Link do vídeo">
          <input id={`ed-video-${ep.id}`} name="video_url" type="url" defaultValue={ep.videoUrl ?? ""} className="input-imp text-sm" />
        </Campo>
      )}
      <button type="submit" disabled={pendente} className="btn-gold px-4 py-1.5 text-sm disabled:opacity-50">
        Salvar
      </button>
    </form>
  );
}

// Painel "Editar esta aula" na página da aula — Diretor (aula de trilha ou de
// módulo) e o instrutor da própria aula (só resumo e vídeo).
export function EditarAula({ episodio, ehModulo }: { episodio: Episodio; ehModulo: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  function salvar(fd: FormData) {
    setErro(null);
    setSalvo(false);
    startTransition(async () => {
      try {
        if (ehModulo) await atualizarModuloItem(fd);
        else await salvarResumoAula(fd);
        setSalvo(true);
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
      }
    });
  }

  return (
    <details className="rounded-xl border border-gold/40 bg-imperium-surface/80">
      <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-stone-100">Editar esta aula (vídeo e resumo)</summary>
      <form action={salvar} className="space-y-3 border-t border-imperium-line p-5">
        <input type="hidden" name="id" value={episodio.id} />
        {ehModulo && (
          <Campo id="aula-titulo" label="Título">
            <input id="aula-titulo" name="titulo" required defaultValue={episodio.titulo} className="input-imp text-sm" />
          </Campo>
        )}
        <Campo id="aula-video" label="Link do vídeo (YouTube, Vimeo, Loom)">
          <input id="aula-video" name="video_url" type="url" defaultValue={episodio.videoUrl ?? ""} placeholder="https://www.youtube.com/watch?v=…" className="input-imp text-sm" />
        </Campo>
        <Campo id="aula-resumo" label="Resumo da aula">
          <textarea id="aula-resumo" name="resumo" rows={4} defaultValue={episodio.resumo ?? ""} className="input-imp text-sm" />
        </Campo>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={isPending} className="btn-gold px-4 py-2 text-sm disabled:opacity-50">
            {isPending ? "Salvando…" : "Salvar"}
          </button>
          {salvo && <span className="text-xs text-success-bright">✓ Salvo</span>}
          {erro && <span className="text-xs text-wine-bright">{erro}</span>}
        </div>
      </form>
    </details>
  );
}
