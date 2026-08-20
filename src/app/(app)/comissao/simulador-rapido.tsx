"use client";

import { useState } from "react";
import { lookupComissao, type Tier, type Papel } from "@/lib/comissao";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function SimuladorVendaRapida({
  tiers,
  producaoAtual,
  papel,
}: {
  tiers: Tier[];
  producaoAtual: number;
  papel: Papel;
}) {
  const [valor, setValor] = useState(0);

  const atual = lookupComissao(tiers, producaoAtual, papel);
  const comValor = lookupComissao(tiers, producaoAtual + valor, papel);
  if (!atual || !comValor) return null;

  const mudaTier = comValor.tierIdx !== atual.tierIdx;
  const ganho = comValor.total - atual.total;

  return (
    <div className="rounded border border-imperium-line bg-imperium-bg/40 p-4">
      <p className="mb-2 text-xs uppercase tracking-wide text-stone-500">
        E se eu fechar mais uma venda hoje?
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-stone-400">Valor da venda (R$)</label>
          <input
            type="number"
            min={0}
            step={1000}
            value={valor}
            onChange={(e) => setValor(Math.max(0, Number(e.target.value) || 0))}
            className="input-imp w-40 text-sm"
          />
        </div>
        {valor > 0 && (
          <p className="text-sm text-stone-300">
            Produção iria pra <span className="text-gold">{moeda(producaoAtual + valor)}</span>
            {mudaTier ? (
              <>
                {" "}
                — você <span className="text-emerald-400">sobe de tier</span>, ganhando{" "}
                <span className="text-emerald-400">+{moeda(ganho)}</span> na comissão total do mês.
              </>
            ) : (
              <> — ainda no mesmo tier, comissão total sobe pra {moeda(comValor.total)}.</>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
