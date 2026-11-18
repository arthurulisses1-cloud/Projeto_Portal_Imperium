// Compromisso do dia do executivo do Maximus Energy: contas subidas, assinaturas e kWh gerado, com o realizado automático
// (Sunne) e o compromisso digitado por ele de manhã. Indicações recebidas entra depois, quando o processo estiver definido.
import { salvarCompromissoEnergia } from "@/app/(app)/compromisso/kpi-actions";
import { KPIS_ENERGIA, type CompromissoEnergiaDia } from "@/lib/energy-time";
import type { KpiLinha } from "@/lib/compromisso-kpis";
import { agruparPorDia, diaCumprido, streakKpis } from "@/lib/compromisso-kpis";

const campo = "w-full rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-stone-100 focus:border-gold focus:outline-none";
const dataCurta = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const fmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export default function CompromissoEnergia({ hoje, real, linhas }: { hoje: string; real: CompromissoEnergiaDia; linhas: KpiLinha[] }) {
  const porDia = agruparPorDia(linhas);
  const hojeLinhas = new Map((porDia.get(hoje) ?? []).map((l) => [l.chave, l]));
  const valores: Record<string, number | null> = { contas_subidas: real.contasSubidas, assinaturas: real.assinaturas, kwh_gerado: real.kwh };
  const historico = Array.from(porDia.entries()).filter(([d]) => d !== hoje).slice(0, 10);
  const cumpridoHoje = diaCumprido((porDia.get(hoje) ?? []).map((l) => ({ ...l, realizado: valores[l.chave] ?? l.realizado })));
  return (
    <main className="mx-auto max-w-4xl space-y-5 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Compromisso do dia · {dataCurta(hoje)}</h1>
        <p className="mt-1 text-sm text-stone-400">Defina de manhã quanto vai entregar em cada indicador. O realizado o sistema calcula sozinho, direto da Sunne.</p>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded border border-imperium-line bg-imperium-surface px-3 py-1 text-stone-300">
          Sequência: <strong className="text-gold-bright">{streakKpis(porDia)}</strong> dia(s) útil(eis)
        </span>
        <span className={"rounded border px-3 py-1 " + (cumpridoHoje ? "border-success/50 text-success-bright" : "border-imperium-line text-stone-400")}>
          Hoje: {cumpridoHoje ? "cumprido" : hojeLinhas.size > 0 ? "em andamento" : "sem compromisso lançado"}
        </span>
      </div>

      <form action={salvarCompromissoEnergia} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {KPIS_ENERGIA.map((k) => {
            const v = valores[k.chave];
            const meta = hojeLinhas.get(k.chave)?.meta ?? 0;
            const batido = v !== null && meta > 0 && v >= meta;
            return (
              <section key={k.chave} className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-widest text-stone-500">{k.label}</p>
                  {meta > 0 && v !== null && (
                    <span className={"rounded border px-2 py-0.5 text-xs " + (batido ? "border-success/50 text-success-bright" : "border-amber-400/50 text-amber-400")}>{batido ? "Cumprido" : "Em andamento"}</span>
                  )}
                </div>
                <p className="mt-1 text-3xl font-semibold text-stone-100">
                  {v === null ? "—" : fmt(v)}
                  <span className="text-lg font-normal text-stone-500"> / {meta > 0 ? fmt(meta) : "?"}</span>
                </p>
                <p className="mt-1 text-[11px] text-stone-500">{v === null ? "não deu para ler da Sunne agora" : "realizado hoje · automático"}</p>
                <label className="mt-3 block text-xs text-stone-400">
                  Compromisso
                  <input name={"meta_" + k.chave} type="number" min={0} step="any" defaultValue={meta || ""} className={campo} />
                </label>
              </section>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="rounded border border-gold/50 bg-gold/10 px-4 py-2 text-sm text-gold-bright hover:bg-gold/20">
            Salvar compromisso
          </button>
          <p className="text-[11px] text-stone-500">Indicações recebidas entra em breve.</p>
        </div>
      </form>

      {historico.length > 0 && (
        <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="mb-3 text-[10px] uppercase tracking-widest text-stone-500">Últimos dias</p>
          <ul className="space-y-1 text-sm">
            {historico.map(([dia, ls]) => (
              <li key={dia} className="flex flex-wrap items-center gap-x-3 text-stone-300">
                <span className="w-12 text-stone-500">{dataCurta(dia)}</span>
                <span className={diaCumprido(ls) ? "text-success-bright" : "text-wine-bright"}>{diaCumprido(ls) ? "Cumprido" : "Não cumprido"}</span>
                <span className="text-xs text-stone-500">{ls.map((l) => l.label + " " + fmt(l.realizado) + "/" + fmt(l.meta)).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
