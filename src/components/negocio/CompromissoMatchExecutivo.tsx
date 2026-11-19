// Compromisso do dia do executivo do Match Sales: ele digita o compromisso de reuniões agendadas (e o realizado delas),
// de recebido e de MRR; o realizado de recebido e de MRR vem das vendas de hoje e as reuniões realizadas são automáticas
// (realizadas hoje ÷ reuniões dele marcadas para hoje, pela agenda do Pipefácil).
import { salvarCompromissoMatchExecutivo } from "@/app/(app)/compromisso/kpi-actions";
import type { PainelCloser } from "@/lib/closer-negocio";
import type { KpiLinha } from "@/lib/compromisso-kpis";
import { ReunioesDoDia } from "@/components/negocio/PainelCloser";
import FormSalvar from "@/components/ui/FormSalvar";

const campo = "w-full rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-stone-100 focus:border-gold focus:outline-none";
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function Selo({ meta, realizado }: { meta: number; realizado: number }) {
  if (!(meta > 0)) return null;
  const batido = realizado >= meta;
  return <span className={"rounded border px-2 py-0.5 text-xs " + (batido ? "border-success/50 text-success-bright" : "border-amber-400/50 text-amber-400")}>{batido ? "Cumprido" : "Em andamento"}</span>;
}

export default function CompromissoMatchExecutivo({ painel, hoje, negocioId, linhas }: { painel: PainelCloser; hoje: string; negocioId: string; linhas: KpiLinha[] }) {
  const doDia = painel.reunioes?.doDia ?? [];
  const realizadas = painel.reunioes?.realizadasHoje ?? 0;
  const previstas = Math.max(doDia.length, realizadas);
  const cumprido = previstas > 0 && realizadas >= previstas;
  const pct = previstas > 0 ? Math.min(100, (realizadas / previstas) * 100) : 0;
  const linhaDe = (chave: string) => linhas.find((l) => l.chave === chave && l.data === hoje) ?? null;
  const ag = linhaDe("reunioes_agendadas");
  const rec = linhaDe("recebido");
  const mrr = linhaDe("mrr");
  const dia = hoje.slice(8) + "/" + hoje.slice(5, 7);
  return (
    <main className="mx-auto max-w-4xl space-y-5 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Compromisso do dia · {dia}</h1>
        <p className="mt-1 text-sm text-stone-400">
          Defina de manhã quantas reuniões vai agendar e quanto pretende receber e vender em MRR hoje. O recebido, o MRR e as reuniões realizadas o sistema calcula sozinho.
        </p>
      </div>

      {!painel.nomeCrm && (
        <p className="rounded-lg border border-amber-400/40 bg-imperium-surface p-3 text-sm text-amber-300">
          Não achamos o seu usuário no Pipefácil, então as reuniões realizadas não aparecem. Avise o Diretor para ligar o seu login ao CRM.
        </p>
      )}

      <FormSalvar action={salvarCompromissoMatchExecutivo} className="space-y-4">
        <input type="hidden" name="negocio_id" value={negocioId} />
        <div className="grid gap-4 md:grid-cols-3">
          <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Reuniões agendadas · manual</p>
              <Selo meta={ag?.meta ?? 0} realizado={ag?.realizado ?? 0} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <label className="text-xs text-stone-400">
                Compromisso
                <input name="meta_agendadas" type="number" min={0} step="any" defaultValue={ag?.meta ?? ""} className={campo} />
              </label>
              <label className="text-xs text-stone-400">
                Realizado (automático)
                <input name="realizado_agendadas" type="number" readOnly value={painel.reunioes?.agendadasHoje ?? ag?.realizado ?? 0} className={campo + " cursor-not-allowed opacity-70"} />
              </label>
            </div>
            <p className="mt-2 text-[11px] text-stone-500">
              {painel.reunioes ? "O CRM mostra " + painel.reunioes.agendadasHoje + (painel.reunioes.agendadasHoje === 1 ? " reunião agendada por você hoje." : " reuniões agendadas por você hoje.") : "Sem leitura do CRM para você."} &quot;Cumprido&quot; aparece quando o realizado chega ao compromisso.
            </p>
          </section>

          <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Recebido · automático</p>
              <Selo meta={rec?.meta ?? 0} realizado={painel.hoje.recebido} />
            </div>
            <p className="mt-1 text-2xl font-semibold text-gold-bright">{moeda(painel.hoje.recebido)}</p>
            <label className="mt-2 block text-xs text-stone-400">
              Compromisso (R$)
              <input name="meta_recebido" type="number" min={0} step="any" defaultValue={rec?.meta ?? ""} className={campo} />
            </label>
            <p className="mt-1 text-[11px] text-stone-500">{painel.hoje.vendas === 1 ? "1 venda lançada hoje" : painel.hoje.vendas + " vendas lançadas hoje"}</p>
          </section>

          <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[10px] uppercase tracking-widest text-stone-500">MRR · automático</p>
              <Selo meta={mrr?.meta ?? 0} realizado={painel.hoje.mrr} />
            </div>
            <p className="mt-1 text-2xl font-semibold text-gold-bright">{moeda(painel.hoje.mrr)}</p>
            <label className="mt-2 block text-xs text-stone-400">
              Compromisso (R$)
              <input name="meta_mrr" type="number" min={0} step="any" defaultValue={mrr?.meta ?? ""} className={campo} />
            </label>
            <p className="mt-1 text-[11px] text-stone-500">MRR das vendas de hoje</p>
          </section>
        </div>
        <button type="submit" className="rounded border border-gold/50 bg-gold/10 px-4 py-1.5 text-sm text-gold-bright hover:bg-gold/20">
          Salvar compromisso
        </button>
      </FormSalvar>

      <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Reuniões realizadas · automático</p>
          {previstas > 0 && (
            <span className={"rounded border px-2 py-0.5 text-xs " + (cumprido ? "border-success/50 text-success-bright" : "border-amber-400/50 text-amber-400")}>{cumprido ? "Cumprido" : "Em andamento"}</span>
          )}
        </div>
        <p className="mt-1 text-3xl font-semibold text-stone-100">
          {realizadas}
          <span className="text-lg font-normal text-stone-500"> / {previstas}</span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-imperium-raised">
          <div className="h-full rounded-full bg-gold" style={{ width: pct + "%" }} />
        </div>
        <p className="mt-2 text-xs text-stone-500">{previstas === 0 ? "nenhuma reunião sua marcada para hoje" : "realizadas hoje ÷ reuniões suas marcadas para hoje"}</p>
      </section>

      <ReunioesDoDia lista={doDia} rotulo="agendada por" />
    </main>
  );
}
