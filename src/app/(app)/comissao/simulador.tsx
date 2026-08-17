"use client";

import { useState } from "react";
import { lookupComissao, type Tier } from "@/lib/comissao";

export default function SimuladorComissao({ tiers }: { tiers: Tier[] }) {
  const [producao, setProducao] = useState(0);
  const resultado = lookupComissao(tiers, producao);

  return (
    <div className="rounded-lg border border-stone-800 bg-[#111827] p-6">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-stone-400">
        Simulador por faixa de produção
      </h2>
      <label className="mb-1 block text-xs text-stone-400">
        Produção hipotética do mês (R$)
      </label>
      <input
        type="number"
        min={0}
        step={1000}
        value={producao}
        onChange={(e) => setProducao(Math.max(0, Number(e.target.value) || 0))}
        className="mb-4 w-48 rounded border border-stone-700 bg-[#0b0f19] px-3 py-2 text-stone-100"
      />

      {resultado ? (
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-stone-500">Fixo</p>
            <p className="text-stone-100">
              {resultado.fixo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          </div>
          <div>
            <p className="text-stone-500">Variável ({resultado.pct}%)</p>
            <p className="text-stone-100">
              {resultado.variavel.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </p>
          </div>
          <div>
            <p className="text-stone-500">Total</p>
            <p className="text-amber-400">
              {resultado.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-stone-500">Tabela de comissão não configurada pro seu nível.</p>
      )}
      {resultado?.abaixoDoMinimo && (
        <p className="mt-3 text-xs text-amber-500">
          Produção abaixo do menor tier — o valor mostrado usa o tier mínimo como base.
        </p>
      )}
    </div>
  );
}
