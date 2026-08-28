"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarMotivoPerda, alternarMotivoPerdaAtivo, editarMotivoPerda, excluirMotivoPerda } from "@/app/(app)/leads/actions";
import Card from "@/components/ui/Card";

export type MotivoPerdaLinha = { id: string; nome: string; ativo: boolean; etapa: string | null };

// Mesma lista de ETAPAS_DE_PERDA_VALIDAS em actions.ts / ETAPAS_DE_PERDA em
// LeadsView.tsx — motivo de perda específico por etapa (migration 0059,
// pedido do Diretor, 2026-08-28).
const ETAPAS_DE_PERDA = [
  { valor: "validacao_entrevista", label: "Validação de Entrevista" },
  { valor: "entrevista_validada", label: "Entrevista Validada" },
  { valor: "fechamento", label: "Fechamento" },
  { valor: "subido", label: "Subido" },
  { valor: "ccb_enviada", label: "CCB Enviada" },
  { valor: "assinado", label: "Assinado" },
] as const;

function etapaLabel(etapa: string | null) {
  if (!etapa) return "Qualquer etapa";
  return ETAPAS_DE_PERDA.find((e) => e.valor === etapa)?.label ?? etapa;
}

export default function MotivosPerdaForm({ motivos }: { motivos: MotivoPerdaLinha[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [etapaEdicao, setEtapaEdicao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  function onAlternar(m: MotivoPerdaLinha) {
    const fd = new FormData();
    fd.set("id", m.id);
    fd.set("ativo", String(m.ativo));
    startTransition(async () => {
      await alternarMotivoPerdaAtivo(fd);
      router.refresh();
    });
  }

  function iniciarEdicao(m: MotivoPerdaLinha) {
    setEditandoId(m.id);
    setNomeEdicao(m.nome);
    setEtapaEdicao(m.etapa ?? "");
    setErro(null);
  }

  function salvarEdicao(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("nome", nomeEdicao);
    fd.set("etapa", etapaEdicao);
    startTransition(async () => {
      try {
        await editarMotivoPerda(fd);
        setEditandoId(null);
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao salvar.");
      }
    });
  }

  function onExcluir(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      try {
        await excluirMotivoPerda(fd);
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao excluir.");
      }
    });
  }

  return (
    <details className="card-imp group">
      <summary className="kicker flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
        <span>Motivos de Perda (só você vê isso)</span>
        <span className="text-[10px] normal-case text-stone-500 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-4 space-y-4">
        {erro && (
          <p className="rounded border border-wine/40 bg-wine/10 px-3 py-2 text-xs text-wine-bright">{erro}</p>
        )}

        <Card title="Cadastrados">
          {motivos.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhum motivo cadastrado ainda.</p>
          ) : (
            <ul className="space-y-1.5">
              {motivos.map((m) =>
                editandoId === m.id ? (
                  <li key={m.id} className="flex flex-wrap items-end gap-2 rounded border border-gold/30 bg-gold/5 p-2">
                    <div className="flex-1">
                      <input
                        value={nomeEdicao}
                        onChange={(e) => setNomeEdicao(e.target.value)}
                        className="input-imp w-full text-sm"
                      />
                    </div>
                    <select value={etapaEdicao} onChange={(e) => setEtapaEdicao(e.target.value)} className="input-imp w-44 text-sm">
                      <option value="">Qualquer etapa</option>
                      {ETAPAS_DE_PERDA.map((e) => (
                        <option key={e.valor} value={e.valor}>
                          {e.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={isPending || !nomeEdicao.trim()}
                      onClick={() => salvarEdicao(m.id)}
                      className="btn-gold px-2.5 py-1.5 text-xs"
                    >
                      Salvar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditandoId(null)}
                      className="text-[11px] text-stone-500 hover:text-stone-300"
                    >
                      Cancelar
                    </button>
                  </li>
                ) : (
                  <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className={m.ativo ? "text-stone-200" : "text-stone-600 line-through"}>{m.nome}</span>
                      <span className="ml-2 rounded-full bg-imperium-bg px-1.5 py-0.5 text-[10px] text-stone-500">{etapaLabel(m.etapa)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <button type="button" onClick={() => iniciarEdicao(m)} className="text-[11px] text-stone-500 hover:text-gold-bright">
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => onAlternar(m)}
                        className="text-[11px] text-stone-500 hover:text-gold-bright"
                      >
                        {m.ativo ? "Desativar" : "Reativar"}
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => onExcluir(m.id)}
                        className="text-[11px] text-stone-500 hover:text-wine-bright"
                      >
                        Excluir
                      </button>
                    </span>
                  </li>
                )
              )}
            </ul>
          )}
        </Card>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              await criarMotivoPerda(fd);
              e.currentTarget.reset();
              router.refresh();
            });
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex-1">
            <label className="mb-1 block text-xs text-stone-400">Novo motivo</label>
            <input name="nome" required placeholder="Ex: Sem interesse no momento" className="input-imp" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-400">Etapa</label>
            <select name="etapa" defaultValue="" className="input-imp w-48">
              <option value="">Qualquer etapa</option>
              {ETAPAS_DE_PERDA.map((e) => (
                <option key={e.valor} value={e.valor}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={isPending} className="btn-gold">
            Adicionar
          </button>
        </form>
      </div>
    </details>
  );
}
