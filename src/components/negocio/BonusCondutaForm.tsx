"use client";

import { useState } from "react";
import { salvarBonusConduta } from "@/app/(app)/bonus-conduta/actions";
import FormSalvar from "@/components/ui/FormSalvar";

export type LinhaBonus = {
  chave: string; // profileId:negocioId
  nome: string;
  cargo: string;
  negocio: string;
  cor: string;
  fixo: number;
  bonus: number;
  /** Situação gravada: aplicado, nao ou pendente (ainda não decidido). */
  estado: "aplicado" | "nao" | "pendente";
};

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Fechamento do Auxílio Transporte do mês: marque quem recebe os R$ 200 e salve. Quem ainda não foi decidido vem marcado. */
export default function BonusCondutaForm({ ano, mes, linhas }: { ano: number; mes: number; linhas: LinhaBonus[] }) {
  const [marcados, setMarcados] = useState<Record<string, boolean>>(Object.fromEntries(linhas.map((l) => [l.chave, l.estado !== "nao"])));
  const total = linhas.filter((l) => marcados[l.chave]).reduce((s, l) => s + l.bonus, 0);
  const qtd = linhas.filter((l) => marcados[l.chave]).length;
  const todos = (v: boolean) => setMarcados(Object.fromEntries(linhas.map((l) => [l.chave, v])));
  const negocios = Array.from(new Set(linhas.map((l) => l.negocio)));

  return (
    <FormSalvar action={salvarBonusConduta} className="space-y-4">
      <input type="hidden" name="ano" value={ano} />
      <input type="hidden" name="mes" value={mes} />
      {linhas.map((l) => (
        <input key={l.chave} type="hidden" name="linhas" value={l.chave} />
      ))}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" onClick={() => todos(true)} className="rounded border border-imperium-line px-3 py-1 text-xs text-stone-300 hover:text-stone-100">
          Aplicar em todos
        </button>
        <button type="button" onClick={() => todos(false)} className="rounded border border-imperium-line px-3 py-1 text-xs text-stone-300 hover:text-stone-100">
          Não aplicar em ninguém
        </button>
        <span className="text-stone-400">
          {qtd} de {linhas.length} · <span className="font-semibold text-gold-bright">{moeda(total)}</span> de Auxílio Transporte a pagar
        </span>
      </div>

      {negocios.map((n) => (
        <section key={n} className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="text-sm font-semibold" style={{ color: `rgb(${linhas.find((l) => l.negocio === n)?.cor ?? "201 162 74"})` }}>
            {n}
          </p>
          <ul className="mt-2 divide-y divide-imperium-line">
            {linhas
              .filter((l) => l.negocio === n)
              .map((l) => (
                <li key={l.chave} className="flex items-center gap-3 py-2 text-sm">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input type="checkbox" name={"aplicar_" + l.chave} checked={!!marcados[l.chave]} onChange={(e) => setMarcados((m) => ({ ...m, [l.chave]: e.target.checked }))} className="h-4 w-4" />
                    <span className="min-w-0 flex-1 truncate text-stone-100">{l.nome}</span>
                  </label>
                  <span className="hidden text-xs text-stone-500 sm:inline">{l.cargo}</span>
                  <span className="w-24 text-right text-xs text-stone-400">base {moeda(l.fixo)}</span>
                  <span className={"w-20 text-right font-semibold " + (marcados[l.chave] ? "text-success-bright" : "text-stone-600 line-through")}>+ {moeda(l.bonus)}</span>
                  <span className={"w-20 text-right text-[10px] uppercase " + (l.estado === "pendente" ? "text-amber-400" : "text-stone-500")}>{l.estado === "pendente" ? "a decidir" : "decidido"}</span>
                </li>
              ))}
          </ul>
        </section>
      ))}

      <button type="submit" className="rounded border border-gold/50 bg-gold/10 px-4 py-2 text-sm text-gold-bright hover:bg-gold/20">
        Fechar Auxílio Transporte do mês
      </button>
    </FormSalvar>
  );
}
