import { salvarCompromissoKpis } from "@/app/(app)/compromisso/kpi-actions";
import Card from "@/components/ui/Card";
import { CARGO_LABEL, type CargoNegocio } from "@/lib/negocios";
import { agruparPorDia, diaCumprido, streakKpis, type ContextoKpis, type KpiLinha } from "@/lib/compromisso-kpis";

function dataCurta(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** Compromisso do dia com os indicadores de esforço do negócio e do cargo. */
export default function CompromissoKpis({
  ctx,
  hoje,
  linhas,
}: {
  ctx: ContextoKpis;
  hoje: string;
  linhas: KpiLinha[];
}) {
  const porDia = agruparPorDia(linhas);
  const hojeLinhas = new Map((porDia.get(hoje) ?? []).map((l) => [l.chave, l]));
  const cumpridoHoje = diaCumprido(porDia.get(hoje) ?? []);
  const streak = streakKpis(porDia);
  const historico = Array.from(porDia.entries()).filter(([d]) => d !== hoje).slice(0, 10);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <p className="text-[10px] uppercase tracking-widest text-stone-500">
          {ctx.negocioNome} · {CARGO_LABEL[ctx.cargo as CargoNegocio] ?? ctx.cargo}
        </p>
        <h1 className="font-display text-2xl text-gold-bright">Compromisso do dia</h1>
        <p className="mt-1 text-sm text-stone-400">
          Defina de manhã quanto vai entregar em cada indicador e atualize o realizado ao longo do dia.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded border border-imperium-line bg-imperium-surface px-3 py-1 text-stone-300">
          Sequência: <strong className="text-gold-bright">{streak}</strong> dia(s) útil(eis)
        </span>
        <span
          className={`rounded border px-3 py-1 ${
            cumpridoHoje ? "border-success/50 text-success-bright" : "border-imperium-line text-stone-400"
          }`}
        >
          Hoje: {cumpridoHoje ? "cumprido" : hojeLinhas.size > 0 ? "em andamento" : "sem compromisso lançado"}
        </span>
      </div>

      <Card>
        <form action={salvarCompromissoKpis} className="space-y-4">
          <input type="hidden" name="negocio_id" value={ctx.negocioId} />
          <input type="hidden" name="cargo" value={ctx.cargo} />
          <div className="grid grid-cols-[1fr_6rem_6rem] items-center gap-x-3 gap-y-2 text-sm">
            <span className="text-[10px] uppercase tracking-widest text-stone-500">Indicador</span>
            <span className="text-[10px] uppercase tracking-widest text-stone-500">Compromisso</span>
            <span className="text-[10px] uppercase tracking-widest text-stone-500">Realizado</span>
            {ctx.definicoes.map((d) => {
              const l = hojeLinhas.get(d.chave);
              const batido = l && l.meta > 0 && l.realizado >= l.meta;
              return (
                <div key={d.chave} className="contents">
                  <span className={batido ? "text-success-bright" : "text-stone-200"}>{d.label}</span>
                  <input
                    name={`meta_${d.chave}`}
                    type="number"
                    min={0}
                    step="any"
                    defaultValue={l?.meta ?? ""}
                    className="w-full rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-stone-100 focus:border-gold focus:outline-none"
                  />
                  <input
                    name={`real_${d.chave}`}
                    type="number"
                    min={0}
                    step="any"
                    defaultValue={l?.realizado ?? ""}
                    className="w-full rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-stone-100 focus:border-gold focus:outline-none"
                  />
                </div>
              );
            })}
          </div>
          <button type="submit" className="rounded border border-gold/50 bg-gold/10 px-4 py-2 text-sm text-gold-bright hover:bg-gold/20">
            Salvar
          </button>
        </form>
      </Card>

      {historico.length > 0 && (
        <Card>
          <p className="mb-3 text-[10px] uppercase tracking-widest text-stone-500">Últimos dias</p>
          <ul className="space-y-1 text-sm">
            {historico.map(([dia, ls]) => (
              <li key={dia} className="flex flex-wrap items-center gap-x-3 text-stone-300">
                <span className="w-12 text-stone-500">{dataCurta(dia)}</span>
                <span className={diaCumprido(ls) ? "text-success-bright" : "text-wine-bright"}>
                  {diaCumprido(ls) ? "Cumprido" : "Não cumprido"}
                </span>
                <span className="text-xs text-stone-500">
                  {ls.map((l) => `${l.label} ${l.realizado}/${l.meta}`).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
