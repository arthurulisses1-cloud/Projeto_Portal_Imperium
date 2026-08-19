"use client";

import { useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import ForecastRow from "./ForecastRow";
import { STATUS_SHEET_LABELS, STATUS_SHEET_COR, type ForecastOp } from "@/lib/forecast";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default function ForecastView({
  ops,
  escopoLabel,
  tribos,
}: {
  ops: ForecastOp[];
  escopoLabel: string;
  tribos: { chave: string; label: string }[];
}) {
  const [triboFiltro, setTriboFiltro] = useState<string | null>(null);

  const opsFiltradas = useMemo(() => {
    if (!triboFiltro) return ops;
    return ops.filter((o) => o.sdrTribo === triboFiltro || o.closerTribo === triboFiltro);
  }, [ops, triboFiltro]);

  const porStatus = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const o of opsFiltradas) mapa.set(o.status, (mapa.get(o.status) ?? 0) + o.valor);
    return mapa;
  }, [opsFiltradas]);

  const resumo = useMemo(() => {
    let pago = 0,
      aguardando = 0,
      pendencia = 0,
      naoClassificado = 0;
    for (const o of opsFiltradas) {
      if (o.status === "PAGO") pago += o.valor;
      else if (o.statusManual === "aguardando_pagamento") aguardando += o.valor;
      else if (o.statusManual === "resolvendo_pendencia") pendencia += o.valor;
      else if (o.status === "ASSINADO" || o.status === "REANÁLISE") naoClassificado += o.valor;
    }
    return { pago, aguardando, pendencia, naoClassificado };
  }, [opsFiltradas]);

  const statusOrdenados = ["PAGO", "ASSINADO", "REANÁLISE", "CAIU", "DESISTIU"].filter((s) => porStatus.has(s));
  const maxStatus = Math.max(...Array.from(porStatus.values()), 1);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Forecast</h1>
          <p className="kicker mt-1">{escopoLabel} · mês corrente</p>
        </div>
        {tribos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTriboFiltro(null)}
              className={`rounded px-3 py-1.5 text-xs uppercase transition ${
                !triboFiltro ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold"
              }`}
            >
              Todas
            </button>
            {tribos.map((t) => (
              <button
                key={t.chave}
                onClick={() => setTriboFiltro(t.chave)}
                className={`rounded px-3 py-1.5 text-xs uppercase transition ${
                  triboFiltro === t.chave ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <p className="kicker mb-2">Já pago</p>
          <p className="font-display text-xl text-emerald-400">{moeda(resumo.pago)}</p>
        </Card>
        <Card>
          <p className="kicker mb-2">Certo pra pagar</p>
          <p className="font-display text-xl text-gold-bright">{moeda(resumo.aguardando)}</p>
          <p className="mt-1 text-[10px] text-stone-500">marcados &ldquo;Aguardando Pagamento&rdquo;</p>
        </Card>
        <Card>
          <p className="kicker mb-2">Em resolução de pendência</p>
          <p className="font-display text-xl text-wine-bright">{moeda(resumo.pendencia)}</p>
        </Card>
        <Card>
          <p className="kicker mb-2">Ainda não classificado</p>
          <p className="font-display text-xl text-stone-300">{moeda(resumo.naoClassificado)}</p>
          <p className="mt-1 text-[10px] text-stone-500">assinado/reanálise sem status marcado</p>
        </Card>
      </div>

      <Card title="Assinado, pago, caiu e reanálise no mês">
        <div className="space-y-2.5">
          {statusOrdenados.length === 0 && <p className="text-sm text-stone-500">Sem operações neste recorte.</p>}
          {statusOrdenados.map((s) => {
            const v = porStatus.get(s) ?? 0;
            return (
              <div key={s} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-stone-400">{STATUS_SHEET_LABELS[s] ?? s}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-imperium-bg">
                  <div
                    className="h-full rounded"
                    style={{ width: `${(v / maxStatus) * 100}%`, background: STATUS_SHEET_COR[s] ?? "var(--c-gold)" }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-stone-100">{moeda(v)}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Assinaturas do mês">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500">
                <th className="pb-2 pr-3">Data</th>
                <th className="pb-2 pr-3">Cliente</th>
                <th className="pb-2 pr-3">SDR</th>
                <th className="pb-2 pr-3">Closer</th>
                <th className="pb-2 pr-3 text-right">Valor</th>
                <th className="pb-2 pr-3">Status planilha</th>
                <th className="pb-2 pr-3">Status manual</th>
                <th className="pb-2">Observação</th>
              </tr>
            </thead>
            <tbody>
              {opsFiltradas.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-4 text-center text-stone-600">
                    Nenhuma assinatura neste recorte.
                  </td>
                </tr>
              )}
              {opsFiltradas.map((op) => (
                <ForecastRow key={op.id} op={op} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
