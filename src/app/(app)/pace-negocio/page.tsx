import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hojeBR } from "@/lib/data-br";
import { podeVerArea } from "@/lib/permissoes-analista";
import {
  CARGO_LABEL,
  COOKIE_NEGOCIO,
  NEGOCIO_COR,
  buscarNegociosVisiveis,
  negocioEmFoco,
  veConsolidado,
  nomeEquipe,
  type CargoNegocio,
} from "@/lib/negocios";
import { CARGOS_QUE_VENDEM, buscarPaceNegocios, calcularPace, diasUteis, limitesDoMes, type PaceCalculado, type PaceNegocio, type StatusPace } from "@/lib/pace-negocio";
import { buscarEsforcoNegocio, serieDoMes, type EsforcoNegocio, type IdealFunil, type IndicadorEsforco, type PontoSerie } from "@/lib/pace-esforco";
import { RealizadoComLeads } from "@/components/negocio/RealizadoComLeads";
import { PARAMETROS, indiceMes, metaKwhForecast, vendasDoMes } from "@/lib/forecast-negocios";
import { buscarAcumuladoKwhSunne } from "@/lib/sunne";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewerContext } from "@/lib/preview";

export const dynamic = "force-dynamic";

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const STATUS: Record<StatusPace, { texto: string; classe: string }> = {
  sem_meta: { texto: "Sem meta", classe: "border-imperium-line text-stone-400" },
  adiantado: { texto: "Adiantado", classe: "border-success/50 text-success-bright" },
  no_ritmo: { texto: "No ritmo", classe: "border-amber-400/50 text-amber-400" },
  atrasado: { texto: "Atrasado", classe: "border-wine/60 text-wine-bright" },
  critico: { texto: "Crítico", classe: "border-wine/80 bg-wine/10 text-wine-bright" },
};

/** Curva do recebido acumulado contra a linha ideal da meta (ambos em dias corridos do mês). */
function Curva({ n, ano, mes, cor, rotulo = "Recebido" }: { n: PaceNegocio; ano: number; mes: number; cor: string; rotulo?: string }) {
  const { inicio, fim } = limitesDoMes(ano, mes);
  const diasNoMes = Number(fim.slice(8));
  const total = n.pace.diasUteisTotal || 1;
  const topo = Math.max(n.pace.meta, n.pace.recebido, n.pace.projecao, 1);
  const W = 300;
  const H = 90;
  const x = (dia: number) => ((dia - 1) / Math.max(1, diasNoMes - 1)) * W;
  const y = (v: number) => H - (v / topo) * (H - 6) - 3;

  const ideal: string[] = [];
  for (let d = 1; d <= diasNoMes; d++) {
    const data = `${inicio.slice(0, 8)}${String(d).padStart(2, "0")}`;
    ideal.push(`${x(d).toFixed(1)},${y((n.pace.meta * diasUteis(inicio, data)) / total).toFixed(1)}`);
  }
  const real = n.acumulado.map((a) => `${x(Number(a.data.slice(8))).toFixed(1)},${y(a.valor).toFixed(1)}`);
  const ultimo = n.acumulado[n.acumulado.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" role="img" aria-label={`${rotulo} acumulado contra o ritmo ideal da meta`}>
      <line x1="0" y1={H - 3} x2={W} y2={H - 3} stroke="currentColor" strokeOpacity="0.15" />
      <polyline points={ideal.join(" ")} fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="4 3" />
      {real.length > 1 && <polyline points={real.join(" ")} fill="none" stroke={`rgb(${cor})`} strokeWidth="2.5" strokeLinejoin="round" />}
      {ultimo && <circle cx={x(Number(ultimo.data.slice(8)))} cy={y(ultimo.valor)} r="3.5" fill={`rgb(${cor})`} />}
    </svg>
  );
}

const kwh = (v: number) => `${Math.round(v).toLocaleString("pt-BR")} kWh`;

/** Energy: o mesmo painel do recebido, em kWh vendidos (fechados na Sunne), abaixo do gráfico do recebido. */
function CartaoKwh({ n, pace, acumulado, ano, mes }: { n: PaceNegocio; pace: PaceCalculado; acumulado: { data: string; valor: number }[]; ano: number; mes: number }) {
  const cor = NEGOCIO_COR[n.negocio.slug] ?? "201 162 74";
  const st = STATUS[pace.status];
  const pct = pace.meta > 0 ? Math.round((pace.recebido / pace.meta) * 100) : null;
  const pctEsperado = pace.meta > 0 ? Math.round((pace.esperadoAteHoje / pace.meta) * 100) : null;
  const adaptado: PaceNegocio = { ...n, pace, acumulado };
  return (
    <section className="rounded-lg border bg-imperium-surface p-4" style={{ borderColor: `rgb(${cor} / 0.55)` }}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-base font-semibold" style={{ color: `rgb(${cor})` }}>
          kWh vendidos · {nomeEquipe(n.negocio)}
        </p>
        <span className={`shrink-0 rounded border px-2 py-0.5 text-xs ${st.classe}`}>{st.texto}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Realizado</p>
          <p className="text-lg font-semibold text-stone-100">{kwh(pace.recebido)}</p>
          <p className="text-[11px] text-stone-500">{pct === null ? "sem meta" : `${pct}% da meta de ${kwh(pace.meta)}`}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Deveria estar em</p>
          <p className="text-lg font-semibold text-stone-100">{pace.meta > 0 ? kwh(pace.esperadoAteHoje) : "—"}</p>
          <p className="text-[11px] text-stone-500">{pctEsperado === null ? "" : `${pctEsperado}% da meta`}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Projeção do mês</p>
          <p className="text-lg font-semibold text-stone-100">{pace.diasUteisDecorridos > 0 ? kwh(pace.projecao) : "—"}</p>
          <p className="text-[11px] text-stone-500">{pace.meta > 0 && pace.diasUteisDecorridos > 0 ? `${Math.round((pace.projecao / pace.meta) * 100)}% da meta` : ""}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Falta por dia útil</p>
          <p className="text-lg font-semibold text-stone-100">{pace.necessarioPorDia === null || pace.meta <= 0 ? "—" : kwh(pace.necessarioPorDia)}</p>
          <p className="text-[11px] text-stone-500">{pace.meta > 0 ? `faltam ${kwh(pace.falta)}` : ""}</p>
        </div>
      </div>
      <div className="mt-3 text-stone-400">
        <Curva n={adaptado} ano={ano} mes={mes} cor={cor} rotulo="kWh" />
        <p className="mt-1 text-[10px] text-stone-500">Linha cheia: kWh fechados acumulados (consumo médio dos negócios fechados na Sunne) · tracejada: ritmo da meta</p>
      </div>
    </section>
  );
}

function CartaoPace({ n, ano, mes, aberto }: { n: PaceNegocio; ano: number; mes: number; aberto: boolean }) {
  const cor = NEGOCIO_COR[n.negocio.slug] ?? "201 162 74";
  const p = n.pace;
  const st = STATUS[p.status];
  const pctMeta = p.meta > 0 ? Math.round((p.recebido / p.meta) * 100) : null;
  const pctEsperado = p.meta > 0 ? Math.round((p.esperadoAteHoje / p.meta) * 100) : null;

  return (
    <section className="rounded-lg border bg-imperium-surface p-4" style={{ borderColor: `rgb(${cor} / 0.55)` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {n.negocio.equipe_bandeira && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={n.negocio.equipe_bandeira} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
          )}
          <div className="min-w-0">
            <p className="truncate text-base font-semibold" style={{ color: `rgb(${cor})` }}>
              {nomeEquipe(n.negocio)}
            </p>
            <p className="text-[11px] text-stone-500">
              {p.diasUteisDecorridos} de {p.diasUteisTotal} dias úteis · restam {p.diasUteisRestantes}
            </p>
          </div>
        </div>
        <span className={`shrink-0 rounded border px-2 py-0.5 text-xs ${st.classe}`}>{st.texto}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Recebido</p>
          <p className="text-lg font-semibold text-stone-100">{moeda(p.recebido)}</p>
          <p className="text-[11px] text-stone-500">{pctMeta === null ? "sem meta" : `${pctMeta}% da meta`}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Deveria estar em</p>
          <p className="text-lg font-semibold text-stone-100">{p.meta > 0 ? moeda(p.esperadoAteHoje) : "—"}</p>
          <p className="text-[11px] text-stone-500">{pctEsperado === null ? "" : `${pctEsperado}% da meta`}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Projeção do mês</p>
          <p className="text-lg font-semibold text-stone-100">{p.diasUteisDecorridos > 0 ? moeda(p.projecao) : "—"}</p>
          <p className="text-[11px] text-stone-500">{p.meta > 0 && p.diasUteisDecorridos > 0 ? `${Math.round((p.projecao / p.meta) * 100)}% da meta` : ""}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Falta por dia útil</p>
          <p className="text-lg font-semibold text-stone-100">{p.necessarioPorDia === null || p.meta <= 0 ? "—" : moeda(p.necessarioPorDia)}</p>
          <p className="text-[11px] text-stone-500">{p.meta > 0 ? `faltam ${moeda(p.falta)}` : ""}</p>
        </div>
      </div>

      <div className="mt-3 text-stone-400">
        <Curva n={n} ano={ano} mes={mes} cor={cor} />
        <p className="mt-1 text-[10px] text-stone-500">Linha cheia: recebido acumulado · tracejada: ritmo da meta</p>
      </div>

      {n.pessoas.length > 0 && (
        <details className="mt-3" open={aberto}>
          <summary className="cursor-pointer select-none text-[10px] uppercase tracking-widest text-stone-500 hover:text-stone-300">
            Por pessoa
          </summary>
          <ul className="mt-2 divide-y divide-imperium-line text-sm">
            {n.pessoas.map((x) => (
              <li key={x.id} className="flex items-center gap-3 py-1.5">
                <span className="min-w-0 flex-1 truncate text-stone-200">{x.nome}</span>
                <span className="w-24 shrink-0 text-xs text-stone-500">{CARGO_LABEL[x.cargo as CargoNegocio] ?? x.cargo}</span>
                <span className="w-28 shrink-0 text-right text-stone-100">{moeda(x.recebido)}</span>
                <span className="w-32 shrink-0 text-right text-xs text-stone-500">
                  {x.cargo === "head" ? (p.meta > 0 ? `meta da B.U ${moeda(p.meta)}` : "líder da B.U") : x.meta === null ? "meta de esforço" : `meta ${moeda(x.meta)}`}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export default async function PaceNegocioPage({ searchParams }: { searchParams: { negocio?: string; mes?: string } }) {
  const supabase = await createClient();
  // Pessoa "vista": respeita o "Ver como" do Diretor.
  const viewer = await getViewerContext(supabase);
  if (!viewer) redirect("/login");
  const user = { id: viewer.effectiveId };
  const eu = { role: viewer.effectiveRole };
  if (eu.role === "analista" && !(await podeVerArea(supabase, user.id, eu.role, "dados"))) redirect("/");

  const visiveis = (await buscarNegociosVisiveis(supabase, user.id, eu.role)).filter((n) => n.status === "ativo");
  if (visiveis.length === 0) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="font-display text-xl text-gold-bright">Sem negócio vinculado</h1>
        <p className="mt-2 text-sm text-stone-400">Você ainda não está em nenhum negócio ativo.</p>
      </main>
    );
  }

  const hoje = hojeBR();
  const m = /^(\d{4})-(\d{2})$/.exec(searchParams.mes ?? "");
  const ano = m ? Number(m[1]) : Number(hoje.slice(0, 4));
  const mes = m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? Number(m[2]) : Number(hoje.slice(5, 7));

  const cookieStore = cookies();
  const foco = negocioEmFoco(searchParams.negocio ?? cookieStore.get(COOKIE_NEGOCIO)?.value, visiveis);
  const escolhidos = foco ? [foco] : visiveis;

  const dados = await buscarPaceNegocios(supabase, ano, mes, hoje, escolhidos.map((n) => n.slug));
  // Pace Comercial (esforço + closer) só com um negócio em foco que tenha times por canal configurados.
  let esforco: EsforcoNegocio | null = null;
  if (foco && dados.length === 1) {
    try {
      esforco = await buscarEsforcoNegocio(createAdminClient(), foco.slug, foco.id, { ano, mes, hoje });
    } catch (e) {
      console.error("pace de esforço falhou:", e);
    }
  }

  const ant = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
  const seg = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
  // Executivo (não é Head nem visão consolidada): vê só o próprio pace, com o negócio como referência.
  const cargoNoFoco = foco?.cargo ?? null;
  const individual = !veConsolidado(eu.role) && !!foco && cargoNoFoco !== "head" && dados.length === 1;
  if (individual && foco) {
    const d = dados[0];
    const eu = d.pessoas.find((p) => p.id === user.id);
    return (
      <main className="mx-auto max-w-3xl space-y-5 px-6 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl text-gold-bright">Meu pace</h1>
            <p className="mt-1 text-sm text-stone-400">
              {nomeEquipe(foco)} · {MESES[mes]} de {ano}. Dias úteis de segunda a sexta, sem feriados.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/pace-negocio?mes=${ant}`} className="rounded border border-imperium-line px-3 py-1 text-stone-300 hover:text-stone-100">
              ← {MESES[mes === 1 ? 12 : mes - 1]}
            </Link>
            <Link href={`/pace-negocio?mes=${seg}`} className="rounded border border-imperium-line px-3 py-1 text-stone-300 hover:text-stone-100">
              {MESES[mes === 12 ? 1 : mes + 1]} →
            </Link>
          </div>
        </div>
        {eu && eu.meta !== null ? (
          <PaceIndividual
            meu={calcularPace({ meta: eu.meta, recebido: eu.recebido, hoje, ano, mes })}
            vendas={eu.vendas}
            negocio={d.pace}
            equipe={nomeEquipe(foco)}
            cor={NEGOCIO_COR[foco.slug] ?? "201 162 74"}
          />
        ) : (
          <p className="rounded-lg border border-imperium-line bg-imperium-surface p-4 text-sm text-stone-400">
            Sua meta individual neste negócio ainda não foi definida.
          </p>
        )}
      </main>
    );
  }

  // Energy: segundo painel, em kWh fechados (Sunne) contra a meta de kWh do mês, abaixo do recebido.
  const kwhPorNegocio = new Map<string, { pace: PaceCalculado; acumulado: { data: string; valor: number }[] }>();
  for (const d of dados) {
    const metaKwh = Math.round(metaKwhForecast(d.negocio.slug, ano, mes));
    if (metaKwh <= 0) continue;
    try {
      const acumulado = await buscarAcumuladoKwhSunne(ano, mes, hoje);
      const realizado = acumulado[acumulado.length - 1]?.valor ?? 0;
      kwhPorNegocio.set(d.negocio.id, { pace: calcularPace({ meta: metaKwh, recebido: realizado, hoje, ano, mes }), acumulado });
    } catch (e) {
      console.error("kWh da Sunne indisponível no Pace:", e);
    }
  }

  const metaTotal = dados.reduce((s, d) => s + d.pace.meta, 0);
  const recebidoTotal = dados.reduce((s, d) => s + d.pace.recebido, 0);
  const esperadoTotal = dados.reduce((s, d) => s + d.pace.esperadoAteHoje, 0);
  const projecaoTotal = dados.reduce((s, d) => s + d.pace.projecao, 0);

  const sufixo = foco ? `&negocio=${foco.slug}` : "";

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Pace de recebimento</h1>
          <p className="mt-1 text-sm text-stone-400">
            {foco ? nomeEquipe(foco) : "Todos os negócios"} · {MESES[mes]} de {ano}. Dias úteis de segunda a sexta, sem feriados.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/pace-negocio?mes=${ant}${sufixo}`} className="rounded border border-imperium-line px-3 py-1 text-stone-300 hover:text-stone-100">
            ← {MESES[mes === 1 ? 12 : mes - 1]}
          </Link>
          <Link href={`/pace-negocio?mes=${seg}${sufixo}`} className="rounded border border-imperium-line px-3 py-1 text-stone-300 hover:text-stone-100">
            {MESES[mes === 12 ? 1 : mes + 1]} →
          </Link>
        </div>
      </div>

      {visiveis.length > 1 && (
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href={`/pace-negocio?mes=${ano}-${String(mes).padStart(2, "0")}&negocio=todos`}
            className={`rounded border px-3 py-1 ${!foco ? "border-gold text-stone-100" : "border-imperium-line text-stone-400 hover:text-stone-100"}`}
          >
            Todos
          </Link>
          {visiveis.map((n) => (
            <Link
              key={n.id}
              href={`/pace-negocio?mes=${ano}-${String(mes).padStart(2, "0")}&negocio=${n.slug}`}
              className={`rounded border px-3 py-1 ${foco?.id === n.id ? "border-gold text-stone-100" : "border-imperium-line text-stone-400 hover:text-stone-100"}`}
            >
              {nomeEquipe(n)}
            </Link>
          ))}
        </div>
      )}

      {dados.length > 1 && (
        <div className="grid grid-cols-2 gap-4 rounded-lg border border-imperium-line bg-imperium-surface p-4 sm:grid-cols-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Recebido</p>
            <p className="text-xl font-semibold text-gold-bright">{moeda(recebidoTotal)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Meta do mês</p>
            <p className="text-xl font-semibold text-stone-100">{metaTotal > 0 ? moeda(metaTotal) : "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Deveria estar em</p>
            <p className="text-xl font-semibold text-stone-100">{metaTotal > 0 ? moeda(esperadoTotal) : "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Projeção</p>
            <p className="text-xl font-semibold text-stone-100">{dados.some((d) => d.pace.diasUteisDecorridos > 0) ? moeda(projecaoTotal) : "—"}</p>
          </div>
        </div>
      )}

      <div className={`grid gap-4 ${dados.length > 1 ? "lg:grid-cols-2" : ""}`}>
        {dados.map((d) => {
          const k = kwhPorNegocio.get(d.negocio.id);
          return (
            <div key={d.negocio.id} className="space-y-4">
              <CartaoPace n={d} ano={ano} mes={mes} aberto={dados.length === 1} />
              {k && <CartaoKwh n={d} pace={k.pace} acumulado={k.acumulado} ano={ano} mes={mes} />}
            </div>
          );
        })}
      </div>

      {esforco && dados[0] && <PaceComercial n={dados[0]} esforco={esforco} ano={ano} mes={mes} />}
    </main>
  );
}

// ------------------------------------------------------------ Pace individual (executivo)

function PaceIndividual({ meu, vendas, negocio, equipe, cor }: { meu: PaceCalculado; vendas: number; negocio: PaceCalculado; equipe: string; cor: string }) {
  const pctMeu = meu.meta > 0 ? Math.round((meu.recebido / meu.meta) * 100) : null;
  const pctNegocio = negocio.meta > 0 ? Math.round((negocio.recebido / negocio.meta) * 100) : null;
  const esperadoPct = meu.diasUteisTotal > 0 ? Math.round((meu.diasUteisDecorridos / meu.diasUteisTotal) * 100) : 0;
  return (
    <>
      <section className="rounded-lg border bg-imperium-surface p-4" style={{ borderColor: `rgb(${cor} / 0.55)` }}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Você · recebido</p>
          <SeloStatus status={meu.status} />
        </div>
        <p className="mt-1 text-3xl font-semibold text-stone-100">
          {moeda(meu.recebido)} <span className="text-base font-normal text-stone-500">de {moeda(meu.meta)}</span>
        </p>
        <BarraPace p={meu} />
        <div className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Deveria estar em</p>
            <p className="text-stone-100">{moeda(meu.esperadoAteHoje)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Projeção do mês</p>
            <p className="text-stone-100">{meu.diasUteisDecorridos > 0 ? moeda(meu.projecao) : "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Falta</p>
            <p className="text-stone-100">{meu.falta > 0 ? moeda(meu.falta) : "meta batida"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Por dia útil</p>
            <p className="text-stone-100">{meu.necessarioPorDia !== null && meu.falta > 0 ? moeda(meu.necessarioPorDia) : "—"}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-stone-500">
          {vendas} {vendas === 1 ? "venda" : "vendas"} no mês · {pctMeu ?? 0}% da sua meta · {esperadoPct}% dos dias úteis já passaram
        </p>
      </section>

      <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">Para comparar · resultado de {equipe}</p>
        <p className="mt-1 text-lg font-semibold text-stone-100">
          {moeda(negocio.recebido)} <span className="text-sm font-normal text-stone-500">de {moeda(negocio.meta)}</span>
          {pctNegocio !== null && <span className="ml-2 text-sm text-stone-400">{pctNegocio}%</span>}
        </p>
        <BarraPace p={negocio} />
        <p className="mt-1.5 text-xs text-stone-500">
          {pctMeu !== null && pctNegocio !== null
            ? pctMeu >= pctNegocio
              ? `Você está ${pctMeu - pctNegocio} p.p. à frente do negócio.`
              : `Você está ${pctNegocio - pctMeu} p.p. atrás do negócio.`
            : ""}
        </p>
      </section>
    </>
  );
}

// ------------------------------------------------------------ Pace Comercial (por B.U)

const CANAL_NOME: Record<string, string> = { outbound: "Outbound", inbound: "Tráfego Pago", indicacao: "Referidos", alternativo: "Canais alternativos" };
const dec = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const COR_STATUS: Record<StatusPace, string> = {
  sem_meta: "rgb(120 113 108)",
  adiantado: "rgb(var(--c-success-bright))",
  no_ritmo: "rgb(251 191 36)",
  atrasado: "rgb(var(--c-wine-bright))",
  critico: "rgb(var(--c-wine-bright))",
};

/** Barra do realizado sobre a meta, com a marca de onde deveria estar hoje. */
function BarraPace({ p }: { p: PaceCalculado }) {
  if (!(p.meta > 0)) return null;
  const feito = Math.min(100, (p.recebido / p.meta) * 100);
  const esperado = Math.min(100, (p.esperadoAteHoje / p.meta) * 100);
  return (
    <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-imperium-raised" title={`Deveria estar em ${dec(p.esperadoAteHoje)} hoje`}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${feito}%`, background: COR_STATUS[p.status] }} />
      <div className="absolute inset-y-0 w-0.5 bg-stone-100" style={{ left: `${esperado}%` }} />
    </div>
  );
}

function SeloStatus({ status }: { status: StatusPace }) {
  const st = STATUS[status];
  return <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${st.classe}`}>{st.texto}</span>;
}

function linhaFalta(p: PaceCalculado, fmt: (v: number) => string) {
  if (!(p.meta > 0)) return "sem meta no mês";
  if (p.falta <= 0) return "meta batida";
  return p.necessarioPorDia === null ? `faltaram ${fmt(p.falta)}` : `faltam ${fmt(p.falta)} · ${fmt(p.necessarioPorDia)} por dia útil`;
}

/** Cartão de um indicador do time no topo (recebido, agendadas, realizadas). */
function CartaoIndicador({ titulo, p, fmt, canais }: { titulo: string; p: PaceCalculado; fmt: (v: number) => string; canais?: IndicadorEsforco["canais"] }) {
  return (
    <div className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">{titulo}</p>
        <SeloStatus status={p.status} />
      </div>
      <p className="mt-1 text-2xl font-semibold text-stone-100">
        {fmt(p.recebido)} {p.meta > 0 && <span className="text-sm font-normal text-stone-500">de {fmt(p.meta)}</span>}
      </p>
      <BarraPace p={p} />
      <p className="mt-1.5 text-[11px] text-stone-400">
        {p.meta > 0 ? `${Math.round((p.recebido / p.meta) * 100)}% da meta · deveria estar em ${fmt(p.esperadoAteHoje)}` : ""}
      </p>
      <p className="text-[11px] text-stone-500">{linhaFalta(p, fmt)}</p>
      {canais && canais.length > 0 && (
        <p className="mt-1.5 text-[11px] text-stone-500">
          {canais.map((c, i) => (
            <span key={c.canal}>
              {i > 0 && " · "}
              {CANAL_NOME[c.canal]} <span className="text-stone-300">{dec(c.realizado)}</span>
              {c.meta != null ? ` de ${dec(c.meta)}` : ""}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/** Bloco de um indicador dentro do cartão de uma pessoa: o total com pace e, embaixo, os canais. */
function BlocoPessoa({ titulo, ind }: { titulo: string; ind: IndicadorEsforco }) {
  const p = ind.pace;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-stone-300">{titulo}</span>
        <SeloStatus status={p.status} />
      </div>
      <p className="mt-0.5 text-lg font-semibold text-stone-100">
        {dec(p.recebido)} {p.meta > 0 && <span className="text-xs font-normal text-stone-500">de {dec(p.meta)}</span>}
      </p>
      <BarraPace p={p} />
      <p className="mt-1 text-[11px] text-stone-500">
        {p.meta > 0 ? `deveria estar em ${dec(p.esperadoAteHoje)} · ` : ""}
        {linhaFalta(p, dec)}
      </p>
      {ind.canais.length > 1 && (
        <p className="mt-0.5 text-[11px] text-stone-500">
          {ind.canais.map((c, i) => (
            <span key={c.canal}>
              {i > 0 && " · "}
              {CANAL_NOME[c.canal]} <span className="text-stone-300">{dec(c.realizado)}</span>
              {c.meta != null ? ` de ${dec(c.meta)}` : ""}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function Avatar({ nome, cor }: { nome: string; cor: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold" style={{ background: `rgb(${cor} / 0.18)`, color: `rgb(${cor})` }}>
      {nome.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function PaceComercial({ n, esforco, ano, mes }: { n: PaceNegocio; esforco: EsforcoNegocio; ano: number; mes: number }) {
  const cor = NEGOCIO_COR[n.negocio.slug] ?? "201 162 74";
  const p = n.pace;
  const pctMes = p.diasUteisTotal > 0 ? p.diasUteisDecorridos / p.diasUteisTotal : 0;
  const hoje = hojeBR();
  // Closer: quem vende no portal (closer, executivo), com a meta individual de recebimento.
  const closers = n.pessoas.filter((x) => CARGOS_QUE_VENDEM.includes(x.cargo));
  const par = PARAMETROS[n.negocio.slug];
  const i = indiceMes(ano, mes);
  const vendasPlanejadas = par && i >= 0 ? vendasDoMes(par, i).total : null;
  const ticketPlanejado = vendasPlanejadas && vendasPlanejadas > 0 && p.meta > 0 ? p.meta / vendasPlanejadas : null;
  // Recebido por dia (do acumulado em dias corridos) para o gráfico dia útil a dia útil.
  const serieRecebido = serieDoMes(
    p.meta,
    n.acumulado.map((a, k) => [a.data, a.valor - (k > 0 ? n.acumulado[k - 1].valor : 0)] as [string, number]),
    ano,
    mes,
    hoje,
  );
  return (
    <div className="space-y-4">
      {/* Calendário do mês */}
      <div className="rounded-lg border border-imperium-line bg-imperium-surface px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
          <span className="text-stone-300">
            {p.diasUteisDecorridos >= p.diasUteisTotal
              ? `Mês encerrado · ${p.diasUteisTotal} dias úteis`
              : p.diasUteisDecorridos === 0
                ? `Não começou · ${p.diasUteisTotal} dias úteis`
                : `${p.diasUteisDecorridos}º dia útil de ${p.diasUteisTotal} · ${p.diasUteisRestantes} restantes`}
          </span>
          <span className="text-stone-500">{Math.round(pctMes * 100)}% do mês transcorrido · sem feriados nacionais</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-imperium-raised">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, pctMes * 100)}%`, background: `rgb(${cor})` }} />
        </div>
      </div>

      {/* Topo: recebido, agendadas e realizadas do time */}
      <div className="grid gap-4 md:grid-cols-3">
        <CartaoIndicador titulo="Recebido" p={p} fmt={moeda} />
        <CartaoIndicador titulo="Reuniões agendadas" p={esforco.time.reunioes_agendadas.pace} fmt={dec} canais={esforco.time.reunioes_agendadas.canais} />
        <CartaoIndicador titulo="Reuniões realizadas" p={esforco.time.reunioes_realizadas.pace} fmt={dec} canais={esforco.time.reunioes_realizadas.canais} />
      </div>

      {/* Pré-vendas: o pace total de cada um (um canal compensa o outro) e os canais embaixo */}
      {esforco.preVendas.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-widest text-stone-500">Pré-vendas · meta do canal dividida entre quem trabalha nele</p>
          <div className="grid gap-4 md:grid-cols-3">
            {esforco.preVendas.map((pv) => (
              <section key={pv.id} className="space-y-3 rounded-lg border border-imperium-line bg-imperium-surface p-4">
                <div className="flex items-center gap-2.5">
                  <Avatar nome={pv.nome} cor={cor} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-stone-100">{pv.nome}</p>
                    <p className="text-[11px] text-stone-500">
                      Pré-vendas · {pv.indicadores.reunioes_agendadas.canais.filter((c) => c.meta != null).map((c) => CANAL_NOME[c.canal]).join(" e ")}
                    </p>
                  </div>
                </div>
                <BlocoPessoa titulo="Reuniões agendadas" ind={pv.indicadores.reunioes_agendadas} />
                <BlocoPessoa titulo="Reuniões realizadas" ind={pv.indicadores.reunioes_realizadas} />
              </section>
            ))}
          </div>
        </div>
      )}

      {/* Funis do mês: Agendadas → Realizadas → Vendas, do time e de cada pré-vendas */}
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-widest text-stone-500">Agendadas → realizadas → vendas · conversão ideal pelas metas do forecast</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FunilPace titulo="Time" subtitulo="todos os canais" ind={esforco.time} ideal={esforco.ideal} cor={cor} destaque />
          {esforco.preVendas.map((pv) => (
            <FunilPace key={pv.id} titulo={pv.nome} subtitulo="vendas originadas: as que ele agendou" ind={pv.indicadores} ideal={pv.ideal} cor={cor} />
          ))}
        </div>
      </div>

      {/* Esperado × realizado acumulado, dia útil a dia útil */}
      <div>
        <p className="mb-2 text-[10px] uppercase tracking-widest text-stone-500">Esperado × realizado, dia útil a dia útil</p>
        <div className="grid gap-4 md:grid-cols-3">
          <GraficoSerie titulo="Recebido" serie={serieRecebido} cor={cor} fmt={moeda} />
          <GraficoSerie titulo="Reuniões agendadas" serie={esforco.time.reunioes_agendadas.serie ?? []} cor={cor} fmt={dec} />
          <GraficoSerie titulo="Reuniões realizadas" serie={esforco.time.reunioes_realizadas.serie ?? []} cor={cor} fmt={dec} />
        </div>
      </div>

      {/* Closer: recebido com pace, vendas e ticket contra o planejado */}
      {closers.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-widest text-stone-500">Closer</p>
          <div className="grid gap-4 md:grid-cols-3">
            {closers.map((c) => {
              const pc = calcularPace({ meta: c.meta ?? 0, recebido: c.recebido, hoje, ano, mes });
              const ticket = c.vendas > 0 ? c.recebido / c.vendas : null;
              const vendasMeta = vendasPlanejadas != null && closers.length > 0 ? vendasPlanejadas / closers.length : null;
              return (
                <section key={c.id} className="space-y-3 rounded-lg border border-imperium-line bg-imperium-surface p-4">
                  <div className="flex items-center gap-2.5">
                    <Avatar nome={c.nome} cor={cor} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-stone-100">{c.nome}</p>
                      <p className="text-[11px] text-stone-500">{CARGO_LABEL[c.cargo as CargoNegocio] ?? c.cargo}</p>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-stone-300">Recebido</span>
                      <SeloStatus status={pc.status} />
                    </div>
                    <p className="mt-0.5 text-lg font-semibold text-stone-100">
                      {moeda(pc.recebido)} {pc.meta > 0 && <span className="text-xs font-normal text-stone-500">de {moeda(pc.meta)}</span>}
                    </p>
                    <BarraPace p={pc} />
                    <p className="mt-1 text-[11px] text-stone-500">{linhaFalta(pc, moeda)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-stone-500">Vendas</p>
                      <p className="font-semibold text-stone-100">{c.vendas}</p>
                      <p className="text-[11px] text-stone-500">{vendasMeta != null ? `planejado ${dec(vendasMeta)}` : ""}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-stone-500">Ticket médio</p>
                      <p className="font-semibold text-stone-100">{ticket === null ? "—" : moeda(ticket)}</p>
                      <p className="text-[11px] text-stone-500">{ticketPlanejado != null ? `planejado ${moeda(ticketPlanejado)}` : ""}</p>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const ETAPAS_DO_FUNIL: { chave: "reunioes_agendadas" | "reunioes_realizadas" | "vendas"; nome: string }[] = [
  { chave: "reunioes_agendadas", nome: "Agendadas" },
  { chave: "reunioes_realizadas", nome: "Realizadas" },
  { chave: "vendas", nome: "Vendas" },
];

function corConversao(real: number | null, ideal: number | null) {
  if (real === null || ideal === null || ideal <= 0) return "text-stone-300";
  if (real >= ideal) return "text-success-bright";
  if (real >= ideal * 0.85) return "text-amber-400";
  return "text-wine-bright";
}
const pctTxt = (v: number | null) => (v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

/** Funil Agendadas → Realizadas → Vendas contra a meta, com a conversão real × ideal entre as etapas. */
function FunilPace({
  titulo,
  subtitulo,
  ind,
  ideal,
  cor,
  destaque = false,
}: {
  titulo: string;
  subtitulo: string;
  ind: Record<"reunioes_agendadas" | "reunioes_realizadas" | "vendas", IndicadorEsforco>;
  ideal: IdealFunil;
  cor: string;
  destaque?: boolean;
}) {
  const larguras = [100, 78, 56];
  return (
    <section className="rounded-lg border bg-imperium-surface p-4" style={{ borderColor: destaque ? `rgb(${cor} / 0.55)` : undefined }}>
      <p className="truncate font-semibold" style={{ color: destaque ? `rgb(${cor})` : undefined }}>
        {titulo}
      </p>
      <p className="text-[11px] text-stone-500">{subtitulo}</p>
      <div className="mt-3 space-y-1">
        {ETAPAS_DO_FUNIL.map((e, i) => {
          const p = ind[e.chave].pace;
          const ant = i > 0 ? ind[ETAPAS_DO_FUNIL[i - 1].chave].pace.recebido : null;
          const real = ant !== null && ant > 0 ? p.recebido / ant : null;
          const id = i === 1 ? ideal.realizadas : i === 2 ? ideal.vendas : null;
          return (
            <div key={e.chave}>
              {i > 0 && (
                <p className="py-0.5 text-center text-[10px] text-stone-500">
                  ↓ <span className={corConversao(real, id)}>{pctTxt(real)}</span> · ideal {pctTxt(id)}
                </p>
              )}
              {/* Faixa em forma de funil: largura fixa por etapa; o preenchimento é o realizado sobre a meta. */}
              <div className="mx-auto" style={{ width: `${larguras[i]}%` }}>
                <div className="relative overflow-hidden rounded-md border border-imperium-line bg-imperium-raised px-2.5 py-1.5">
                  {p.meta > 0 && (
                    <div className="absolute inset-y-0 left-0" style={{ width: `${Math.min(100, (p.recebido / p.meta) * 100)}%`, background: `rgb(${cor} / 0.28)` }} />
                  )}
                  <div className="relative flex items-center justify-between gap-2 text-xs">
                    <span className="text-stone-300">{e.nome}</span>
                    <span className="tabular-nums">
                      <RealizadoComLeads valor={dec(p.recebido)} leads={ind[e.chave].leads} />
                      {p.meta > 0 && <span className="text-stone-500"> de {dec(p.meta)}</span>}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Gráfico do esperado (tracejado) contra o realizado acumulado (cheio), um ponto por dia útil. */
function GraficoSerie({ titulo, serie, cor, fmt }: { titulo: string; serie: PontoSerie[]; cor: string; fmt: (v: number) => string }) {
  const W = 300;
  const H = 110;
  const PAD = 4;
  const n = serie.length;
  const topo = Math.max(1, ...serie.map((s) => Math.max(s.esperado, s.realizado ?? 0)));
  const x = (i: number) => PAD + (i / Math.max(1, n - 1)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - (v / topo) * (H - 2 * PAD - 10);
  const esperado = serie.map((s, i) => `${x(i).toFixed(1)},${y(s.esperado).toFixed(1)}`).join(" ");
  const andados = serie.map((s, i) => ({ s, i })).filter((p) => p.s.realizado !== null);
  const realizado = andados.map(({ s, i }) => `${x(i).toFixed(1)},${y(s.realizado as number).toFixed(1)}`).join(" ");
  const ultimo = andados[andados.length - 1];
  const fimMes = serie[n - 1];
  return (
    <div className="rounded-lg border border-imperium-line bg-imperium-surface p-4 text-stone-400">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-stone-300">{titulo}</p>
        {ultimo && (
          <p className="text-[11px] text-stone-500">
            <span className="text-stone-100">{fmt(ultimo.s.realizado as number)}</span> de {fmt(ultimo.s.esperado)} esperados até hoje
          </p>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-28 w-full" role="img" aria-label={`${titulo}: esperado e realizado acumulados por dia útil`}>
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="currentColor" strokeOpacity="0.15" />
        <polyline points={esperado} fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="4 3" />
        {andados.length > 1 && <polyline points={realizado} fill="none" stroke={`rgb(${cor})`} strokeWidth="2.5" strokeLinejoin="round" />}
        {ultimo && <circle cx={x(ultimo.i)} cy={y(ultimo.s.realizado as number)} r="3.5" fill={`rgb(${cor})`} />}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-stone-500">
        <span>1º dia útil</span>
        <span>meta {fimMes ? fmt(fimMes.esperado) : "—"} no {n}º dia útil</span>
      </div>
    </div>
  );
}
