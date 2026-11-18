import type { LeadValor } from "@/lib/integracoes/realizado";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const TEMPERATURAS = [
  { chave: "quente", rotulo: "Follow quente", cor: "#E24B4A" },
  { chave: "morno", rotulo: "Follow morno", cor: "#EF9F27" },
  { chave: "frio", rotulo: "Follow frio", cor: "#378ADD" },
] as const;
const normal = (t: string | null) => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Valores embaixo do funil (como no sistema antigo), numa lista compacta: o vendido no mês e o follow de
 * agora (leads abertos no Funil de Vendas) por temperatura. Passando o mouse, os leads com o valor de cada um.
 */
export function CardsValor({ vendas, abertos, cor }: { vendas: LeadValor[]; abertos: LeadValor[]; cor: string }) {
  const temps = new Set<string>(TEMPERATURAS.map((t) => t.chave));
  const semTemp = abertos.filter((a) => !temps.has(normal(a.temperatura)));
  const linhas = [
    { rotulo: "Vendido no mês", cor: `rgb(${cor})`, leads: vendas, unidade: ["venda", "vendas"] as const },
    ...TEMPERATURAS.map((t) => ({ rotulo: t.rotulo, cor: t.cor, leads: abertos.filter((a) => normal(a.temperatura) === t.chave), unidade: ["lead", "leads"] as const })),
  ];
  return (
    <div className="mt-4 border-t border-imperium-line pt-2 text-xs tabular-nums">
      <p className="mb-1 text-[10px] uppercase tracking-widest text-stone-500">Valores · vendido no mês e follow agora</p>
      {linhas.map((l) => (
        <Linha key={l.rotulo} {...l} />
      ))}
      {semTemp.length > 0 && (
        <p className="mt-1 text-[10px] text-stone-500" title={semTemp.map((a) => `${a.nome} · ${moeda(a.valor)}`).join("\n")}>
          + {semTemp.length} em follow sem temperatura · {moeda(semTemp.reduce((s, x) => s + x.valor, 0))}
        </p>
      )}
    </div>
  );
}

function Linha({ rotulo, cor, leads, unidade }: { rotulo: string; cor: string; leads: LeadValor[]; unidade: readonly [string, string] }) {
  const total = leads.reduce((s, x) => s + x.valor, 0);
  return (
    <div className="group relative grid grid-cols-[minmax(0,1fr)_4.5rem_5.5rem] items-center gap-x-2 py-0.5" tabIndex={leads.length ? 0 : undefined}>
      <span className="flex min-w-0 items-center gap-1.5 text-stone-300">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: cor }} />
        <span className="truncate">{rotulo}</span>
      </span>
      <span className="text-right text-stone-500">
        {leads.length} {leads.length === 1 ? unidade[0] : unidade[1]}
      </span>
      <span className={`text-right text-stone-100 ${leads.length ? "cursor-help underline decoration-stone-500 decoration-dotted underline-offset-4" : ""}`}>{moeda(total)}</span>
      {leads.length > 0 && (
        <div className="pointer-events-none invisible absolute right-0 top-full z-30 mt-1 w-72 rounded-md border border-imperium-line bg-imperium-surface p-2 opacity-0 shadow-xl transition-opacity group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100">
          <p className="mb-1 text-[10px] uppercase tracking-widest text-stone-500">
            {rotulo} · {moeda(total)}
          </p>
          <ul className="max-h-60 space-y-1 overflow-y-auto">
            {leads.map((x, i) => (
              <li key={i} className="flex justify-between gap-2 text-[11px]">
                <span className="truncate text-stone-200">
                  {x.data ? <span className="text-stone-500">{x.data.slice(8, 10)}/{x.data.slice(5, 7)} </span> : null}
                  {x.nome}
                </span>
                <span className="shrink-0 text-stone-100">{moeda(x.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
