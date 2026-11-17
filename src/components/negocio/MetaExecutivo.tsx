import type { PaceCalculado } from "@/lib/pace-negocio";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** Primeira coisa que o executivo vê no Mural: meta do mês, onde deveria estar (pace) e onde está. */
export default function MetaExecutivo({
  pace,
  equipe,
  cor,
  mesLabel,
  mesAtual,
  time = false,
}: {
  /** Head: mostra a meta e o pace do time do negócio, não os individuais. */
  time?: boolean;
  pace: PaceCalculado;
  equipe: string;
  cor: string;
  mesLabel: string;
  /** Só no mês corrente existe "onde deveria estar". */
  mesAtual: boolean;
}) {
  const { meta, recebido, esperadoAteHoje } = pace;
  const pctRecebido = meta > 0 ? Math.min(100, (recebido / meta) * 100) : 0;
  const pctEsperado = meta > 0 ? Math.min(100, (esperadoAteHoje / meta) * 100) : 0;
  const diferenca = recebido - esperadoAteHoje;
  const noRitmo = diferenca >= 0;

  return (
    <section className="rounded-lg border bg-imperium-surface p-4" style={{ borderColor: `rgb(${cor} / 0.55)` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">
          {time ? "Meta do time" : "Sua meta"} · {equipe} · {mesLabel}
        </p>
        {meta > 0 && <p className="text-2xl font-semibold text-stone-100">{Math.round((recebido / meta) * 100)}%</p>}
      </div>

      {meta <= 0 ? (
        <p className="mt-2 text-sm text-stone-400">{time ? "A meta do time" : "Sua meta"} do mês ainda não foi definida.</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Meta do mês</p>
              <p className="mt-0.5 text-lg font-semibold text-stone-100">{moeda(meta)}</p>
            </div>
            {mesAtual && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-stone-500">Onde deveria estar hoje</p>
                <p className="mt-0.5 text-lg font-semibold text-stone-300">{moeda(esperadoAteHoje)}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-stone-500">{time ? "Onde o time está" : "Onde você está"}</p>
              <p className={`mt-0.5 text-lg font-semibold ${mesAtual ? (noRitmo ? "text-success-bright" : "text-wine-bright") : "text-gold-bright"}`}>
                {moeda(recebido)}
              </p>
            </div>
          </div>

          <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-imperium-raised">
            {mesAtual && <div className="absolute inset-y-0 left-0 opacity-25" style={{ width: `${pctEsperado}%`, backgroundColor: `rgb(${cor})` }} />}
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pctRecebido}%`, backgroundColor: `rgb(${cor})` }} />
            {mesAtual && <div className="absolute top-0 h-full w-0.5 bg-stone-200/80" style={{ left: `${pctEsperado}%` }} title="Onde deveria estar hoje" />}
          </div>

          <p className="mt-2 text-xs text-stone-400">
            {recebido >= meta ? "meta batida" : `faltam ${moeda(Math.max(0, meta - recebido))}`}
            {mesAtual && (
              <span className={noRitmo ? "text-success-bright" : "text-wine-bright"}>
                {" "}
                · {noRitmo ? `${moeda(diferenca)} acima do ritmo` : `${moeda(-diferenca)} abaixo do ritmo`}
              </span>
            )}
            {mesAtual && pace.diasUteisRestantes > 0 && pace.necessarioPorDia !== null && recebido < meta && (
              <span> · precisa de {moeda(pace.necessarioPorDia)} por dia útil</span>
            )}
          </p>
        </>
      )}
    </section>
  );
}
