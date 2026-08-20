"use client";

import { useState, useTransition } from "react";
import { salvarMotivoQueda } from "@/app/(app)/forecast/actions";
import { MOTIVO_QUEDA_LABELS, MOTIVO_QUEDA_PEDE_OBS, STATUS_SHEET_LABELS, type ForecastOp, type MotivoQueda } from "@/lib/forecast";
import { Tr, Td } from "@/components/ui/Table";
import { IconCheck } from "@/components/ui/icons";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function dbr(s: string) {
  return s.slice(8, 10) + "/" + s.slice(5, 7);
}

export default function ForecastRowQueda({ op }: { op: ForecastOp }) {
  const [motivo, setMotivo] = useState<MotivoQueda | "">(op.motivoQueda ?? "");
  const [obs, setObs] = useState(op.motivoQuedaObs ?? "");
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const precisaObs = motivo && MOTIVO_QUEDA_PEDE_OBS.has(motivo);

  function salvar() {
    setErro(null);
    const fd = new FormData();
    fd.set("operacao_id", op.id);
    fd.set("motivo_queda", motivo);
    fd.set("motivo_queda_obs", obs);
    startTransition(async () => {
      try {
        await salvarMotivoQueda(fd);
        setSalvo(true);
        setTimeout(() => setSalvo(false), 2000);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao salvar.");
      }
    });
  }

  return (
    <Tr>
      <Td className="pr-3 text-stone-300">{dbr(op.data)}</Td>
      <Td className="pr-3 text-stone-300">{op.cliente ?? "—"}</Td>
      <Td className="pr-3 text-stone-400">{op.sdrNome ?? "—"}</Td>
      <Td className="pr-3 text-stone-400">{op.closerNome ?? "—"}</Td>
      <Td align="right" className="pr-3 text-stone-100">{moeda(op.valor)}</Td>
      <Td className="pr-3 text-xs uppercase text-wine-bright">{STATUS_SHEET_LABELS[op.status] ?? op.status}</Td>
      {op.podeEditar ? (
        <>
          <Td className="pr-3">
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value as MotivoQueda | "")}
              className="input-imp px-2 py-1 text-xs"
            >
              <option value="">Selecione o motivo…</option>
              {(Object.entries(MOTIVO_QUEDA_LABELS) as [MotivoQueda, string][]).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Td>
          <Td>
            <div className="flex items-center gap-1.5">
              <input
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder={precisaObs ? "Obrigatório pra esse motivo..." : "Observação (opcional)"}
                className="input-imp min-w-[160px] px-2 py-1 text-xs"
              />
              <button
                onClick={salvar}
                disabled={isPending || !motivo}
                className="btn-outline shrink-0 px-2 py-1 text-[10px]"
              >
                {isPending ? "..." : salvo ? <IconCheck className="mx-auto h-3 w-3" /> : "Salvar"}
              </button>
            </div>
            {erro && <p className="mt-1 text-[10px] text-wine-bright">{erro}</p>}
          </Td>
        </>
      ) : (
        <Td className="text-xs text-stone-500" colSpan={2}>
          {op.motivoQueda ? (
            <>
              {MOTIVO_QUEDA_LABELS[op.motivoQueda]}
              {op.motivoQuedaObs && <span className="text-stone-600"> — {op.motivoQuedaObs}</span>}
            </>
          ) : (
            "—"
          )}
        </Td>
      )}
    </Tr>
  );
}
