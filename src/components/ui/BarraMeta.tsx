import { hojeBR, paraDataUTC } from "@/lib/data-br";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

// Barra de crédito realizado x meta do mês, com uma marca vertical mostrando
// onde deveria estar hoje (ritmo linear) e uma frase de análise determinística
// logo abaixo — a leitura de "onde estou / onde deveria estar" em um só lugar.
export default function BarraMeta({
  realizado,
  meta,
  mesFechado = false,
}: {
  realizado: number;
  meta: number;
  // true quando é um mês PASSADO (não o corrente) — "ritmo esperado pra
  // hoje" não faz sentido pra um mês que já acabou, então mostra só
  // resultado final x meta, sem marca de ritmo nem frase de "atrás/à frente".
  mesFechado?: boolean;
}) {
  if (meta <= 0) {
    return (
      <p className="text-sm text-stone-500">
        Meta do mês ainda não cadastrada pelo Diretor.
      </p>
    );
  }

  const pctRealizado = Math.min(100, (realizado / meta) * 100);

  if (mesFechado) {
    const bateu = realizado >= meta;
    return (
      <div>
        <div className="mb-1 flex justify-between text-xs text-stone-400">
          <span>{moeda(realizado)} realizado</span>
          <span>Meta: {moeda(meta)}</span>
        </div>
        <div className="relative h-3 overflow-hidden rounded-full bg-imperium-line">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold to-gold-bright"
            style={{ width: `${pctRealizado}%` }}
          />
        </div>
        <p className={`mt-3 text-sm ${bateu ? "text-success-bright" : "text-warning-bright"}`}>
          {bateu
            ? `Meta batida — ${pctRealizado.toFixed(0)}% do previsto.`
            : `Meta não batida — ${pctRealizado.toFixed(0)}% do previsto, faltaram ${moeda(meta - realizado)}.`}
        </p>
      </div>
    );
  }

  const hoje = paraDataUTC(hojeBR());
  const diaDoMes = hoje.getUTCDate();
  const diasNoMes = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0)).getUTCDate();
  const esperadoHoje = meta * (diaDoMes / diasNoMes);

  const pctEsperado = Math.min(100, (esperadoHoje / meta) * 100);

  const diff = realizado - esperadoHoje;
  const diffPct = (diff / meta) * 100;
  const adiantado = diff >= 0;

  const analise = adiantado
    ? `Você está à frente do ritmo esperado em ${moeda(diff)} (${diffPct.toFixed(0)}% da meta). Nesse passo, bate a meta do mês.`
    : `Você está ${moeda(Math.abs(diff))} (${Math.abs(diffPct).toFixed(0)}% da meta) atrás do ritmo esperado pra hoje — faltam ${moeda(
        Math.max(0, meta - realizado)
      )} pra bater a meta do mês.`;

  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-stone-400">
        <span>{moeda(realizado)} realizado</span>
        <span>Meta: {moeda(meta)}</span>
      </div>
      <div className="relative h-3 overflow-hidden rounded-full bg-imperium-line">
        <div
          className="h-full rounded-full bg-gradient-to-r from-gold to-gold-bright"
          style={{ width: `${pctRealizado}%` }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-stone-100"
          style={{ left: `${pctEsperado}%` }}
          title="Onde você deveria estar hoje"
        />
      </div>
      <p className={`mt-3 text-sm ${adiantado ? "text-success-bright" : "text-warning-bright"}`}>{analise}</p>
    </div>
  );
}
