"use client";

import { useState } from "react";
import { FUNNEL_STAGES, FUNNEL_LABELS, type FunilEtapa } from "@/lib/funil";

type Totais = Record<FunilEtapa, { realizado: number; meta: number }>;

export default function SimuladorMeta({ totais }: { totais: Totais }) {
  const [diasUteis, setDiasUteis] = useState(10);

  const gapPagos = Math.max(0, totais.pagos.meta - totais.pagos.realizado);
  const pagosPorDia = diasUteis > 0 ? gapPagos / diasUteis : 0;

  // taxa de conversão etapa[i] -> etapa[i+1], usando realizado do mês
  // (cai pra meta se ainda não tem realizado, e null se não dá pra calcular)
  function taxaConversao(i: number): number | null {
    const atual = totais[FUNNEL_STAGES[i]];
    const proxima = totais[FUNNEL_STAGES[i + 1]];
    if (atual.realizado > 0) return proxima.realizado / atual.realizado;
    if (atual.meta > 0) return proxima.meta / atual.meta;
    return null;
  }

  // volume diário necessário por etapa, calculado de trás pra frente a partir de Pagos/dia
  const necessarioPorDia: (number | null)[] = new Array(FUNNEL_STAGES.length).fill(null);
  necessarioPorDia[FUNNEL_STAGES.length - 1] = pagosPorDia;
  for (let i = FUNNEL_STAGES.length - 2; i >= 0; i--) {
    const proximo = necessarioPorDia[i + 1];
    const taxa = taxaConversao(i);
    necessarioPorDia[i] = proximo !== null && taxa ? proximo / taxa : null;
  }

  return (
    <div className="rounded-lg border border-stone-800 bg-[#111827] p-6">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-stone-400">
        Simulador de meta
      </h2>

      <label className="mb-1 block text-xs text-stone-400">Dias úteis restantes no mês</label>
      <input
        type="number"
        min={1}
        value={diasUteis}
        onChange={(e) => setDiasUteis(Math.max(1, Number(e.target.value) || 1))}
        className="mb-4 w-32 rounded border border-stone-700 bg-[#0b0f19] px-3 py-2 text-stone-100"
      />

      <p className="mb-4 text-sm text-stone-300">
        Faltam <span className="text-amber-400">{gapPagos}</span> Pagos pra bater a meta do
        mês —{" "}
        <span className="text-amber-400">{pagosPorDia.toFixed(1)}</span> Pagos/dia
        necessários.
      </p>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
            <th className="pb-2">Etapa</th>
            <th className="pb-2 text-right">Necessário/dia</th>
          </tr>
        </thead>
        <tbody>
          {FUNNEL_STAGES.map((stage, i) => (
            <tr key={stage} className="border-t border-stone-800">
              <td className="py-2 text-stone-300">{FUNNEL_LABELS[stage]}</td>
              <td className="py-2 text-right text-stone-100">
                {necessarioPorDia[i] !== null ? necessarioPorDia[i]!.toFixed(1) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-xs text-stone-600">
        Cálculo usa a taxa de conversão real do mês entre etapas; sem dado
        realizado ainda, o simulador não tem base pra estimar (aparece &quot;—&quot;).
      </p>
    </div>
  );
}
