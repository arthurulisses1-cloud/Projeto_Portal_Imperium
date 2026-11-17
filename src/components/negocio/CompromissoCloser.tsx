// Compromisso do dia do Closer da Acrópole (Vorp): dois indicadores calculados sozinhos.
// Reuniões realizadas = realizadas hoje ÷ previstas para hoje (agenda do Pipefácil); Vendas = número, recebido e MRR de hoje.
import type { PainelCloser } from "@/lib/closer-negocio";
import { ReunioesDoDia } from "@/components/negocio/PainelCloser";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function CompromissoCloser({ painel, hoje }: { painel: PainelCloser; hoje: string }) {
  const doDia = painel.reunioes?.doDia ?? [];
  const realizadas = painel.reunioes?.realizadasHoje ?? 0;
  // A meta do dia é o que estava previsto para hoje; reunião realizada hoje que não estava na agenda também conta.
  const previstas = Math.max(doDia.length, realizadas);
  const cumprido = previstas > 0 && realizadas >= previstas;
  const pct = previstas > 0 ? Math.min(100, (realizadas / previstas) * 100) : 0;
  const dia = `${hoje.slice(8)}/${hoje.slice(5, 7)}`;
  return (
    <main className="mx-auto max-w-4xl space-y-5 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Compromisso do dia · {dia}</h1>
        <p className="mt-1 text-sm text-stone-400">Calculado automaticamente a partir da sua agenda no Pipefácil e das vendas lançadas.</p>
      </div>

      {!painel.nomeCrm && (
        <p className="rounded-lg border border-amber-400/40 bg-imperium-surface p-3 text-sm text-amber-300">
          Não achamos o seu usuário no Pipefácil, então as reuniões não aparecem. Avise o Diretor para ligar o seu login ao CRM.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Reuniões realizadas</p>
            {previstas > 0 && (
              <span className={`rounded border px-2 py-0.5 text-xs ${cumprido ? "border-success/50 text-success-bright" : "border-amber-400/50 text-amber-400"}`}>
                {cumprido ? "Cumprido" : "Em andamento"}
              </span>
            )}
          </div>
          <p className="mt-1 text-3xl font-semibold text-stone-100">
            {realizadas}
            <span className="text-lg font-normal text-stone-500"> / {previstas}</span>
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-imperium-raised">
            <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-stone-500">{previstas === 0 ? "nenhuma reunião prevista para hoje" : "realizadas hoje ÷ previstas para hoje"}</p>
        </section>

        <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Vendas</p>
          <p className="mt-1 text-3xl font-semibold text-stone-100">{painel.hoje.vendas}</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Recebido</p>
              <p className="text-lg font-semibold text-gold-bright">{moeda(painel.hoje.recebido)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-stone-500">MRR</p>
              <p className="text-lg font-semibold text-gold-bright">{moeda(painel.hoje.mrr)}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-stone-500">{painel.hoje.vendas === 1 ? "venda lançada hoje" : "vendas lançadas hoje"}</p>
        </section>
      </div>

      <ReunioesDoDia lista={doDia} />
    </main>
  );
}
