"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  criarResultadoCompliance,
  alternarResultadoComplianceAtivo,
  editarResultadoCompliance,
} from "@/app/(app)/leads/actions";
import Card from "@/components/ui/Card";

export type ResultadoComplianceLinha = { id: string; nome: string; comportamento: string; ativo: boolean };

// O "comportamento" é o que o sistema entende — define o que acontece com o
// lead quando esse resultado é lançado.
export const COMPORTAMENTOS = [
  { valor: "aguardando", label: "Aguardando análise", ajuda: "Subiu e ainda não voltou. Cobra atualização." },
  { valor: "aprovado", label: "Aprovado", ajuda: "Análise ok. Segue cobrando até assinar/fechar." },
  { valor: "pendencia", label: "Pendência a resolver", ajuda: "Prazo de 7 dias; vencido vira alerta vermelho." },
  { valor: "reanalise", label: "Vai pra Reanálise", ajuda: "Pede a data do Jurídico e move pro funil de Reanálise." },
  { valor: "queda", label: "Queda", ajuda: "Lead cai: vira Perdido e sai das cobranças." },
] as const;

export default function ComplianceResultadosForm({ resultados }: { resultados: ResultadoComplianceLinha[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [nome, setNome] = useState("");
  const [comportamento, setComportamento] = useState<string>("aguardando");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [compEdicao, setCompEdicao] = useState("aguardando");
  const [erro, setErro] = useState<string | null>(null);

  function rodar(acao: () => Promise<void>) {
    setErro(null);
    startTransition(async () => {
      try {
        await acao();
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao salvar.");
      }
    });
  }

  return (
    <Card title="Resultados do Compliance (Subidos)">
      <p className="mb-3 text-xs text-stone-500">
        Os possíveis rumos de uma análise. O comportamento define o que o sistema faz: cobrar atualização, abrir
        prazo de pendência, mandar pra Reanálise ou derrubar o lead.
      </p>

      <div className="space-y-1.5">
        {resultados.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 rounded border border-imperium-line px-3 py-2 text-sm">
            {editandoId === r.id ? (
              <>
                <input value={nomeEdicao} onChange={(e) => setNomeEdicao(e.target.value)} className="input-imp w-56 text-sm" />
                <select value={compEdicao} onChange={(e) => setCompEdicao(e.target.value)} className="input-imp text-sm">
                  {COMPORTAMENTOS.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={isPending}
                  className="btn-outline px-2 py-1 text-xs"
                  onClick={() =>
                    rodar(async () => {
                      const fd = new FormData();
                      fd.set("id", r.id);
                      fd.set("nome", nomeEdicao);
                      fd.set("comportamento", compEdicao);
                      await editarResultadoCompliance(fd);
                      setEditandoId(null);
                    })
                  }
                >
                  Salvar
                </button>
                <button type="button" onClick={() => setEditandoId(null)} className="text-xs text-stone-500 hover:text-stone-300">
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <span className={r.ativo ? "text-stone-100" : "text-stone-600 line-through"}>{r.nome}</span>
                <span className="rounded-full bg-imperium-bg/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-stone-400">
                  {COMPORTAMENTOS.find((c) => c.valor === r.comportamento)?.label ?? r.comportamento}
                </span>
                <span className="ml-auto flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    className="text-stone-500 hover:text-gold-bright"
                    onClick={() => {
                      setEditandoId(r.id);
                      setNomeEdicao(r.nome);
                      setCompEdicao(r.comportamento);
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    disabled={isPending}
                    className="text-stone-500 hover:text-stone-200"
                    onClick={() =>
                      rodar(async () => {
                        const fd = new FormData();
                        fd.set("id", r.id);
                        fd.set("ativo", String(r.ativo));
                        await alternarResultadoComplianceAtivo(fd);
                      })
                    }
                  >
                    {r.ativo ? "Desativar" : "Reativar"}
                  </button>
                </span>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-imperium-line pt-3">
        <div>
          <label className="mb-1 block text-[10px] uppercase text-stone-500">Novo resultado</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Aprovado com ressalva" className="input-imp w-64 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase text-stone-500">Comportamento</label>
          <select value={comportamento} onChange={(e) => setComportamento(e.target.value)} className="input-imp text-sm">
            {COMPORTAMENTOS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={isPending || !nome.trim()}
          className="btn-outline px-3 py-2 text-xs"
          onClick={() =>
            rodar(async () => {
              const fd = new FormData();
              fd.set("nome", nome);
              fd.set("comportamento", comportamento);
              await criarResultadoCompliance(fd);
              setNome("");
            })
          }
        >
          Adicionar
        </button>
      </div>
      <p className="mt-2 text-[11px] text-stone-600">{COMPORTAMENTOS.find((c) => c.valor === comportamento)?.ajuda}</p>
      {erro && <p className="mt-2 text-xs text-wine-bright">{erro}</p>}
    </Card>
  );
}
