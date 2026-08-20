"use client";

import { useState } from "react";
import { FUNNEL_STAGES, FUNNEL_LABELS, type FunilEtapa } from "@/lib/funil";
import { Table, Th, Td, Tr } from "@/components/ui/Table";

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
    <div className="card-imp">
      <h2 className="kicker mb-4">Simulador de meta</h2>

      <label className="mb-1 block text-xs text-stone-400">Dias úteis restantes no mês</label>
      <input
        type="number"
        min={1}
        value={diasUteis}
        onChange={(e) => setDiasUteis(Math.max(1, Number(e.target.value) || 1))}
        className="input-imp mb-4 w-32"
      />

      <p className="mb-4 text-sm text-stone-300">
        Faltam <span className="text-gold">{gapPagos}</span> Pagos pra bater a meta do mês —{" "}
        <span className="text-gold">{pagosPorDia.toFixed(1)}</span> Pagos/dia necessários.
      </p>

      <Table>
        <thead>
          <tr>
            <Th>Etapa</Th>
            <Th align="right">Necessário/dia</Th>
          </tr>
        </thead>
        <tbody>
          {FUNNEL_STAGES.map((stage, i) => (
            <Tr key={stage}>
              <Td className="text-stone-300">{FUNNEL_LABELS[stage]}</Td>
              <Td align="right" className="text-stone-100">
                {necessarioPorDia[i] !== null ? necessarioPorDia[i]!.toFixed(1) : "—"}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      <p className="mt-3 text-xs text-stone-600">
        Cálculo usa a taxa de conversão real do mês entre etapas; sem dado realizado ainda, o
        simulador não tem base pra estimar (aparece &quot;—&quot;).
      </p>
    </div>
  );
}
