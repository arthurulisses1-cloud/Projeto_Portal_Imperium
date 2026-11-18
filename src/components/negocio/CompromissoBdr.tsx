// Compromisso do dia do BDR do Match Sales: reuniões agendadas é manual (meta e realizado que ele lança);
// reuniões realizadas é automático (realizadas hoje ÷ reuniões dele marcadas para hoje, pela agenda do Pipefácil).
import { salvarAgendadasBdr } from "@/app/(app)/compromisso/kpi-actions";
import type { PainelCloser } from "@/lib/closer-negocio";
import type { KpiLinha } from "@/lib/compromisso-kpis";
import { ReunioesDoDia } from "@/components/negocio/PainelCloser";

const campo = "w-full rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-stone-100 focus:border-gold focus:outline-none";

export default function CompromissoBdr({ painel, hoje, negocioId, agendadas }: { painel: PainelCloser; hoje: string; negocioId: string; agendadas: KpiLinha | null }) {
  const doDia = painel.reunioes?.doDia ?? [];
  const realizadas = painel.reunioes?.realizadasHoje ?? 0;
  const previstas = Math.max(doDia.length, realizadas);
  const cumprido = previstas > 0 && realizadas >= previstas;
  const pct = previstas > 0 ? Math.min(100, (realizadas / previstas) * 100) : 0;
  const agBatido = !!agendadas && agendadas.meta > 0 && agendadas.realizado >= agendadas.meta;
  const dia = hoje.slice(8) + "/" + hoje.slice(5, 7);
  return (
    <main className="mx-auto max-w-4xl space-y-5 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Compromisso do dia · {dia}</h1>
        <p className="mt-1 text-sm text-stone-400">Defina de manhã quantas reuniões vai agendar e atualize ao longo do dia. As realizadas o sistema calcula sozinho.</p>
      </div>

      {!painel.nomeCrm && (
        <p className="rounded-lg border border-amber-400/40 bg-imperium-surface p-3 text-sm text-amber-300">
          Não achamos o seu usuário no Pipefácil, então as reuniões realizadas não aparecem. Avise o Diretor para ligar o seu login ao CRM.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Reuniões agendadas · manual</p>
            {agendadas && agendadas.meta > 0 && (
              <span className={"rounded border px-2 py-0.5 text-xs " + (agBatido ? "border-success/50 text-success-bright" : "border-amber-400/50 text-amber-400")}>{agBatido ? "Cumprido" : "Em andamento"}</span>
            )}
          </div>
          <form action={salvarAgendadasBdr} className="mt-3 space-y-3">
            <input type="hidden" name="negocio_id" value={negocioId} />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="text-xs text-stone-400">
                Compromisso
                <input name="meta" type="number" min={0} step="any" defaultValue={agendadas?.meta ?? ""} className={campo} />
              </label>
              <label className="text-xs text-stone-400">
                Realizado
                <input name="realizado" type="number" min={0} step="any" defaultValue={agendadas?.realizado ?? ""} className={campo} />
              </label>
            </div>
            <button type="submit" className="rounded border border-gold/50 bg-gold/10 px-4 py-1.5 text-sm text-gold-bright hover:bg-gold/20">
              Salvar
            </button>
          </form>
        </section>

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
      </div>

      <ReunioesDoDia lista={doDia} rotulo="agendada por" />
    </main>
  );
}
