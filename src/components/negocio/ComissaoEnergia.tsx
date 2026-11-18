// Comissão do mês no Maximus Energy: primeira fatura de cada conta ganha. Executivo vê só as dele (e só o % dele);
// o Head e o Diretor veem o time. A recorrência (a partir do 3º mês) ainda não é calculada.
import type { ComissaoEnergia, ComissaoPessoaEnergia } from "@/lib/energy-time";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const dataCurta = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

export function ExplicacaoComissaoEnergia({ pct }: { pct: number }) {
  return (
    <details className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <summary className="cursor-pointer text-sm font-semibold text-gold-bright">Como sua comissão é calculada · Maximus Energy</summary>
      <div className="mt-3 space-y-4 text-sm text-stone-300">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">1 · Primeira fatura</p>
          <p className="mt-1">
            Em cada conta que você sobe e que é <strong>ganha</strong>, a Vorp recebe <strong>80% da primeira fatura</strong> do cliente (kWh compensáveis × valor do kWh). Se o time passar de 80 mil kWh
            no mês, a Vorp passa a receber 100%. Você recebe <strong>{pct}%</strong> do que a Vorp recebe.
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">2 · Recorrência</p>
          <p className="mt-1">A partir do 3º mês, a comissão segue a cada recebimento do cliente. Esse valor entra assim que a Sunne informar o recebimento; por enquanto não aparece aqui.</p>
        </div>
        <p className="text-xs text-stone-500">Valores calculados a partir das contas ganhas na Sunne. O pagamento sai no dia 15 do mês seguinte.</p>
      </div>
    </details>
  );
}

function Tabela({ pessoa }: { pessoa: ComissaoPessoaEnergia }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm [&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0 [&_td.num]:whitespace-nowrap [&_th]:whitespace-nowrap">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-stone-500">
            <th className="py-1 text-left font-normal">Fechada em</th>
            <th className="py-1 text-right font-normal">kWh</th>
            <th className="py-1 text-right font-normal">Primeira fatura</th>
            <th className="py-1 text-right font-normal">Vorp recebe</th>
            <th className="py-1 text-right font-normal">Comissão</th>
          </tr>
        </thead>
        <tbody>
          {pessoa.linhas.map((l) => (
            <tr key={l.id} className="border-t border-imperium-line/60">
              <td className="py-1.5 text-stone-400">{dataCurta(l.data)}</td>
              <td className="num py-1.5 text-right tabular-nums text-stone-300">{l.kwh.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</td>
              <td className="num py-1.5 text-right tabular-nums text-stone-300">{moeda(l.primeiraFatura)}</td>
              <td className="num py-1.5 text-right tabular-nums text-stone-300">{moeda(l.recebido)}</td>
              <td className="num py-1.5 text-right tabular-nums text-stone-100">{moeda(l.comissao)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Comissão do executivo: só as contas dele. */
export function ComissaoEnergiaExecutivo({ pessoa, pct }: { pessoa: ComissaoPessoaEnergia | null; pct: number }) {
  const n = pessoa?.linhas.length ?? 0;
  return (
    <div className="space-y-4">
      <ExplicacaoComissaoEnergia pct={pct} />
      <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Maximus Energy · contas ganhas no mês</p>
          <p className="text-sm text-stone-400">
            {n} {n === 1 ? "conta" : "contas"} · comissão <span className="font-semibold text-gold-bright">{moeda(pessoa?.total ?? 0)}</span>
          </p>
        </div>
        {!pessoa || n === 0 ? (
          <p className="mt-3 text-sm text-stone-500">Nenhuma conta sua foi ganha neste mês ainda.</p>
        ) : (
          <div className="mt-2">
            <Tabela pessoa={pessoa} />
          </div>
        )}
      </section>
    </div>
  );
}

/** Comissão do time (Head e Diretor): cada vendedor, mais o que a gestão leva. */
export function ComissaoEnergiaTime({ dados, verGestao }: { dados: ComissaoEnergia; verGestao: boolean }) {
  const totalTime = dados.pessoas.reduce((s, p) => s + p.total, 0);
  return (
    <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">Maximus Energy · comissão da primeira fatura</p>
        <p className="text-sm text-stone-400">
          Vorp recebeu {moeda(dados.recebidoTotal)} · executivos <span className="text-gold-bright">{moeda(totalTime)}</span>
          {verGestao ? " · Head " + moeda(dados.headTotal) + " · Diretor " + moeda(dados.diretorTotal) : ""}
        </p>
      </div>
      <ul className="mt-3 divide-y divide-imperium-line">
        {dados.pessoas.map((p) => (
          <li key={p.id} className="py-2">
            <details>
              <summary className="flex cursor-pointer select-none items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-stone-100">{p.nome}</span>
                <span className="hidden text-xs text-stone-500 sm:inline">
                  {p.linhas.length} {p.linhas.length === 1 ? "conta" : "contas"}
                </span>
                <span className="shrink-0 font-semibold text-gold-bright">{moeda(p.total)}</span>
              </summary>
              {p.linhas.length > 0 && (
                <div className="mt-2">
                  <Tabela pessoa={p} />
                </div>
              )}
            </details>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-stone-500">Recorrência (a partir do 3º mês) ainda não entra neste cálculo.</p>
    </section>
  );
}
