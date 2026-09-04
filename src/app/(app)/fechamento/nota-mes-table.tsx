"use client";

import { useMemo, useState } from "react";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import type { LinhaNota } from "@/lib/dre";

const PRODUTO_LABEL: Record<string, string> = {
  credito: "Crédito",
  compra: "Compra",
  recredito: "Recrédito",
};

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

// Extraído de page.tsx pra poder filtrar (produto + busca por cliente) sem
// reload — pedido do Diretor, 2026-09-02: a Nota do mês cresceu demais pra
// achar a operação certa na mão quando só algumas precisam de % de receita
// diferente do padrão.
export default function NotaMesTable({
  nota,
  isDiretor,
  pctReceitaPadraoStr,
  atualizarPctReceitaOperacao,
}: {
  nota: LinhaNota[];
  isDiretor: boolean;
  pctReceitaPadraoStr: string;
  atualizarPctReceitaOperacao: (formData: FormData) => void;
}) {
  const [produtoFiltro, setProdutoFiltro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  const produtosPresentes = useMemo(() => {
    const set = new Set<string>();
    for (const l of nota) if (l.produto) set.add(l.produto);
    return Array.from(set).sort();
  }, [nota]);

  const notaFiltrada = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase();
    return nota.filter((l) => {
      if (produtoFiltro && l.produto !== produtoFiltro) return false;
      if (buscaLower && !(l.cliente ?? "").toLowerCase().includes(buscaLower)) return false;
      return true;
    });
  }, [nota, produtoFiltro, busca]);

  if (nota.length === 0) {
    return <p className="text-xs text-stone-600">Nenhuma operação paga esse mês ainda.</p>;
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setProdutoFiltro(null)}
          className={`rounded px-2.5 py-1 text-[11px] uppercase transition ${
            !produtoFiltro ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold"
          }`}
        >
          Todos
        </button>
        {produtosPresentes.map((p) => (
          <button
            key={p}
            onClick={() => setProdutoFiltro(produtoFiltro === p ? null : p)}
            className={`rounded px-2.5 py-1 text-[11px] uppercase transition ${
              produtoFiltro === p ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold"
            }`}
          >
            {PRODUTO_LABEL[p] ?? p}
          </button>
        ))}
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente..."
          className="input-imp ml-auto w-48 px-2 py-1 text-xs"
        />
      </div>

      {notaFiltrada.length > 0 ? (
        <>
          <Table minWidth="min-w-[900px]">
            <thead>
              <tr>
                <Th className="pr-2">Data</Th>
                <Th className="pr-2">Cliente</Th>
                <Th className="pr-2">ID cliente</Th>
                <Th className="pr-2">Produto</Th>
                <Th align="right" className="pr-2">Crédito</Th>
                <Th className="pr-2">Parceiro</Th>
                <Th align="right" className="pr-2">Extra %</Th>
                <Th align="right">% Receita</Th>
              </tr>
            </thead>
            <tbody>
              {notaFiltrada.map((l) => (
                <Tr key={l.weeklyOperacaoId}>
                  <Td className="pr-2 whitespace-nowrap text-stone-300">
                    {new Date(l.data + "T00:00:00").toLocaleDateString("pt-BR")}
                  </Td>
                  <Td className="pr-2 text-stone-300">{l.cliente ?? "—"}</Td>
                  <Td className="pr-2 text-stone-600">{l.clienteId ?? "—"}</Td>
                  <Td className="pr-2 whitespace-nowrap text-stone-400">
                    {l.produto ? PRODUTO_LABEL[l.produto] ?? l.produto : "—"}
                  </Td>
                  <Td align="right" className="pr-2 whitespace-nowrap text-stone-100">{moeda(l.valor)}</Td>
                  <Td className="pr-2 text-stone-400">{l.parceiro?.nomeParceiro ?? "—"}</Td>
                  <Td align="right" className="pr-2 whitespace-nowrap text-gold">
                    {l.parceiro ? moeda(l.parceiro.extra) : "—"}
                  </Td>
                  <Td align="right" className="whitespace-nowrap">
                    {isDiretor ? (
                      <form
                        action={atualizarPctReceitaOperacao}
                        className="flex items-center justify-end gap-1"
                        title="Deixe em branco pra usar o % padrão da DRE"
                      >
                        <input type="hidden" name="id" value={l.weeklyOperacaoId} />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          name="pct"
                          placeholder={pctReceitaPadraoStr}
                          defaultValue={l.pctReceitaOverride !== null ? l.pctReceitaOverride * 100 : undefined}
                          className="input-imp w-16 px-1.5 py-0.5 text-right text-[11px]"
                        />
                        <span className="text-[11px] text-stone-500">%</span>
                        <button type="submit" className="text-[10px] text-gold hover:underline">
                          Salvar
                        </button>
                      </form>
                    ) : (
                      <span className={l.pctReceitaOverride !== null ? "text-gold" : "text-stone-600"}>
                        {l.pctReceitaOverride !== null ? `${(l.pctReceitaOverride * 100).toLocaleString("pt-BR")}%` : `${pctReceitaPadraoStr}%`}
                      </span>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <p className="mt-2 text-[11px] text-stone-600">
            {notaFiltrada.length < nota.length && <>{notaFiltrada.length} de {nota.length} operações · </>}
            Total crédito: {moeda(notaFiltrada.reduce((s, l) => s + l.valor, 0))} · Total extra de parceiro:{" "}
            {moeda(notaFiltrada.reduce((s, l) => s + (l.parceiro?.extra ?? 0), 0))}
          </p>
        </>
      ) : (
        <p className="text-xs text-stone-600">Nenhuma operação bate com esse filtro.</p>
      )}
    </>
  );
}
