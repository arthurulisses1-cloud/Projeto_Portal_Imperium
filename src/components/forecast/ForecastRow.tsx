"use client";

import { useState, useTransition } from "react";
import { salvarStatusForecast, salvarComissaoParceiro } from "@/app/(app)/forecast/actions";
import { STATUS_SHEET_LABELS, STATUS_MANUAL_LABELS, type ForecastOp, type StatusManual } from "@/lib/forecast";
import { Tr, Td } from "@/components/ui/Table";
import { IconCheck } from "@/components/ui/icons";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function dbr(s: string) {
  return s.slice(8, 10) + "/" + s.slice(5, 7);
}

const PARCEIRO_STATUS_LABEL: Record<string, string> = {
  ok: "ok",
  pendente_aprovacao: "aguardando aprovação",
  aprovado: "aprovado",
};

function ComissaoParceiroCelula({ op, pctParceiroPadrao }: { op: ForecastOp; pctParceiroPadrao: number }) {
  const [nomeParceiro, setNomeParceiro] = useState(op.comissaoParceiro?.nomeParceiro ?? "");
  const [percentual, setPercentual] = useState(op.comissaoParceiro?.percentual ?? pctParceiroPadrao);
  const [chavePix, setChavePix] = useState(op.comissaoParceiro?.chavePix ?? "");
  const [isPending, startTransition] = useTransition();
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!op.podeEditar) {
    return op.comissaoParceiro ? (
      <span className="text-xs text-stone-500">
        {op.comissaoParceiro.nomeParceiro} · {op.comissaoParceiro.percentual}%{" "}
        <span className={op.comissaoParceiro.status === "pendente_aprovacao" ? "text-gold" : "text-stone-600"}>
          ({PARCEIRO_STATUS_LABEL[op.comissaoParceiro.status]})
        </span>
      </span>
    ) : (
      <span className="text-xs text-stone-600">—</span>
    );
  }

  function salvar() {
    setErro(null);
    const fd = new FormData();
    fd.set("operacao_id", op.id);
    fd.set("nome_parceiro", nomeParceiro);
    fd.set("percentual", String(percentual));
    fd.set("chave_pix", chavePix);
    startTransition(async () => {
      try {
        await salvarComissaoParceiro(fd);
        setSalvo(true);
        setTimeout(() => setSalvo(false), 2000);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao salvar.");
      }
    });
  }

  return (
    <details className="group/parceiro">
      <summary className="cursor-pointer list-none text-xs text-gold hover:underline [&::-webkit-details-marker]:hidden">
        {op.comissaoParceiro ? (
          <>
            {op.comissaoParceiro.nomeParceiro} · {op.comissaoParceiro.percentual}%{" "}
            <span className={op.comissaoParceiro.status === "pendente_aprovacao" ? "text-gold" : "text-stone-500"}>
              ({PARCEIRO_STATUS_LABEL[op.comissaoParceiro.status]})
            </span>
          </>
        ) : (
          "+ comissão de parceiro"
        )}
      </summary>
      <div className="mt-2 flex min-w-[220px] flex-col gap-1.5 rounded border border-imperium-line bg-imperium-bg/60 p-2">
        <input
          value={nomeParceiro}
          onChange={(e) => setNomeParceiro(e.target.value)}
          placeholder="Nome do parceiro"
          className="input-imp px-2 py-1 text-xs"
        />
        <div className="flex gap-1.5">
          <input
            type="number"
            step="0.1"
            value={percentual}
            onChange={(e) => setPercentual(Number(e.target.value))}
            className="input-imp w-16 px-2 py-1 text-xs"
          />
          <span className="self-center text-[10px] text-stone-500">% = {moeda((percentual / 100) * op.valor)}</span>
        </div>
        <input
          value={chavePix}
          onChange={(e) => setChavePix(e.target.value)}
          placeholder="Chave Pix"
          className="input-imp px-2 py-1 text-xs"
        />
        {percentual > pctParceiroPadrao && (
          <p className="text-[10px] text-gold">Acima do padrão ({pctParceiroPadrao}%) — precisa de aprovação do Diretor.</p>
        )}
        {erro && <p className="text-[10px] text-wine-bright">{erro}</p>}
        <button onClick={salvar} disabled={isPending} className="btn-outline px-2 py-1 text-[10px]">
          {isPending ? "..." : salvo ? <IconCheck className="mx-auto h-3 w-3" /> : "Salvar"}
        </button>
      </div>
    </details>
  );
}

export default function ForecastRow({ op, pctParceiroPadrao }: { op: ForecastOp; pctParceiroPadrao: number }) {
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
    <Tr>
      <Td className="pr-3 text-stone-300">{dbr(op.data)}</Td>
      <Td className="pr-3 text-stone-300">{op.cliente ?? "—"}</Td>
      <Td className="pr-3 text-stone-400">{op.sdrNome ?? "—"}</Td>
      <Td className="pr-3 text-stone-400">{op.closerNome ?? "—"}</Td>
      <Td align="right" className="pr-3 text-stone-100">{moeda(op.valor)}</Td>
      <Td className="pr-3 text-xs uppercase text-stone-400">{STATUS_SHEET_LABELS[op.status] ?? op.status}</Td>
      <Td className="pr-3">
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
      </Td>
      <Td>
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
              {isPending ? "..." : salvo ? <IconCheck className="mx-auto h-3 w-3" /> : "Salvar"}
            </button>
          </div>
        ) : (
          <span className="text-xs text-stone-500">{op.observacao ?? "—"}</span>
        )}
      </Td>
      <Td>
        <ComissaoParceiroCelula op={op} pctParceiroPadrao={pctParceiroPadrao} />
      </Td>
    </Tr>
  );
}
