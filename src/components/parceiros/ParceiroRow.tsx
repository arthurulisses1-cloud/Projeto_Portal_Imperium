"use client";

import { useState, useTransition } from "react";
import { salvarComissaoParceiro } from "@/app/(app)/parceiros/actions";
import { Tr, Td } from "@/components/ui/Table";
import { IconCheck } from "@/components/ui/icons";

export type ParceiroOp = {
  id: string;
  data: string;
  cliente: string | null;
  sdrNome: string | null;
  closerNome: string | null;
  valor: number;
  podeEditar: boolean;
  comissaoParceiro: {
    nomeParceiro: string;
    percentual: number;
    chavePix: string;
    status: "ok" | "pendente_aprovacao" | "aprovado";
  } | null;
};

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function dbr(s: string) {
  return s.slice(8, 10) + "/" + s.slice(5, 7);
}

const STATUS_LABEL: Record<string, string> = {
  ok: "ok",
  pendente_aprovacao: "aguardando aprovação",
  aprovado: "aprovado",
};

export default function ParceiroRow({ op, pctParceiroPadrao }: { op: ParceiroOp; pctParceiroPadrao: number }) {
  const [nomeParceiro, setNomeParceiro] = useState(op.comissaoParceiro?.nomeParceiro ?? "");
  const [percentual, setPercentual] = useState(op.comissaoParceiro?.percentual ?? pctParceiroPadrao);
  const [chavePix, setChavePix] = useState(op.comissaoParceiro?.chavePix ?? "");
  const [isPending, startTransition] = useTransition();
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

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
    <Tr className="align-top">
      <Td className="pr-3 whitespace-nowrap text-stone-300">{dbr(op.data)}</Td>
      <Td className="pr-3 text-stone-300">{op.cliente ?? "—"}</Td>
      <Td className="pr-3 text-stone-400">{op.sdrNome ?? "—"}</Td>
      <Td className="pr-3 text-stone-400">{op.closerNome ?? "—"}</Td>
      <Td align="right" className="pr-3 whitespace-nowrap text-stone-100">{moeda(op.valor)}</Td>
      <Td>
        {!op.podeEditar ? (
          op.comissaoParceiro ? (
            <span className="text-xs text-stone-500">
              {op.comissaoParceiro.nomeParceiro} · {op.comissaoParceiro.percentual}%{" "}
              <span className={op.comissaoParceiro.status === "pendente_aprovacao" ? "text-gold" : "text-stone-600"}>
                ({STATUS_LABEL[op.comissaoParceiro.status]})
              </span>
            </span>
          ) : (
            <span className="text-xs text-stone-600">—</span>
          )
        ) : (
          <details className="group/parceiro">
            <summary className="cursor-pointer list-none text-xs text-gold hover:underline [&::-webkit-details-marker]:hidden">
              {op.comissaoParceiro ? (
                <>
                  {op.comissaoParceiro.nomeParceiro} · {op.comissaoParceiro.percentual}%{" "}
                  <span className={op.comissaoParceiro.status === "pendente_aprovacao" ? "text-gold" : "text-stone-500"}>
                    ({STATUS_LABEL[op.comissaoParceiro.status]})
                  </span>
                </>
              ) : (
                "+ cadastrar parceiro"
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
        )}
      </Td>
    </Tr>
  );
}
