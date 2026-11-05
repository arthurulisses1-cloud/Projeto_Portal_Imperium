import { salvarMetaNegocio } from "@/app/(app)/negocio-actions";
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
  ano,
  mes,
  mesLabel,
  editavel,
}: {
  linhas: LinhaPainelNegocio[];
  ano: number;
  mes: number;
  mesLabel: string;
  editavel: boolean;
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
                {metaTotal > 0 ? `de ${moeda(metaTotal)}` : "(defina as metas abaixo)"}
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
        {arquivados.length > 0 && (
          <p className="mt-2 text-xs text-stone-500">
            Inclui {arquivados.map((a) => `${nomeEquipe(a)}: ${moeda(a.recebido)}`).join(" · ")}
          </p>
        )}
      </div>

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
                    <img src={n.equipe_bandeira} alt="" className="h-12 w-10 shrink-0" />
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
              <p className="mt-1 text-xs text-stone-400">
                {moeda(n.recebido)} {n.meta > 0 ? `de ${moeda(n.meta)}` : "· sem meta definida"}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-imperium-raised">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(100, p ?? 0)}%`, backgroundColor: `rgb(${cor})` }}
                />
              </div>
              {editavel && (
                <form action={salvarMetaNegocio} className="mt-3 flex items-center gap-2">
                  <input type="hidden" name="negocio_id" value={n.id} />
                  <input type="hidden" name="ano" value={ano} />
                  <input type="hidden" name="mes" value={mes} />
                  <input
                    name="meta"
                    inputMode="numeric"
                    defaultValue={n.meta > 0 ? String(n.meta) : ""}
                    placeholder="Meta de recebimento (R$)"
                    className="w-full rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-xs text-stone-100 focus:border-gold focus:outline-none"
                  />
                  <button type="submit" className="shrink-0 rounded border border-gold/40 px-2 py-1 text-[10px] uppercase text-gold hover:bg-gold/20">
                    Salvar
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
