import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hojeBR } from "@/lib/data-br";
import { COOKIE_NEGOCIO, NEGOCIO_COR, buscarNegociosVisiveis, negocioEmFoco, nomeEquipe } from "@/lib/negocios";
import { buscarDashboardNegocio, RANKINGS, type MixCanal } from "@/lib/dashboard-negocio";
import { aplicarRealizado, etapasIntegradas, funisDoMes } from "@/lib/funil-negocio";
import { buscarComissoesNegocios } from "@/lib/comissao-negocio";
import { buscarResumoSunne, type SunneResumo } from "@/lib/sunne";
import { buscarLigacoesSunne, type LigacoesResumo } from "@/lib/api4com";
import type { StatusPace } from "@/lib/pace-negocio";

export const dynamic = "force-dynamic";

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const CANAL: Record<MixCanal["canal"], string> = { outbound: "Outbound", inbound: "Inbound", indicacao: "Indicação", sem_canal: "Sem canal" };
const STATUS: Record<StatusPace, { texto: string; classe: string }> = {
  sem_meta: { texto: "Sem meta", classe: "border-imperium-line text-stone-400" },
  adiantado: { texto: "Adiantado", classe: "border-success/50 text-success-bright" },
  no_ritmo: { texto: "No ritmo", classe: "border-amber-400/50 text-amber-400" },
  atrasado: { texto: "Atrasado", classe: "border-wine/60 text-wine-bright" },
  critico: { texto: "Crítico", classe: "border-wine/80 bg-wine/10 text-wine-bright" },
};

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
/** Conversão real vs. meta: verde = na meta ou acima; amarelo = até 15% abaixo; vermelho = mais distante. */
function corConversao(real: number | null, meta: number | null): string {
  if (real === null || meta === null || meta <= 0) return "text-stone-100";
  if (real >= meta) return "text-success-bright";
  if (real >= meta * 0.85) return "text-warning-bright";
  return "text-wine-bright";
}

function num(v: number) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}
function dataCurta(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
function Barra({ valor, total, cor }: { valor: number; total: number; cor: string }) {
  const p = total > 0 ? Math.min(100, (valor / total) * 100) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-imperium-raised">
      <div className="h-full rounded-full" style={{ width: `${p}%`, backgroundColor: `rgb(${cor})` }} />
    </div>
  );
}

export default async function NegocioDashboardPage({ searchParams }: { searchParams: { negocio?: string; mes?: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: eu } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!eu) redirect("/");

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

  const atual = negocioEmFoco(searchParams.negocio ?? cookies().get(COOKIE_NEGOCIO)?.value, visiveis) ?? visiveis[0];
  const dados = await buscarDashboardNegocio(supabase, atual.slug, ano, mes, hoje);
  if (!dados) redirect("/");

  let sunne: SunneResumo | null = null;
  let sunneErro = false;
  let ligacoes: LigacoesResumo | null = null;
  let ligacoesErro = false;
  if (atual.slug === "vorp-energy") {
    // Sunne (contas e vendas) e Api4Com (ligações do Inside Sales) em paralelo; uma não derruba a outra.
    const [rs, rl] = await Promise.allSettled([buscarResumoSunne(supabase, ano, mes), buscarLigacoesSunne(supabase, ano, mes)]);
    if (rs.status === "fulfilled") sunne = rs.value;
    else {
      console.error("buscarResumoSunne falhou:", rs.reason);
      sunneErro = true;
    }
    if (rl.status === "fulfilled") ligacoes = rl.value;
    else {
      console.error("buscarLigacoesSunne falhou:", rl.reason);
      ligacoesErro = true;
    }
  }

  const ehGestor = eu.role === "diretor" || atual.cargo === "head";
  const comissao = ehGestor ? (await buscarComissoesNegocios(supabase, ano, mes, [atual.slug]))[0] : null;

  const { pace } = dados.pace;
  const cor = NEGOCIO_COR[atual.slug] ?? "201 162 74";
  const st = STATUS[pace.status];
  const pctMeta = pace.meta > 0 ? Math.round((pace.recebido / pace.meta) * 100) : null;
  const ant = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
  const seg = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
  const mesParam = `${ano}-${String(mes).padStart(2, "0")}`;
  const totalMix = dados.vendas.mix.reduce((s, x) => s + x.valor, 0);
  const integradas = etapasIntegradas(atual.slug);
  const inicioMes = `${mesParam}-01`;
  const fimMesExcl = `${seg}-01`;
  const { data: linhasRealizado } =
    integradas.size > 0
      ? await supabase
          .from("funil_realizado")
          .select("canal, etapa, quantidade, synced_at")
          .eq("negocio_id", atual.id)
          .gte("data", inicioMes)
          .lt("data", fimMesExcl)
          .range(0, 9999)
      : { data: [] as { canal: string; etapa: string; quantidade: number; synced_at: string }[] };
  // Energy: Alôs e Conexões do Outbound são as ligações do Inside Sales na Api4Com.
  const funis = aplicarRealizado(funisDoMes(atual.slug, ano, mes), linhasRealizado ?? [], integradas).map((fu) =>
    atual.slug === "vorp-energy" && ligacoes && fu.canal === "outbound"
      ? { ...fu, etapas: fu.etapas.map((e) => (e.chave === "alos" ? { ...e, realizado: ligacoes.alos } : e.chave === "conexoes" ? { ...e, realizado: ligacoes.conexoes } : e)) }
      : fu,
  );
  const ultimaSyncFunil = (linhasRealizado ?? []).reduce<string | null>((m, l) => (!m || l.synced_at > m ? l.synced_at : m), null);
  const fracaoMes = pace.diasUteisTotal > 0 ? pace.diasUteisDecorridos / pace.diasUteisTotal : 0;
  // Energy: contas subidas vêm da Sunne (negócios criados no mês por vendedor), não do compromisso do dia.
  const rankings = (RANKINGS[atual.slug] ?? [])
    .map((k) => dados.esforco.find((e) => e.chave === k))
    .filter((e): e is NonNullable<typeof e> => !!e)
    .map((rk) =>
      atual.slug === "vorp-energy" && rk.chave === "contas_subidas" && sunne
        ? {
            ...rk,
            realizado: sunne.criados,
            porPessoa: sunne.porOrganizacao
              .filter((o) => o.criados > 0)
              .map((o) => ({ nome: o.pessoa ?? o.nome, meta: 0, realizado: o.criados }))
              .sort((a, b) => b.realizado - a.realizado || a.nome.localeCompare(b.nome, "pt-BR")),
            fonte: "Sunne",
          }
        : { ...rk, fonte: null as string | null },
    );
  // Realizado do funil do Energy: a Sunne não informa o canal, então é o total de todos os canais.
  const metaEtapa = (label: string) => funis.reduce((s, fu) => s + (fu.etapas.find((e) => e.label === label)?.meta ?? 0), 0);
  const funilSunne = atual.slug === "vorp-energy" && sunne ? { contas: sunne.criados, metaContas: metaEtapa("Contas subidas"), vendas: sunne.fechados, metaVendas: metaEtapa("Vendas") } : null;
  const pessoasComVenda = dados.pace.pessoas.filter((p) => p.recebido > 0);

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {atual.equipe_bandeira && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={atual.equipe_bandeira} alt="" className="h-14 w-14 rounded-md object-cover" />
          )}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Dashboard do negócio · {MESES[mes]} de {ano}</p>
            <h1 className="font-display text-2xl" style={{ color: `rgb(${cor})` }}>
              {nomeEquipe(atual)}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/negocio?mes=${ant}&negocio=${atual.slug}`} className="rounded border border-imperium-line px-3 py-1 text-stone-300 hover:text-stone-100">
            ← {MESES[mes === 1 ? 12 : mes - 1]}
          </Link>
          <Link href={`/negocio?mes=${seg}&negocio=${atual.slug}`} className="rounded border border-imperium-line px-3 py-1 text-stone-300 hover:text-stone-100">
            {MESES[mes === 12 ? 1 : mes + 1]} →
          </Link>
        </div>
      </div>

      {visiveis.length > 1 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {visiveis.map((n) => (
            <Link
              key={n.id}
              href={`/negocio?mes=${mesParam}&negocio=${n.slug}`}
              className={`rounded border px-3 py-1 ${n.id === atual.id ? "border-gold text-stone-100" : "border-imperium-line text-stone-400 hover:text-stone-100"}`}
            >
              {nomeEquipe(n)}
            </Link>
          ))}
        </div>
      )}

      {/* Resultado */}
      <section className="rounded-lg border bg-imperium-surface p-4" style={{ borderColor: `rgb(${cor} / 0.55)` }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Recebido</p>
            <p className="text-3xl font-semibold text-stone-100">{moeda(pace.recebido)}</p>
            <p className="text-sm text-stone-400">{pace.meta > 0 ? `${pctMeta}% de ${moeda(pace.meta)} (meta do forecast)` : "sem meta de forecast neste mês"}</p>
          </div>
          <span className={`rounded border px-2 py-0.5 text-xs ${st.classe}`}>{st.texto}</span>
        </div>
        <div className="mt-3">
          <Barra valor={pace.recebido} total={pace.meta} cor={cor} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Deveria estar em</p>
            <p className="font-semibold text-stone-100">{pace.meta > 0 ? moeda(pace.esperadoAteHoje) : "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Projeção do mês</p>
            <p className="font-semibold text-stone-100">{pace.diasUteisDecorridos > 0 ? moeda(pace.projecao) : "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Falta por dia útil</p>
            <p className="font-semibold text-stone-100">{pace.necessarioPorDia === null || pace.meta <= 0 ? "—" : moeda(pace.necessarioPorDia)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Dias úteis</p>
            <p className="font-semibold text-stone-100">
              {pace.diasUteisDecorridos} de {pace.diasUteisTotal}
            </p>
          </div>
        </div>
      </section>

      {/* Funil do mês: volumes e conversões, um bloco por canal, lado a lado */}
      <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Funil do mês (meta do forecast)</p>
          <div className="text-right">
            {funilSunne ? (
              <p className="text-[11px] text-stone-400">
                Realizado na Sunne, todos os canais: <span className="text-stone-100">{num(funilSunne.contas)}</span> contas subidas de {num(funilSunne.metaContas)} ·{" "}
                <span className="text-stone-100">{num(funilSunne.vendas)}</span> vendas de {num(funilSunne.metaVendas)}
              </p>
            ) : (
              <p className="text-[11px] text-stone-500">
                {atual.slug === "vorp-energy" && sunneErro
                  ? "Dados da Sunne indisponíveis no momento"
                  : integradas.size === 0
                    ? "Realizado aguardando a integração com o Pipefácil"
                    : ultimaSyncFunil
                      ? `Realizado: 3C Plus e Pipefácil · atualizado ${new Date(ultimaSyncFunil).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                      : "Realizado: 3C Plus e Pipefácil · aguardando a primeira sincronização"}
              </p>
            )}
            {atual.slug === "vorp-energy" && (
              <p className="text-[11px] text-stone-500">
                {ligacoes
                  ? `Alôs e Conexões do Outbound: ligações do Inside Sales na Api4Com (${num(ligacoes.ligacoes)} no mês)`
                  : ligacoesErro
                    ? "Ligações da Api4Com indisponíveis no momento"
                    : null}
              </p>
            )}
          </div>
        </div>
        {funis.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">Este negócio ainda não tem forecast neste mês.</p>
        ) : (
          <div className={`mt-3 grid gap-5 ${funis.length >= 3 ? "lg:grid-cols-3" : funis.length === 2 ? "lg:grid-cols-2" : ""}`}>
            {funis.map((fu) => {
              // Todos os canais têm o mesmo número de linhas: os mais curtos ganham linhas vazias no topo,
              // assim as etapas finais (reuniões, propostas, vendas) e os cabeçalhos ficam na mesma altura.
              const pad = Math.max(...funis.map((x) => x.etapas.length)) - fu.etapas.length;
              return (
                <div key={fu.canal} className="min-w-0">
                  <p className="border-b pb-1.5 text-sm font-semibold" style={{ color: `rgb(${cor})`, borderColor: `rgb(${cor} / 0.4)` }}>
                    {fu.titulo}
                  </p>

                  {/* Volumes: colunas fixas para alinhar os números entre as linhas */}
                  <div className="mt-2 grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_3.5rem] items-center gap-x-2 gap-y-1.5 text-xs tabular-nums">
                    <span className="text-[10px] uppercase tracking-widest text-stone-500">Volumes</span>
                    <span className="text-right text-[10px] uppercase tracking-widest text-stone-500">Hoje</span>
                    <span className="text-right text-[10px] uppercase tracking-widest text-stone-500">Real.</span>
                    <span className="text-right text-[10px] uppercase tracking-widest text-stone-500">Meta</span>
                    {Array.from({ length: pad }).map((_, i) => (
                      <div key={`pv${i}`} className="contents" aria-hidden="true">
                        <div className="invisible">
                          <p>.</p>
                          <div className="mt-1 h-1.5" />
                        </div>
                        <span className="invisible">0</span>
                        <span className="invisible">0</span>
                        <span className="invisible">0</span>
                      </div>
                    ))}
                    {fu.etapas.map((e) => (
                      <div key={e.label} className="contents">
                        <div className="min-w-0">
                          <p className="truncate text-stone-200" title={e.label}>
                            {e.label}
                          </p>
                          {/* Barra = meta da etapa (100%): faixa clara = esperado até hoje; preenchimento = realizado. */}
                          <div
                            className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-imperium-raised"
                            title={`Esperado até hoje ${num(e.meta * fracaoMes)} · realizado ${e.realizado === null ? "—" : num(e.realizado)} · meta ${num(e.meta)}`}
                          >
                            <div className="absolute inset-y-0 left-0 opacity-30" style={{ width: `${Math.min(100, fracaoMes * 100)}%`, backgroundColor: `rgb(${cor})` }} />
                            {e.realizado !== null && (
                              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${e.meta > 0 ? Math.min(100, Math.max(0, (e.realizado / e.meta) * 100)) : 0}%`, backgroundColor: `rgb(${cor})` }} />
                            )}
                            <div className="absolute inset-y-0 w-px bg-stone-200" style={{ left: `${Math.min(100, fracaoMes * 100)}%` }} />
                          </div>
                        </div>
                        <span className="text-right text-stone-400">{num(e.meta * fracaoMes)}</span>
                        <span className="text-right text-stone-100">{e.realizado === null ? "—" : num(e.realizado)}</span>
                        <span className="text-right text-stone-300">{num(e.meta)}</span>
                      </div>
                    ))}
                  </div>

                  {/* Conversões: mesma grade, uma linha por passagem de etapa */}
                  <div className="mt-5 grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] items-center gap-x-2 text-xs tabular-nums">
                    <span className="border-b border-imperium-line pb-1 text-[10px] uppercase tracking-widest text-stone-500">Conversões</span>
                    <span className="border-b border-imperium-line pb-1 text-right text-[10px] uppercase tracking-widest text-stone-500">Real.</span>
                    <span className="border-b border-imperium-line pb-1 text-right text-[10px] uppercase tracking-widest text-stone-500">Meta</span>
                    {Array.from({ length: pad }).map((_, i) => (
                      <div key={`pc${i}`} className="contents" aria-hidden="true">
                        <span className="invisible border-b border-transparent py-1.5">.</span>
                        <span className="invisible border-b border-transparent py-1.5">0</span>
                        <span className="invisible border-b border-transparent py-1.5">0</span>
                      </div>
                    ))}
                    {fu.etapas.slice(1).map((e, idx) => {
                      const ant = fu.etapas[idx].realizado;
                      const real = e.realizado !== null && ant !== null && ant > 0 ? e.realizado / ant : null;
                      return (
                      <div key={e.label} className="contents">
                        <span className="min-w-0 truncate border-b border-imperium-line/60 py-1.5 text-stone-300" title={`${fu.etapas[idx].label} → ${e.label}`}>
                          {e.label} <span className="text-stone-500">← {fu.etapas[idx].label}</span>
                        </span>
                        <span className={`border-b border-imperium-line/60 py-1.5 text-right ${corConversao(real, e.conversaoMeta)}`}>
                          {real === null ? "—" : `${(real * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                        </span>
                        <span className="border-b border-imperium-line/60 py-1.5 text-right text-stone-300">
                          {((e.conversaoMeta ?? 0) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                        </span>
                      </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Rankings dos indicadores-chave */}
      {rankings.length > 0 && (
        <div className={`grid gap-4 ${rankings.length >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
          {rankings.map((rk) => (
            <section key={rk.chave} className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Ranking · {rk.label}</p>
              <p className="text-xs text-stone-500">
                {num(rk.realizado)} no mês · {num(rk.meta)} comprometidos
                {rk.fonte ? ` · ${rk.fonte}` : ""}
              </p>
              {rk.porPessoa.length === 0 ? (
                <p className="mt-2 text-sm text-stone-500">Ninguém registrou ainda.</p>
              ) : (
                <ol className="mt-2 space-y-1 text-sm">
                  {rk.porPessoa.slice(0, 8).map((p, i) => (
                    <li key={p.nome} className="flex items-center gap-2">
                      <span className="w-5 text-xs text-stone-500">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-stone-200">{p.nome}</span>
                      <span className="text-stone-100">{num(p.realizado)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
          {atual.slug === "vorp-energy" && (
            <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Ranking · kWh vendido</p>
              <p className="text-xs text-stone-500">Consumo médio dos fechados no mês · Sunne</p>
              {!sunne || sunne.porOrganizacao.every((o) => o.kwh === 0) ? (
                <p className="mt-2 text-sm text-stone-500">{sunneErro ? "Dados da Sunne indisponíveis." : "Nenhum fechamento no mês."}</p>
              ) : (
                <ol className="mt-2 space-y-1 text-sm">
                  {sunne.porOrganizacao
                    .filter((o) => o.kwh > 0)
                    .slice(0, 8)
                    .map((o, i) => (
                      <li key={o.organizationId} className="flex items-center gap-2">
                        <span className="w-5 text-xs text-stone-500">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-stone-200">{o.pessoa ?? o.nome}</span>
                        <span className="text-stone-100">{num(o.kwh)}</span>
                      </li>
                    ))}
                </ol>
              )}
            </section>
          )}
          {atual.slug === "vorp-energy" && (
            <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Ranking · Conexões</p>
              <p className="text-xs text-stone-500">
                {ligacoes ? `${num(ligacoes.conexoes)} conexões (90 s ou mais) · ${num(ligacoes.alos)} alôs · ${num(ligacoes.ligacoes)} ligações` : "Ligações do Inside Sales"} · Api4Com
              </p>
              {!ligacoes || ligacoes.porPessoa.length === 0 ? (
                <p className="mt-2 text-sm text-stone-500">{ligacoesErro ? "Ligações da Api4Com indisponíveis." : "Nenhuma ligação no mês."}</p>
              ) : (
                <ol className="mt-2 space-y-1 text-sm">
                  {ligacoes.porPessoa.slice(0, 8).map((p, i) => (
                    <li key={p.ramal} className="flex items-center gap-2">
                      <span className="w-5 text-xs text-stone-500">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-stone-200" title={`Ramal ${p.ramal}`}>
                        {p.pessoa ?? p.nome}
                      </span>
                      <span className="text-xs text-stone-500" title="Alôs / ligações">
                        {num(p.alos)}/{num(p.ligacoes)}
                      </span>
                      <span className="w-8 text-right text-stone-100">{num(p.conexoes)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>
      )}

      <div className="grid gap-4">
        {/* Vendas */}
        <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Vendas do mês</p>
          <div className="mt-2 flex items-end gap-6">
            <div>
              <p className="text-2xl font-semibold text-stone-100">{dados.vendas.qtd}</p>
              <p className="text-xs text-stone-500">lançamentos{dados.previsto ? ` · previstas ${num(dados.previsto.vendas)}` : ""}</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-stone-100">{dados.vendas.qtd > 0 ? moeda(dados.vendas.ticketMedio) : "—"}</p>
              <p className="text-xs text-stone-500">ticket médio recebido</p>
            </div>
          </div>
          <p className="mt-4 text-[10px] uppercase tracking-widest text-stone-500">Por canal</p>
          {dados.vendas.mix.length === 0 ? (
            <p className="mt-1 text-sm text-stone-500">Nenhuma venda lançada.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {dados.vendas.mix.map((x) => (
                <li key={x.canal}>
                  <div className="flex justify-between">
                    <span className="text-stone-300">
                      {CANAL[x.canal]} <span className="text-xs text-stone-500">· {x.qtd}</span>
                    </span>
                    <span className="text-stone-100">{moeda(x.valor)}</span>
                  </div>
                  <Barra valor={x.valor} total={totalMix} cor={cor} />
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>

      {/* Esforço */}
      <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">Esforço da equipe no mês (compromisso do dia)</p>
        {dados.esforco.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">Sem indicadores cadastrados.</p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {dados.esforco.map((e) => (
              <div key={e.chave}>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-200">{e.label}</span>
                  <span className="text-stone-100">
                    {num(e.realizado)} <span className="text-xs text-stone-500">de {num(e.meta)} comprometidos</span>
                  </span>
                </div>
                <Barra valor={e.realizado} total={e.meta} cor={cor} />
                {e.porPessoa.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer select-none text-[10px] uppercase tracking-widest text-stone-500 hover:text-stone-300">Por pessoa</summary>
                    <ul className="mt-1 text-xs text-stone-400">
                      {e.porPessoa.map((p) => (
                        <li key={p.nome} className="flex justify-between py-0.5">
                          <span>{p.nome}</span>
                          <span>
                            {num(p.realizado)} / {num(p.meta)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Ranking */}
        <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Quem mais recebeu no mês</p>
          {pessoasComVenda.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">Nenhum recebimento ainda.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {pessoasComVenda.slice(0, 8).map((p, i) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="w-5 text-xs text-stone-500">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-stone-200">{p.nome}</span>
                  <span className="text-stone-100">{moeda(p.recebido)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Últimos lançamentos + comissão */}
        <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          {comissao && (
            <div className="mb-3 border-b border-imperium-line pb-3">
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Comissões geradas no mês</p>
              <p className="text-lg font-semibold text-stone-100">
                {comissao.temRegra ? moeda(comissao.totalComissao) : "regra não definida"}
                {comissao.temRegra && comissao.recebido > 0 && (
                  <span className="ml-2 text-xs font-normal text-stone-500">{((comissao.totalComissao / comissao.recebido) * 100).toFixed(1)}% do recebido</span>
                )}
              </p>
            </div>
          )}
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Últimos recebimentos</p>
          {dados.ultimas.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">Nenhum lançamento.</p>
          ) : (
            <ul className="mt-2 divide-y divide-imperium-line text-sm">
              {dados.ultimas.map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-10 shrink-0 text-xs text-stone-500">{dataCurta(u.data)}</span>
                  <span className="min-w-0 flex-1 truncate text-stone-300">
                    {u.vendedor}
                    {u.cliente ? ` · ${u.cliente}` : ""}
                  </span>
                  <span className="shrink-0 text-stone-100">{moeda(u.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
