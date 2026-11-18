import type { LeadValor } from "@/lib/integracoes/realizado";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const TEMPERATURAS = [
  { chave: "quente", rotulo: "Follow quente", cor: "#E24B4A" },
  { chave: "morno", rotulo: "Follow morno", cor: "#EF9F27" },
  { chave: "frio", rotulo: "Follow frio", cor: "#378ADD" },
] as const;
const normal = (t: string | null) => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Cards de valor embaixo do funil (como no sistema antigo): o vendido no mês e o follow de agora (leads
 * abertos no Funil de Vendas) por temperatura. Passando o mouse, os leads com o valor de cada um.
 */
export function CardsValor({ vendas, abertos, cor }: { vendas: LeadValor[]; abertos: LeadValor[]; cor: string }) {
  const temps = new Set<string>(TEMPERATURAS.map((t) => t.chave));
  const semTemp = abertos.filter((a) => !temps.has(normal(a.temperatura)));
  const soma = (xs: LeadValor[]) => xs.reduce((s, x) => s + x.valor, 0);
  return (
    <div className="mt-4 border-t border-imperium-line pt-3">
      <p className="mb-2 text-[10px] uppercase tracking-widest text-stone-500">Valores · vendido no mês e follow agora</p>
      <div className="grid grid-cols-2 gap-2">
        <Cartao rotulo="Vendido no mês" leads={vendas} cor={`rgb(${cor})`} vazio="nenhuma venda no mês" sub={(n) => `${n} ${n === 1 ? "venda" : "vendas"}`} />
        {TEMPERATURAS.map((t) => (
          <Cartao
            key={t.chave}
            rotulo={t.rotulo}
            leads={abertos.filter((a) => normal(a.temperatura) === t.chave)}
            cor={t.cor}
            vazio="nenhum lead"
            sub={(n) => `${n} ${n === 1 ? "lead" : "leads"}`}
          />
        ))}
      </div>
      {semTemp.length > 0 && (
        <p className="mt-1.5 text-[11px] text-stone-500" title={semTemp.map((a) => `${a.nome} · ${moeda(a.valor)}`).join("\n")}>
          + {semTemp.length} em follow sem temperatura · {moeda(soma(semTemp))}
        </p>
      )}
    </div>
  );
}

function Cartao({ rotulo, leads, cor, vazio, sub }: { rotulo: string; leads: LeadValor[]; cor: string; vazio: string; sub: (n: number) => string }) {
  const total = leads.reduce((s, x) => s + x.valor, 0);
  return (
    <div className="group relative rounded-r-md border-l-[3px] bg-imperium-raised px-2.5 py-2" style={{ borderLeftColor: cor }} tabIndex={leads.length ? 0 : undefined}>
      <p className="text-[11px] text-stone-400">{rotulo}</p>
      <p className={`text-base font-semibold text-stone-100 ${leads.length ? "cursor-help underline decoration-stone-500 decoration-dotted underline-offset-4" : ""}`}>{moeda(total)}</p>
      <p className="text-[11px] text-stone-500">{leads.length ? sub(leads.length) : vazio}</p>
      {leads.length > 0 && (
        <div className="pointer-events-none invisible absolute left-0 top-full z-30 mt-1 w-72 rounded-md border border-imperium-line bg-imperium-surface p-2 opacity-0 shadow-xl transition-opacity group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100">
          <p className="mb-1 text-[10px] uppercase tracking-widest text-stone-500">
            {leads.length} {leads.length === 1 ? "lead" : "leads"} · {moeda(total)}
          </p>
          <ul className="max-h-60 space-y-1 overflow-y-auto">
            {leads.map((l, i) => (
              <li key={i} className="flex justify-between gap-2 text-[11px]">
                <span className="truncate text-stone-200">
                  {l.data ? <span className="text-stone-500">{l.data.slice(8, 10)}/{l.data.slice(5, 7)} </span> : null}
                  {l.nome}
                </span>
                <span className="shrink-0 tabular-nums text-stone-100">{moeda(l.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
