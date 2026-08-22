"use client";

import { useState } from "react";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

export default function SimuladorDre({
  pctReceitaCredito,
  pctReceitaParceiro,
  pctImposto,
  despesasOperacionaisAtuais,
}: {
  pctReceitaCredito: number;
  pctReceitaParceiro: number;
  pctImposto: number;
  despesasOperacionaisAtuais: number;
}) {
  const [creditoVendido, setCreditoVendido] = useState(0);
  const [producaoParceiro, setProducaoParceiro] = useState(0);
  const [outrasReceitas, setOutrasReceitas] = useState(0);

  const receitaPropria = creditoVendido * pctReceitaCredito;
  const receitaParceiro = producaoParceiro * pctReceitaParceiro;
  const receitaBruta = receitaPropria + receitaParceiro + outrasReceitas;
  const imposto = receitaBruta * pctImposto;
  const receitaLiquida = receitaBruta - imposto;
  const lucro = receitaLiquida - despesasOperacionaisAtuais;

  return (
    <div>
      <p className="mb-3 text-xs text-stone-500">
        Simula a Receita e o Lucro pra um cenário hipotético de vendas — mantém as Despesas Operacionais fixas no
        valor atual do mês ({moeda(despesasOperacionaisAtuais)}, Folha + fixos + extras), porque a Folha depende de
        quem vendeu individualmente, não dá pra redistribuir de um total só.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-[10px] uppercase text-stone-500">Crédito vendido (R$)</label>
          <input
            type="number"
            min={0}
            step={1000}
            value={creditoVendido}
            onChange={(e) => setCreditoVendido(Math.max(0, Number(e.target.value) || 0))}
            className="input-imp text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase text-stone-500">Produção do parceiro (R$)</label>
          <input
            type="number"
            min={0}
            step={1000}
            value={producaoParceiro}
            onChange={(e) => setProducaoParceiro(Math.max(0, Number(e.target.value) || 0))}
            className="input-imp text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase text-stone-500">Outras receitas (R$)</label>
          <input
            type="number"
            min={0}
            step={1000}
            value={outrasReceitas}
            onChange={(e) => setOutrasReceitas(Math.max(0, Number(e.target.value) || 0))}
            className="input-imp text-sm"
          />
        </div>
      </div>

      <div className="mt-4 space-y-1.5 rounded border border-imperium-line bg-imperium-bg/40 p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-stone-400">Receita bruta</span>
          <span className="text-stone-100">{moeda(receitaBruta)}</span>
        </div>
        <div className="flex justify-between text-xs text-stone-600">
          <span>
            {moeda(receitaPropria)} crédito + {moeda(receitaParceiro)} parceiro + {moeda(outrasReceitas)} outras
          </span>
        </div>
        <div className="flex justify-between border-t border-imperium-line pt-1.5">
          <span className="text-stone-400">(-) Impostos ({(pctImposto * 100).toFixed(0)}%)</span>
          <span className="text-wine-bright">{moeda(imposto)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-stone-400">= Receita líquida</span>
          <span className="text-stone-100">{moeda(receitaLiquida)}</span>
        </div>
        <div className="flex justify-between border-t border-imperium-line pt-1.5">
          <span className="text-stone-400">(-) Despesas operacionais</span>
          <span className="text-wine-bright">{moeda(despesasOperacionaisAtuais)}</span>
        </div>
        <div className="flex justify-between border-t border-imperium-line pt-1.5 text-base">
          <span className="font-medium text-gold">= Lucro projetado</span>
          <span className={`font-display ${lucro >= 0 ? "text-success-bright" : "text-wine-bright"}`}>{moeda(lucro)}</span>
        </div>
      </div>
    </div>
  );
}
