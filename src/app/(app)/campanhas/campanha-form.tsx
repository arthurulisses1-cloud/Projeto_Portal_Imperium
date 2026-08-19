"use client";

import { useState } from "react";
import { criarCampanha } from "./actions";
import { FUNNEL_STAGES, FUNNEL_LABELS } from "@/lib/funil";

type Opcao = { id: string; label: string };

export default function CampanhaForm({
  pessoas,
  tribos,
  exercitos,
}: {
  pessoas: Opcao[];
  tribos: Opcao[];
  exercitos: Opcao[];
}) {
  const [alvo, setAlvo] = useState<"geral" | "individual" | "tribo" | "exercito">("geral");

  const opcoes = alvo === "individual" ? pessoas : alvo === "tribo" ? tribos : alvo === "exercito" ? exercitos : [];

  function preencherPeriodo(tipo: "hoje" | "semana" | "mes") {
    const inicioEl = document.getElementById("campanha-data-inicio") as HTMLInputElement | null;
    const fimEl = document.getElementById("campanha-data-fim") as HTMLInputElement | null;
    if (!inicioEl || !fimEl) return;
    const hoje = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (tipo === "hoje") {
      inicioEl.value = fmt(hoje);
      fimEl.value = fmt(hoje);
    } else if (tipo === "semana") {
      const diaSemana = hoje.getDay();
      const seg = new Date(hoje);
      seg.setDate(hoje.getDate() - ((diaSemana + 6) % 7));
      const dom = new Date(seg);
      dom.setDate(seg.getDate() + 6);
      inicioEl.value = fmt(seg);
      fimEl.value = fmt(dom);
    } else {
      const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const ultimo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
      inicioEl.value = fmt(primeiro);
      fimEl.value = fmt(ultimo);
    }
  }

  return (
    <form action={criarCampanha} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs text-stone-400">Título</label>
        <input name="titulo" required placeholder="Ex: Se bater R$500k, churrasco!" className="input-imp" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-stone-400">Descrição (opcional)</label>
        <textarea name="descricao" rows={2} className="input-imp" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-stone-400">Imagem (opcional)</label>
        <input type="file" name="imagem" accept="image/*" className="text-sm text-stone-300" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs text-stone-400">Tipo</label>
          <select name="alvo" value={alvo} onChange={(e) => setAlvo(e.target.value as typeof alvo)} className="input-imp">
            <option value="geral">Meta geral (empresa toda)</option>
            <option value="individual">Duelo entre pessoas</option>
            <option value="tribo">Duelo entre Tribos</option>
            <option value="exercito">Duelo entre Exércitos</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-stone-400">Métrica</label>
          <select name="metrica" className="input-imp">
            <option value="credito">Crédito (R$)</option>
            {FUNNEL_STAGES.map((e) => (
              <option key={e} value={e}>
                {FUNNEL_LABELS[e]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {alvo !== "geral" && (
        <div>
          <label className="mb-1 block text-xs text-stone-400">Participantes do duelo</label>
          <div className="grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto rounded border border-imperium-line p-2 sm:grid-cols-3">
            {opcoes.map((o) => (
              <label key={o.id} className="flex items-center gap-1.5 text-xs text-stone-300">
                <input type="checkbox" name="participante" value={`${o.id}::${o.label}`} />
                {o.label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs text-stone-400">Meta numérica (opcional — deixe vazio pra ranking livre)</label>
        <input type="number" name="meta_valor" step="0.01" className="input-imp w-48" />
      </div>

      <div>
        <label className="mb-1 block text-xs text-stone-400">Período</label>
        <div className="mb-2 flex gap-2">
          <button type="button" onClick={() => preencherPeriodo("hoje")} className="btn-outline px-2 py-1 text-xs">
            Hoje
          </button>
          <button type="button" onClick={() => preencherPeriodo("semana")} className="btn-outline px-2 py-1 text-xs">
            Esta semana
          </button>
          <button type="button" onClick={() => preencherPeriodo("mes")} className="btn-outline px-2 py-1 text-xs">
            Este mês
          </button>
        </div>
        <div className="flex gap-3">
          <input id="campanha-data-inicio" type="date" name="data_inicio" required className="input-imp" />
          <input id="campanha-data-fim" type="date" name="data_fim" required className="input-imp" />
        </div>
      </div>

      <button type="submit" className="btn-gold">
        Criar campanha
      </button>
    </form>
  );
}
