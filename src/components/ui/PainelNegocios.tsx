import type { ReactNode } from "react";
import { NEGOCIO_COR, nomeEquipe } from "@/lib/negocios";
import type { LinhaPainelNegocio } from "@/lib/negocio-painel";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function pct(recebido: number, meta: number): number | null {
  return meta > 0 ? Math.round((recebido / meta) * 100) : null;
}

/** Painel do Mural: meta e recebido da empresa + um quadrante por negócio. */
export default function PainelNegocios({
  linhas,
  mesLabel,
  ritmoPct,
  lancar,
}: {
  linhas: LinhaPainelNegocio[];
  mesLabel: string;
  /** % do mês já transcorrido (só no mês corrente): marca onde a barra deveria estar. */
  ritmoPct: number | null;
  /** Atalho para lançar venda (só o Diretor). */
  lancar?: ReactNode;
}) {
  const ativos = linhas.filter((l) => l.status === "ativo");
  const arquivados = linhas.filter((l) => l.status === "arquivado" && l.recebido > 0);
  const metaTotal = ativos.reduce((s, l) => s + l.meta, 0);
  const recebidoTotal = linhas.reduce((s, l) => s + l.recebido, 0);
  const pctTotal = pct(recebidoTotal, metaTotal);

  return (
    <section className="mb-6 space-y-3">
      <div className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Recebimento da empresa · {mesLabel}</p>
            <p className="mt-1 text-2xl font-semibold text-gold-bright">
              {moeda(recebidoTotal)}
              <span className="ml-2 text-sm font-normal text-stone-400">
                {metaTotal > 0 ? `de ${moeda(metaTotal)}` : "(sem forecast)"}
              </span>
            </p>
          </div>
          {pctTotal !== null && <p className="text-3xl font-semibold text-stone-100">{pctTotal}%</p>}
        </div>
        {metaTotal > 0 && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-imperium-raised">
            <div className="h-full rounded-full bg-gold" style={{ width: `${Math.min(100, pctTotal ?? 0)}%` }} />
          </div>
        )}
        {metaTotal > 0 && <Situacao recebido={recebidoTotal} meta={metaTotal} ritmoPct={ritmoPct} />}
        {arquivados.length > 0 && (
          <p className="mt-2 text-xs text-stone-500">
            Inclui {arquivados.map((a) => `${nomeEquipe(a)}: ${moeda(a.recebido)}`).join(" · ")}
          </p>
        )}
      </div>

      {lancar}

      <div className="grid gap-3 sm:grid-cols-2">
        {ativos.map((n) => {
          const cor = NEGOCIO_COR[n.slug] ?? "201 162 74";
          const p = pct(n.recebido, n.meta);
          return (
            <div
              key={n.id}
              className="rounded-lg border bg-imperium-surface p-4"
              style={{ borderColor: `rgb(${cor} / 0.55)` }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  {n.equipe_bandeira && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={n.equipe_bandeira} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: `rgb(${cor})` }}>
                      {nomeEquipe(n)}
                    </p>
                    {n.equipe_nome && n.equipe_nome !== n.nome && (
                      <p className="truncate text-[11px] text-stone-500">{n.nome}</p>
                    )}
                  </div>
                </div>
                <p className="text-2xl font-semibold text-stone-100">{p === null ? "—" : `${p}%`}</p>
              </div>
              <Barra rotulo="Recebido" valor={n.recebido} meta={n.meta} cor={cor} ritmoPct={ritmoPct} />
              {n.mrrMeta > 0 && <Barra rotulo="MRR" valor={n.mrrRealizado} meta={n.mrrMeta} cor={cor} ritmoPct={ritmoPct} />}
              {n.kwhMeta > 0 && <Barra rotulo="kWh no mês" valor={n.kwhRealizado} meta={n.kwhMeta} cor={cor} ritmoPct={ritmoPct} fmt={kwhFmt} />}
              <p className="mt-3 text-[11px] text-stone-500">
                {n.vendasQtd} {n.vendasQtd === 1 ? "lançamento" : "lançamentos"} no mês
                {n.meta > 0 && <> · <Situacao inline recebido={n.recebido} meta={n.meta} ritmoPct={ritmoPct} /></>}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Barra de progresso com a marca de ritmo (onde deveria estar hoje). */
function kwhFmt(v: number) {
  return `${Math.round(v).toLocaleString("pt-BR")} kWh`;
}

function Barra({ rotulo, valor, meta, cor, ritmoPct, fmt = moeda }: { rotulo: string; valor: number; meta: number; cor: string; ritmoPct: number | null; fmt?: (v: number) => string }) {
  const p = pct(valor, meta);
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="uppercase tracking-widest text-stone-500">{rotulo}</span>
        <span className="text-stone-300">
          <span className="font-semibold text-stone-100">{fmt(valor)}</span>
          {meta > 0 ? ` de ${fmt(meta)} · ${p}%` : " · sem meta definida"}
        </span>
      </div>
      <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-imperium-raised">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, p ?? 0)}%`, backgroundColor: `rgb(${cor})` }} />
        {ritmoPct !== null && meta > 0 && <div className="absolute top-0 h-full w-0.5 bg-stone-200/70" style={{ left: `${Math.min(100, ritmoPct)}%` }} />}
      </div>
    </div>
  );
}

/** Quanto falta e se está no ritmo da meta (só no mês corrente). */
function Situacao({ recebido, meta, ritmoPct, inline }: { recebido: number; meta: number; ritmoPct: number | null; inline?: boolean }) {
  const falta = Math.max(0, meta - recebido);
  const esperado = ritmoPct !== null ? (meta * ritmoPct) / 100 : null;
  const noRitmo = esperado === null ? null : recebido >= esperado;
  const texto = falta === 0 ? "meta batida" : `faltam ${moeda(falta)}`;
  const ritmo = noRitmo === null ? null : noRitmo ? "no ritmo" : `${moeda(esperado! - recebido)} abaixo do ritmo`;
  const conteudo = (
    <>
      {texto}
      {ritmo && (
        <span className={noRitmo ? "text-success-bright" : "text-wine-bright"}> · {ritmo}</span>
      )}
    </>
  );
  return inline ? <>{conteudo}</> : <p className="mt-2 text-xs text-stone-400">{conteudo}</p>;
}
