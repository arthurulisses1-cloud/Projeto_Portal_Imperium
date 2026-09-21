"use client";

import { useState } from "react";
import type { Modulo, ModuloItem } from "@/lib/academy";
import { RANK_ORDER, type Rank } from "@/lib/carreira";
import { RANK_LABELS } from "@/lib/labels";
import { criarModulo, atualizarModulo, excluirModulo, criarModuloItem, excluirModuloItem } from "./actions";

export default function ModulosAdmin({
  modulos,
  itensPorModulo,
}: {
  modulos: Modulo[];
  itensPorModulo: Record<string, ModuloItem[]>;
}) {
  const [moduloAberto, setModuloAberto] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg text-gold-bright">Trilhas Alternativas</h2>
          <p className="text-xs text-stone-400">Módulos livres — vídeos, PDFs e conteúdos extras fora da grade oficial.</p>
        </div>
        <button onClick={() => setCriando((v) => !v)} className="btn-gold px-3 py-1.5 text-xs">
          {criando ? "cancelar" : "+ Módulo"}
        </button>
      </div>

      {criando && <FormNovoModulo onDone={() => setCriando(false)} />}

      <div className="space-y-2">
        {modulos.map((m) => (
          <ModuloCard
            key={m.id}
            modulo={m}
            itens={itensPorModulo[m.id] ?? []}
            aberto={moduloAberto === m.id}
            onToggle={() => setModuloAberto(moduloAberto === m.id ? null : m.id)}
          />
        ))}
        {modulos.length === 0 && !criando && (
          <p className="text-xs text-stone-600">Nenhum módulo alternativo criado ainda.</p>
        )}
      </div>
    </div>
  );
}

function RanksCheckboxes({ defaultValue }: { defaultValue: Rank[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="text-[10px] text-stone-500">Liberado pra (vazio = todo mundo):</span>
      {RANK_ORDER.map((r) => (
        <label key={r} className="flex items-center gap-1 text-[10px] text-stone-400">
          <input type="checkbox" name="ranks_liberados" value={r} defaultChecked={defaultValue.includes(r)} className="accent-gold" />
          {RANK_LABELS[r] ?? r}
        </label>
      ))}
    </div>
  );
}

function FormNovoModulo({ onDone }: { onDone: () => void }) {
  return (
    <form
      action={async (fd) => {
        await criarModulo(fd);
        onDone();
      }}
      className="space-y-2 rounded border border-imperium-line bg-imperium-surface p-3"
      encType="multipart/form-data"
    >
      <input name="titulo" placeholder="Título do módulo (ex: Prospecção Ativa)" required className="input-imp px-2 py-1 text-xs" />
      <textarea name="descricao" placeholder="Descrição (opcional)" rows={2} className="input-imp text-xs" />
      <input type="file" name="capa" accept="image/*" className="text-xs text-stone-300" />
      <RanksCheckboxes defaultValue={[]} />
      <button type="submit" className="btn-outline px-3 py-1 text-[10px]">Criar módulo</button>
    </form>
  );
}

function ModuloCard({
  modulo,
  itens,
  aberto,
  onToggle,
}: {
  modulo: Modulo;
  itens: ModuloItem[];
  aberto: boolean;
  onToggle: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [addItem, setAddItem] = useState(false);

  return (
    <div className="overflow-hidden rounded border border-imperium-line">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-2 bg-imperium-bg/40 p-3 text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm text-stone-100">{modulo.titulo}</span>
          {!modulo.ativo && <span className="rounded-full bg-wine/30 px-2 py-0.5 text-[10px] text-wine-bright">inativo</span>}
          <span className="text-[10px] text-stone-500">{itens.length} item(ns)</span>
        </div>
        <span className="text-[10px] text-stone-500">{aberto ? "▾" : "▸"}</span>
      </button>

      {aberto && (
        <div className="space-y-3 border-t border-imperium-line bg-imperium-bg/20 p-3">
          <div className="flex items-center gap-2 text-[10px] text-stone-500">
            <button onClick={() => setEditando((v) => !v)} className="hover:text-gold">
              {editando ? "fechar edição" : "editar módulo"}
            </button>
            <span className="ml-auto" />
            <form action={excluirModulo} className="inline">
              <input type="hidden" name="id" value={modulo.id} />
              <button type="submit" className="text-wine-bright hover:underline">Excluir módulo</button>
            </form>
          </div>

          {editando && (
            <form action={atualizarModulo} className="space-y-2" encType="multipart/form-data">
              <input type="hidden" name="id" value={modulo.id} />
              <input name="titulo" defaultValue={modulo.titulo} className="input-imp px-2 py-1 text-xs" />
              <textarea name="descricao" defaultValue={modulo.descricao ?? ""} rows={2} className="input-imp text-xs" />
              <input type="file" name="capa" accept="image/*" className="text-xs text-stone-300" />
              <label className="flex items-center gap-1 text-[10px] text-stone-400">
                <input type="checkbox" name="ativo" defaultChecked={modulo.ativo} className="accent-gold" />
                Ativo (visível pra quem tem acesso)
              </label>
              <RanksCheckboxes defaultValue={modulo.ranksLiberados} />
              <button type="submit" className="btn-outline px-3 py-1 text-[10px]">Salvar</button>
            </form>
          )}

          <div className="space-y-1.5">
            {itens.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-2 rounded border border-imperium-line px-2 py-1.5 text-xs">
                <span className="text-stone-300">
                  {item.tipo === "video" ? "🎬" : "📄"} {item.titulo}
                </span>
                <form action={excluirModuloItem}>
                  <input type="hidden" name="id" value={item.id} />
                  <button type="submit" className="text-[10px] text-wine-bright hover:underline">excluir</button>
                </form>
              </div>
            ))}
          </div>

          <button onClick={() => setAddItem((v) => !v)} className="text-[10px] text-gold hover:underline">
            {addItem ? "cancelar" : "+ item"}
          </button>
          {addItem && <FormNovoItem moduloId={modulo.id} onDone={() => setAddItem(false)} />}
        </div>
      )}
    </div>
  );
}

function FormNovoItem({ moduloId, onDone }: { moduloId: string; onDone: () => void }) {
  const [tipo, setTipo] = useState<"video" | "arquivo">("video");
  return (
    <form
      action={async (fd) => {
        await criarModuloItem(fd);
        onDone();
      }}
      className="space-y-2 rounded border border-imperium-line bg-imperium-surface p-2"
      encType="multipart/form-data"
    >
      <input type="hidden" name="modulo_id" value={moduloId} />
      <input name="titulo" placeholder="Título do item" required className="input-imp px-2 py-1 text-xs" />
      <textarea name="resumo" placeholder="Resumo (opcional)" rows={2} className="input-imp text-xs" />
      <div className="flex items-center gap-3 text-[10px] text-stone-400">
        <label className="flex items-center gap-1">
          <input type="radio" name="tipo" value="video" checked={tipo === "video"} onChange={() => setTipo("video")} />
          Vídeo (link)
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" name="tipo" value="arquivo" checked={tipo === "arquivo"} onChange={() => setTipo("arquivo")} />
          Arquivo (PDF/slide)
        </label>
      </div>
      {tipo === "video" ? (
        <input name="video_url" type="url" placeholder="https://youtube.com/..." required className="input-imp px-2 py-1 text-xs" />
      ) : (
        <input type="file" name="arquivo" required className="text-xs text-stone-300" />
      )}
      <button type="submit" className="btn-outline px-3 py-1 text-[10px]">Adicionar</button>
    </form>
  );
}
