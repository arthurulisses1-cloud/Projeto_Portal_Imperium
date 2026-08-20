"use client";

import { useState } from "react";
import { lookupComissao, type Tier, type Papel } from "@/lib/comissao";

export default function SimuladorComissao({ tiers, papel }: { tiers: Tier[]; papel: Papel }) {
  const [producao, setProducao] = useState(0);
  const resultado = lookupComissao(tiers, producao, papel);

  return (
    <div className="card-imp">
      <h2 className="kicker mb-4">Simulador por faixa de produção</h2>
      <label className="mb-1 block text-xs text-stone-400">
        Produção hipotética do mês (R$)
      </label>
      <input
        type="number"
        min={0}
        step={1000}
        value={producao}
        onChange={(e) => setProducao(Math.max(0, Number(e.target.value) || 0))}
        className="input-imp mb-4 w-48"
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
            <p className="text-gold-bright">
              {resultado.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-stone-500">Tabela de comissão não configurada pro seu nível.</p>
      )}
      {resultado?.abaixoDoMinimo && (
        <p className="mt-3 text-xs text-gold">
          Produção abaixo do menor tier — o valor mostrado usa o tier mínimo como base.
        </p>
      )}
    </div>
  );
}
