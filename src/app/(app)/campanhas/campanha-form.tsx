"use client";

import { useState } from "react";
import { criarCampanha } from "./actions";
import { FUNNEL_STAGES, FUNNEL_LABELS } from "@/lib/funil";
import { RANK_ORDER } from "@/lib/carreira";
import { RANK_LABELS } from "@/lib/labels";

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
  const [alvo, setAlvo] = useState<"geral" | "individual" | "tribo" | "exercito" | "grupo_rank">("geral");
  const [metrica, setMetrica] = useState("credito");

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
        <label className="mb-1 block text-xs text-stone-400">Requisitos mínimos (opcional)</label>
        <textarea
          name="requisitos_minimos"
          rows={2}
          placeholder="Ex: precisa ter pelo menos 3 vendas pagas no período pra concorrer"
          className="input-imp"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-stone-400">Recompensa da campanha (opcional)</label>
        <input name="recompensa" placeholder="Ex: R$500 de bônus + jantar de equipe" className="input-imp" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-stone-400">Imagem (opcional)</label>
        <input type="file" name="imagem" accept="image/*" className="text-sm text-stone-300" />
        <p className="mt-1 text-[11px] text-stone-600">
          O card mostra a foto na proporção 4:3 (o tamanho padrão de foto do WhatsApp, ex.: 1600×1200px) — foto
          já nessa proporção não corta quase nada. Se vier mais quadrada ou vertical, use
          &ldquo;Enquadramento&rdquo; abaixo pra escolher qual parte fica visível.
        </p>
      </div>
      <div>
        <label className="mb-1 block text-xs text-stone-400">Enquadramento da imagem</label>
        <select name="imagem_posicao" defaultValue="center" className="input-imp w-40">
          <option value="top">Topo</option>
          <option value="center">Centro</option>
          <option value="bottom">Base</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-xs text-stone-400">Tipo</label>
          <select name="alvo" value={alvo} onChange={(e) => setAlvo(e.target.value as typeof alvo)} className="input-imp">
            <option value="geral">Meta geral (empresa toda)</option>
            <option value="individual">Duelo entre pessoas</option>
            <option value="tribo">Duelo entre Tribos</option>
            <option value="exercito">Duelo entre Exércitos</option>
            <option value="grupo_rank">Grupo Específico (por Cargo)</option>
          </select>
        </div>
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
      </div>

      {metrica === "credito" && (alvo === "individual" || alvo === "grupo_rank") && (
        <div>
          <label className="mb-1 block text-xs text-stone-400">Contar produção como</label>
          <select name="papel_credito" defaultValue="total" className="input-imp w-64">
            <option value="total">Total (SDR + Closer, sem duplicar)</option>
            <option value="sdr">Só produção como SDR</option>
            <option value="closer">Só produção como Closer</option>
          </select>
          <p className="mt-1 text-[11px] text-stone-600">
            Pago como SDR e pago como Closer são coisas diferentes pra quem faz os dois papéis — se o duelo é
            &ldquo;melhor Closer do mês&rdquo;, escolha &ldquo;Só produção como Closer&rdquo;.
          </p>
        </div>
      )}

      {alvo === "grupo_rank" ? (
        <div>
          <label className="mb-1 block text-xs text-stone-400">Cargos participantes</label>
          <p className="mb-1.5 text-[11px] text-stone-600">
            Todo mundo com esse Cargo entra no duelo automaticamente — não precisa marcar pessoa por pessoa.
          </p>
          <div className="flex flex-wrap gap-3 rounded border border-imperium-line p-2">
            {RANK_ORDER.map((r) => (
              <label key={r} className="flex items-center gap-1.5 text-xs text-stone-300">
                <input type="checkbox" name="rank_participante" value={r} />
                {RANK_LABELS[r] ?? r}
              </label>
            ))}
          </div>
        </div>
      ) : (
        alvo !== "geral" && (
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
        )
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
