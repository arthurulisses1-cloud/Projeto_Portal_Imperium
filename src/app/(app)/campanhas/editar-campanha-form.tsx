"use client";

import { useState } from "react";
import { atualizarCampanha } from "./actions";
import { FUNNEL_STAGES, FUNNEL_LABELS } from "@/lib/funil";

export type CampanhaParaEditar = {
  id: string;
  titulo: string;
  descricao: string | null;
  requisitosMinimos: string | null;
  recompensa: string | null;
  metrica: string;
  papelCredito: string;
  alvo: string;
  imagemPosicao: string;
  metaValor: number | null;
  dataInicio: string;
  dataFim: string;
};

// Edita só os dados "de conteúdo" da campanha (título, descrição, imagem,
// métrica/papel, meta, período) — de propósito não mexe em alvo/
// participantes (ver comentário em atualizarCampanha, src/app/(app)/campanhas/actions.ts).
export default function EditarCampanhaForm({ campanha }: { campanha: CampanhaParaEditar }) {
  const [metrica, setMetrica] = useState(campanha.metrica);

  return (
    <details className="mt-2 w-full rounded border border-imperium-line p-2">
      <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-stone-500 hover:text-gold">
        Editar
      </summary>
      <form action={atualizarCampanha} className="mt-3 space-y-3">
        <input type="hidden" name="id" value={campanha.id} />
        <div>
          <label className="mb-1 block text-xs text-stone-400">Título</label>
          <input name="titulo" required defaultValue={campanha.titulo} className="input-imp" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-stone-400">Descrição</label>
          <textarea name="descricao" rows={2} defaultValue={campanha.descricao ?? ""} className="input-imp" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-stone-400">Requisitos mínimos</label>
          <textarea name="requisitos_minimos" rows={2} defaultValue={campanha.requisitosMinimos ?? ""} className="input-imp" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-stone-400">Recompensa</label>
          <input name="recompensa" defaultValue={campanha.recompensa ?? ""} className="input-imp" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-stone-400">Trocar imagem (opcional — deixe vazio pra manter a atual)</label>
          <input type="file" name="imagem" accept="image/*" className="text-sm text-stone-300" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-stone-400">Enquadramento da imagem</label>
          <select name="imagem_posicao" defaultValue={campanha.imagemPosicao} className="input-imp w-40">
            <option value="top">Topo</option>
            <option value="center">Centro</option>
            <option value="bottom">Base</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs text-stone-400">Métrica</label>
            <select name="metrica" value={metrica} onChange={(e) => setMetrica(e.target.value)} className="input-imp">
              <option value="credito">Crédito (R$)</option>
              {FUNNEL_STAGES.map((e) => (
                <option key={e} value={e}>
                  {FUNNEL_LABELS[e]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-400">Meta numérica</label>
            <input type="number" name="meta_valor" step="0.01" defaultValue={campanha.metaValor ?? undefined} className="input-imp" />
          </div>
        </div>
        {metrica === "credito" && (campanha.alvo === "individual" || campanha.alvo === "grupo_rank") && (
          <div>
            <label className="mb-1 block text-xs text-stone-400">Contar produção como</label>
            <select name="papel_credito" defaultValue={campanha.papelCredito} className="input-imp w-64">
              <option value="total">Total (SDR + Closer, sem duplicar)</option>
              <option value="sdr">Só produção como SDR</option>
              <option value="closer">Só produção como Closer</option>
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-stone-400">Período</label>
          <div className="flex gap-3">
            <input type="date" name="data_inicio" required defaultValue={campanha.dataInicio} className="input-imp" />
            <input type="date" name="data_fim" required defaultValue={campanha.dataFim} className="input-imp" />
          </div>
        </div>
        <button type="submit" className="btn-gold px-4 py-2 text-xs">
          Salvar alterações
        </button>
      </form>
    </details>
  );
}
