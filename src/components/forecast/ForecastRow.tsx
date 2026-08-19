"use client";

import { useState, useTransition } from "react";
import { salvarStatusForecast } from "@/app/(app)/forecast/actions";
import { STATUS_SHEET_LABELS, STATUS_MANUAL_LABELS, type ForecastOp, type StatusManual } from "@/lib/forecast";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function dbr(s: string) {
  return s.slice(8, 10) + "/" + s.slice(5, 7);
}

export default function ForecastRow({ op }: { op: ForecastOp }) {
  const [statusManual, setStatusManual] = useState<StatusManual | "">(op.statusManual ?? "");
  const [observacao, setObservacao] = useState(op.observacao ?? "");
  const [isPending, startTransition] = useTransition();
  const [salvo, setSalvo] = useState(false);

  function salvar() {
    const fd = new FormData();
    fd.set("operacao_id", op.id);
    fd.set("status_manual", statusManual);
    fd.set("observacao", observacao);
    startTransition(async () => {
      await salvarStatusForecast(fd);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2000);
    });
  }

  const statusTerminal = op.status === "PAGO" || op.status === "CAIU" || op.status === "DESISTIU";

  return (
    <tr className="border-t border-imperium-line">
      <td className="py-2 pr-3 text-stone-300">{dbr(op.data)}</td>
      <td className="py-2 pr-3 text-stone-300">{op.cliente ?? "—"}</td>
      <td className="py-2 pr-3 text-stone-400">{op.sdrNome ?? "—"}</td>
      <td className="py-2 pr-3 text-stone-400">{op.closerNome ?? "—"}</td>
      <td className="py-2 pr-3 text-right text-stone-100">{moeda(op.valor)}</td>
      <td className="py-2 pr-3 text-xs uppercase text-stone-400">{STATUS_SHEET_LABELS[op.status] ?? op.status}</td>
      <td className="py-2 pr-3">
        {op.podeEditar ? (
          <select
            value={statusManual}
            onChange={(e) => setStatusManual(e.target.value as StatusManual | "")}
            disabled={statusTerminal}
            className="input-imp px-2 py-1 text-xs"
          >
            <option value="">—</option>
            <option value="aguardando_pagamento">{STATUS_MANUAL_LABELS.aguardando_pagamento}</option>
            <option value="resolvendo_pendencia">{STATUS_MANUAL_LABELS.resolvendo_pendencia}</option>
            <option value="analise_juridico">{STATUS_MANUAL_LABELS.analise_juridico}</option>
            <option value="esfriou">{STATUS_MANUAL_LABELS.esfriou}</option>
          </select>
        ) : (
          <span className="text-xs text-stone-500">
            {op.statusManual ? STATUS_MANUAL_LABELS[op.statusManual] : "—"}
          </span>
        )}
      </td>
      <td className="py-2">
        {op.podeEditar ? (
          <div className="flex items-center gap-1.5">
            <input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              disabled={statusTerminal}
              placeholder="Obs. sobre o lead..."
              className="input-imp min-w-[160px] px-2 py-1 text-xs"
            />
            <button
              onClick={salvar}
              disabled={isPending || statusTerminal}
              className="btn-outline shrink-0 px-2 py-1 text-[10px]"
            >
              {isPending ? "..." : salvo ? "✓" : "Salvar"}
            </button>
          </div>
        ) : (
          <span className="text-xs text-stone-500">{op.observacao ?? "—"}</span>
        )}
      </td>
    </tr>
  );
}
