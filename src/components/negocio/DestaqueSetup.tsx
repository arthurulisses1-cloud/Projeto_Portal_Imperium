// Deixa claro no Mural que parte da meta de recebido é setup/implantação (Match Sales): é onde o volume de recebido cresce.
import type { PaceCalculado } from "@/lib/pace-negocio";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function DestaqueSetup({ setup, recebidoMeta, time = false, cor }: { setup: PaceCalculado; recebidoMeta: number; time?: boolean; cor: string }) {
  const pctDaMeta = recebidoMeta > 0 ? Math.round((setup.meta / recebidoMeta) * 100) : null;
  const pct = setup.meta > 0 ? Math.min(100, (setup.recebido / setup.meta) * 100) : 0;
  const faltam = Math.max(0, setup.meta - setup.recebido);
  return (
    <section className="rounded-lg border bg-imperium-surface p-4" style={{ borderColor: `rgb(${cor} / 0.55)` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">{time ? "Setup / implantação do time" : "Seu setup / implantação"}</p>
        <p className="text-xs text-stone-400">
          {pctDaMeta !== null ? `${pctDaMeta}% da meta de recebido é setup` : "parte da meta de recebido é setup"}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p className="text-2xl font-semibold text-gold-bright">{moeda(setup.recebido)}</p>
        <p className="text-sm text-stone-400">
          de {moeda(setup.meta)} {faltam > 0 ? `· faltam ${moeda(faltam)}` : "· meta de setup batida"}
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-imperium-raised">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: `rgb(${cor})` }} />
      </div>
      <p className="mt-2 text-xs text-stone-500">
        {time ? "Toda proposta do time deve levar o setup:" : "Toda proposta sua deve levar o setup:"} cada implantação vendida soma R$ 2.500 de recebido de uma vez, além da mensalidade.
        É aí que o recebido cresce mais rápido.
      </p>
    </section>
  );
}
