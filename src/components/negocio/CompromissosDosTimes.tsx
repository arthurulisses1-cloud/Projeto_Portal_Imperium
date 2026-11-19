// Mural do Diretor: 4 quadros, um por time, com o compromisso do dia consolidado (o que cada um prometeu,
// quanto já fez e o geral do time).
import type { KpiPessoa, TimeCompromisso } from "@/lib/compromisso-time";
import { NEGOCIO_COR } from "@/lib/negocios";

const MOEDA = ["recebido", "mrr"];
const fmt = (chave: string, v: number) => (MOEDA.includes(chave) ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const pct = (v: number | null) => (v === null ? "—" : Math.round(v * 100) + "%");
const corPct = (v: number | null) => (v === null ? "text-stone-500" : v >= 1 ? "text-success-bright" : v >= 0.6 ? "text-amber-400" : "text-wine-bright");

function Barra({ valor, cor }: { valor: number | null; cor: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-imperium-raised">
      <div className="h-full rounded-full" style={{ width: Math.min(100, (valor ?? 0) * 100) + "%", backgroundColor: `rgb(${cor})` }} />
    </div>
  );
}

function Pessoa({ p, cor }: { p: TimeCompromisso["pessoas"][number]; cor: string }) {
  if (!p.lancou) {
    return (
      <li className="flex items-baseline justify-between gap-2 py-1 text-xs">
        <span className="truncate text-stone-400">{p.nome}</span>
        <span className={p.faltou ? "text-stone-500" : "text-amber-400"}>{p.faltou ? "faltou" : "não lançou"}</span>
      </li>
    );
  }
  return (
    <li className="py-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate text-stone-200">{p.nome}</span>
        <span className={`tabular-nums font-semibold ${corPct(p.atingimento)}`}>{pct(p.atingimento)}</span>
      </div>
      <Barra valor={p.atingimento} cor={cor} />
      <p className="mt-0.5 text-[11px] leading-snug text-stone-500">
        {p.kpis
          .filter((k: KpiPessoa) => k.meta > 0)
          .map((k) => `${k.label} ${fmt(k.chave, k.realizado)}/${fmt(k.chave, k.meta)}`)
          .join(" · ")}
      </p>
    </li>
  );
}

function Quadro({ t }: { t: TimeCompromisso }) {
  const cor = NEGOCIO_COR[t.slug] ?? "201 162 74";
  return (
    <section className="rounded-lg border bg-imperium-surface p-4" style={{ borderColor: `rgb(${cor} / 0.55)` }}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold" style={{ color: `rgb(${cor})` }}>
          {t.nome}
        </p>
        <p className={`text-2xl font-semibold tabular-nums ${corPct(t.atingimento)}`}>{pct(t.atingimento)}</p>
      </div>
      <p className="text-[11px] text-stone-500">
        {t.lancaram} de {t.esperados} {t.esperados === 1 ? "lançou" : "lançaram"} o compromisso · atingimento médio de quem lançou
      </p>

      {t.kpis.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">Ninguém lançou o compromisso de hoje ainda.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {t.kpis.map((k) => (
            <li key={k.chave}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-stone-300">{k.label}</span>
                <span className="tabular-nums text-stone-400">
                  <span className="text-stone-100">{fmt(k.chave, k.realizado)}</span> / {fmt(k.chave, k.meta)} <span className={corPct(k.pct)}>{pct(k.pct)}</span>
                </span>
              </div>
              <Barra valor={k.pct} cor={cor} />
            </li>
          ))}
        </ul>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer select-none text-[10px] uppercase tracking-widest text-stone-500 hover:text-stone-300">O que cada um prometeu</summary>
        <ul className="mt-2 divide-y divide-imperium-line/60">
          {t.pessoas.length === 0 ? <li className="py-1 text-xs text-stone-500">Sem pessoas nesse time.</li> : t.pessoas.map((p) => <Pessoa key={p.id} p={p} cor={cor} />)}
        </ul>
      </details>
    </section>
  );
}

export default function CompromissosDosTimes({ times, dia }: { times: TimeCompromisso[]; dia: string }) {
  if (times.length === 0) return null;
  return (
    <div className="space-y-3">
      <p className="text-[10px] uppercase tracking-widest text-stone-500">
        Compromisso do dia · {dia.slice(8)}/{dia.slice(5, 7)} · cada time
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {times.map((t) => (
          <Quadro key={t.slug} t={t} />
        ))}
      </div>
    </div>
  );
}
