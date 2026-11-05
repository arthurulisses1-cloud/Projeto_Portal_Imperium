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
  nomeEquipe,
  type CargoNegocio,
} from "@/lib/negocios";
import { buscarPaceNegocios, diasUteis, limitesDoMes, type PaceNegocio, type StatusPace } from "@/lib/pace-negocio";

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
function Curva({ n, ano, mes, cor }: { n: PaceNegocio; ano: number; mes: number; cor: string }) {
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
    <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" role="img" aria-label="Recebido acumulado contra o ritmo ideal da meta">
      <line x1="0" y1={H - 3} x2={W} y2={H - 3} stroke="currentColor" strokeOpacity="0.15" />
      <polyline points={ideal.join(" ")} fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray="4 3" />
      {real.length > 1 && <polyline points={real.join(" ")} fill="none" stroke={`rgb(${cor})`} strokeWidth="2.5" strokeLinejoin="round" />}
      {ultimo && <circle cx={x(Number(ultimo.data.slice(8)))} cy={y(ultimo.valor)} r="3.5" fill={`rgb(${cor})`} />}
    </svg>
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
                  {x.meta === null ? "meta de esforço" : `meta ${moeda(x.meta)}`}
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: eu } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!eu) redirect("/");
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

  const metaTotal = dados.reduce((s, d) => s + d.pace.meta, 0);
  const recebidoTotal = dados.reduce((s, d) => s + d.pace.recebido, 0);
  const esperadoTotal = dados.reduce((s, d) => s + d.pace.esperadoAteHoje, 0);
  const projecaoTotal = dados.reduce((s, d) => s + d.pace.projecao, 0);

  const ant = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
  const seg = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
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
        {dados.map((d) => (
          <CartaoPace key={d.negocio.id} n={d} ano={ano} mes={mes} aberto={dados.length === 1} />
        ))}
      </div>
    </main>
  );
}
