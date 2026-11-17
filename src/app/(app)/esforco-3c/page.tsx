import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hojeBR } from "@/lib/data-br";
import { podeVerArea } from "@/lib/permissoes-analista";
import { vinculoCloserVorp } from "@/lib/closer-negocio";
import { COOKIE_NEGOCIO, NEGOCIO_COR, buscarNegociosVisiveis, negocioEmFoco, nomeEquipe } from "@/lib/negocios";
import { TRESC_POR_NEGOCIO } from "@/lib/integracoes/config";
import { MAX_DIAS, agregar, buscarAtividade, buscarLigacoes, somarAtividade, type Atividade, type PainelEsforco } from "@/lib/esforco-3c";
import { PARAMETROS } from "@/lib/forecast-negocios";

/** Passagem ideal de tentativa para alô (meta do comercial, a mesma do painel antigo). */
const IDEAL_ALO = 0.15;

export const dynamic = "force-dynamic";
// Um mês de ligações são dezenas de páginas da API do 3C.
export const maxDuration = 60;

// Esforço 3C Plus (Dados → Esforço 3C Plus): ligações do discador de cada B.U., com filtro de período,
// pré-vendas, campanha e lista. Trazido do "Dashboard 3C Plus" do painel antigo (17/11/2026), com a regra
// de alô e conexão do funil. Só Diretor, Líder e Analista com acesso a Dados (mesmo recorte da Auditoria).

type Params = { negocio?: string; p?: string; de?: string; ate?: string; ag?: string | string[]; camp?: string | string[]; lista?: string | string[] };

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const lista = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);
function somarDias(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
const num = (v: number) => v.toLocaleString("pt-BR");
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
const curta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
function tempo(s: number) {
  if (s <= 0) return "0s";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : m > 0 ? `${m}min${ss ? ` ${ss}s` : ""}` : `${ss}s`;
}

export default async function Esforco3cPage({ searchParams }: { searchParams: Params }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: eu } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!eu) redirect("/");
  // Closer da Acrópole (Vorp) também vê, só com os dados do Vorp (pelos vínculos dele).
  const closerVorp = eu.role === "closer" && !!(await vinculoCloserVorp(supabase, user.id));
  const pode = eu.role === "diretor" || eu.role === "lider" || closerVorp || (eu.role === "analista" && (await podeVerArea(supabase, user.id, eu.role, "dados")));
  if (!pode) redirect("/");

  // B.U.s com conta no 3C Plus (por enquanto Acrópole e Galáticos).
  const visiveis = (await buscarNegociosVisiveis(supabase, user.id, eu.role)).filter((n) => n.status === "ativo" && TRESC_POR_NEGOCIO[n.slug]);
  if (visiveis.length === 0) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="font-display text-xl text-gold-bright">Esforço 3C Plus</h1>
        <p className="mt-2 text-sm text-stone-400">Nenhuma B.U. sua está ligada ao 3C Plus.</p>
      </main>
    );
  }
  const atual = negocioEmFoco(searchParams.negocio ?? cookies().get(COOKIE_NEGOCIO)?.value, visiveis) ?? visiveis[0];
  const cor = NEGOCIO_COR[atual.slug] ?? "201 162 74";
  const hoje = hojeBR();

  // Período: atalho (hoje, ontem, 7, 30 dias) ou datas; até 31 dias.
  const atalho = searchParams.p ?? (searchParams.de ? "" : "hoje");
  let de = hoje;
  let ate = hoje;
  if (atalho === "ontem") de = ate = somarDias(hoje, -1);
  else if (atalho === "7") de = somarDias(hoje, -6);
  else if (atalho === "30") de = somarDias(hoje, -29);
  else if (!atalho && DIA.test(searchParams.de ?? "")) {
    de = searchParams.de!;
    ate = DIA.test(searchParams.ate ?? "") ? searchParams.ate! : de;
  }
  let aviso: string | null = null;
  if (de > ate) [de, ate] = [ate, de];
  if (ate > hoje) ate = hoje;
  if (diasEntre(de, ate) + 1 > MAX_DIAS) {
    de = somarDias(ate, -(MAX_DIAS - 1));
    aviso = `O período vai até ${MAX_DIAS} dias: mostrando de ${curta(de)} a ${curta(ate)}.`;
  }
  const filtro = { agentes: lista(searchParams.ag), campanhas: lista(searchParams.camp), listas: lista(searchParams.lista) };

  let painel: PainelEsforco | null = null;
  let atividade: Atividade | null = null;
  let erro: string | null = null;
  let truncado = false;
  try {
    const lido = await buscarLigacoes(atual.slug, de, ate, hoje);
    truncado = lido.truncado;
    painel = agregar(atual.slug, lido.ligacoes, de, ate, filtro, TRESC_POR_NEGOCIO[atual.slug].segundosConexao);
    // Utilização: o 3C mede o tempo do agente por campanha (não por lista). Campanhas do período (ou as
    // escolhidas) e, com pré-vendas escolhido, só o tempo deles.
    if (filtro.listas.length === 0) {
      const campanhas = lido.ligacoes.filter((l) => filtro.campanhas.length === 0 || filtro.campanhas.includes(l.campanha)).map((l) => l.campanhaId).filter((x): x is number => !!x);
      const ids = filtro.agentes.length
        ? new Set(lido.ligacoes.filter((l) => l.agente && filtro.agentes.includes(l.agente) && l.agenteId).map((l) => l.agenteId as number))
        : null;
      try {
        atividade = somarAtividade(await buscarAtividade(atual.slug, de, ate, hoje, campanhas), ids);
      } catch (e) {
        console.error("esforço 3C (atividade):", e);
      }
    }
  } catch (e) {
    console.error("esforço 3C:", e);
    erro = "Não foi possível ler as ligações do 3C Plus agora. Tente de novo em instantes.";
  }
  // Passagem ideal de alô para conexão: a taxa do forecast da B.U. (a mesma meta do funil do Dashboard).
  const idealConexao = PARAMETROS[atual.slug]?.outbound?.taxas[0] ?? 0.15;

  const href = (mudar: Partial<Params>) => {
    const p = new URLSearchParams();
    const tudo: Params = { negocio: atual.slug, p: atalho || undefined, de: atalho ? undefined : de, ate: atalho ? undefined : ate, ag: filtro.agentes, camp: filtro.campanhas, lista: filtro.listas, ...mudar };
    for (const [k, v] of Object.entries(tudo)) for (const x of Array.isArray(v) ? v : v ? [v] : []) p.append(k, x);
    return `/esforco-3c?${p}`;
  };
  const filtrando = filtro.agentes.length + filtro.campanhas.length + filtro.listas.length > 0;
  const seg = painel?.segundosConexao ?? 60;

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Esforço 3C Plus</h1>
          <p className="mt-1 text-sm text-stone-400">
            {nomeEquipe(atual)} · {de === ate ? curta(de) : `${curta(de)} a ${curta(ate)}`} · ligações do discador
          </p>
        </div>
        <Link href={href({})} className="rounded border border-imperium-line px-3 py-1 text-sm text-stone-300 hover:text-stone-100">
          Atualizar
        </Link>
      </div>

      {/* B.U. */}
      {visiveis.length > 1 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {visiveis.map((n) => (
            <Link
              key={n.id}
              href={href({ negocio: n.slug, ag: [], camp: [], lista: [] })}
              className={`rounded border px-3 py-1 ${n.id === atual.id ? "border-gold text-stone-100" : "border-imperium-line text-stone-400 hover:text-stone-100"}`}
            >
              {nomeEquipe(n)}
            </Link>
          ))}
        </div>
      )}

      {/* Filtros */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-imperium-line bg-imperium-surface p-3 text-sm">
        <input type="hidden" name="negocio" value={atual.slug} />
        <div className="inline-flex rounded-lg border border-imperium-line bg-imperium-raised p-0.5 text-[12px]">
          {(
            [
              ["hoje", "Hoje"],
              ["ontem", "Ontem"],
              ["7", "7 dias"],
              ["30", "30 dias"],
            ] as const
          ).map(([k, r]) => (
            <Link
              key={k}
              href={href({ p: k, de: undefined, ate: undefined })}
              className={`rounded-md px-2.5 py-1 ${atalho === k ? "bg-imperium-surface font-semibold text-stone-100 shadow" : "text-stone-400 hover:text-stone-200"}`}
            >
              {r}
            </Link>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-[11px] text-stone-500">
          De
          <input type="date" name="de" defaultValue={de} max={hoje} className="rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-sm text-stone-100" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-stone-500">
          Até
          <input type="date" name="ate" defaultValue={ate} max={hoje} className="rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-sm text-stone-100" />
        </label>
        {painel && (
          <>
            <Multi rotulo="Pré-vendas" nome="ag" opcoes={painel.opcoes.agentes} marcadas={filtro.agentes} vazio="Todos" />
            <Multi rotulo="Campanhas" nome="camp" opcoes={painel.opcoes.campanhas} marcadas={filtro.campanhas} vazio="Todas" />
            <Multi rotulo="Listas" nome="lista" opcoes={painel.opcoes.listas} marcadas={filtro.listas} vazio="Todas" largo />
          </>
        )}
        <button type="submit" className="rounded border border-gold/60 px-3 py-1.5 text-stone-100 hover:bg-gold/10">
          Aplicar
        </button>
        {filtrando && (
          <Link href={href({ ag: [], camp: [], lista: [] })} className="px-2 py-1.5 text-stone-400 hover:text-stone-200">
            Limpar filtros
          </Link>
        )}
      </form>

      {aviso && <p className="text-sm text-amber-400">{aviso}</p>}
      {truncado && <p className="text-sm text-amber-400">O período tem ligações demais para ler de uma vez; os números estão incompletos. Escolha um período menor.</p>}
      {erro && <p className="rounded-lg border border-wine/60 bg-wine/10 p-3 text-sm text-wine-bright">{erro}</p>}

      {painel && (
        <>
          {/* Funil do discador: tentativas → alôs → conexões, com a passagem real contra a ideal */}
          <FunilDiscador t={painel.totais} seg={seg} idealAlo={IDEAL_ALO} idealConexao={idealConexao} cor={cor} />

          {/* Utilização do pré-vendas: tempo no discador e quanto virou conversa */}
          <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
            <p className="text-[10px] uppercase tracking-widest" style={{ color: `rgb(${cor})` }}>
              Utilização do pré-vendas
            </p>
            <h2 className="font-display text-lg text-stone-100">Tempo de atividade no discador</h2>
            <p className="mt-0.5 text-[12px] text-stone-400">
              {filtro.listas.length > 0
                ? "Com lista escolhida, só o tempo médio aparece: o 3C Plus mede o tempo do pré-vendas por campanha, não por lista."
                : "Quanto tempo o pré-vendas ficou prospectando no discador e quanto disso virou conversa."}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi
                rotulo="Tempo ativo no discador"
                valor={atividade ? tempo(atividade.ativo) : "—"}
                sub={atividade ? `esperando ${tempo(atividade.esperando)} · falando ${tempo(atividade.falando)}` : filtro.listas.length ? "não se divide por lista" : "o 3C Plus não respondeu"}
                nota={
                  atividade && atividade.ativo > 0
                    ? `Pós-ligação: ${tempo(atividade.pos)} (${pct(atividade.pos, atividade.ativo)} do tempo ativo)${painel.totais.alos ? ` · ${tempo(Math.round(atividade.pos / painel.totais.alos))} por alô` : ""}`
                    : undefined
                }
                dica="Tempo na campanha em modo discador, sem pausa: esperando o discador entregar ligação + falando + pós-ligação (na tela de qualificação, sem receber a próxima). Não conta pausa nem modo manual."
              />
              <Kpi rotulo="Tempo total falando" valor={atividade ? tempo(atividade.falando) : "—"} sub="em conversa com leads" dica="Soma do tempo em que o pré-vendas falou com leads nas ligações do discador." />
              <Kpi rotulo="Tempo médio por chamada atendida" valor={painel.totais.alos ? tempo(painel.totais.faladoMedio) : "—"} sub={`${num(painel.totais.alos)} alôs`} dica="Tempo falado ÷ alôs." />
              <Kpi rotulo="% do tempo falando" valor={atividade ? pct(atividade.falando, atividade.ativo) : "—"} sub="falando ÷ ativo no discador" dica="Tempo total falando ÷ tempo ativo no discador." />
            </div>
          </section>

          {/* Destaque: conexões e como foram qualificadas */}
          <section className="grid gap-4 rounded-lg border bg-imperium-surface p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" style={{ borderColor: `rgb(${cor} / 0.55)` }}>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Conexões · conversas de {seg} s ou mais</p>
              <p className="mt-1 text-4xl font-semibold text-stone-100">{num(painel.totais.conexoes)}</p>
              <p className="text-sm text-stone-400">
                {pct(painel.totais.conexoes, painel.totais.alos)} dos alôs viraram conexão
              </p>
            </div>
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-widest text-stone-500">Como o pré-vendas qualificou as conexões</p>
              <Barras itens={painel.qualificacaoConexoes} cor={cor} vazio={`Nenhuma conversa de ${seg} s ou mais no período.`} />
            </div>
          </section>

          {/* Evolução no tempo: tentativas, alôs e conexões por dia */}
          {painel.porDia.length > 1 && (
            <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
              <p className="text-[10px] uppercase tracking-widest" style={{ color: `rgb(${cor})` }}>
                Evolução no tempo
              </p>
              <h2 className="font-display text-lg text-stone-100">Por dia</h2>
              <TresGraficos itens={painel.porDia.map((d) => ({ rotulo: curta(d.dia), ...d }))} cor={cor} sufixo="por dia" />
            </section>
          )}

          {/* Performance por pré-vendas */}
          <TabelaFunil
            rotulo="Equipe"
            titulo="Performance por pré-vendas"
            coluna="Pré-vendas"
            nota="Tentativas: as das campanhas do pré-vendas (o discador disca sem agente, então a tentativa é da campanha, que leva o nome de quem a trabalha). Alôs e conexões: as que ele atendeu."
            linhas={painel.porPreVendas.map((x) => ({ ...x, chave: x.nome, fraco: !x.temDono }))}
            seg={seg}
          />

          {/* Performance por campanha */}
          <TabelaFunil rotulo="Campanhas" titulo="Performance por campanha" coluna="Campanha" linhas={painel.porCampanha.map((c) => ({ ...c, chave: c.campanha, nome: c.campanha }))} seg={seg} />

          {/* Performance por lista */}
          <TabelaFunil
            rotulo="Bases"
            titulo="Performance por lista"
            coluna="Lista"
            linhas={painel.porLista.map((l) => ({ ...l, chave: l.lista, nome: l.lista, extra: l.campanha }))}
            seg={seg}
          />

          {/* Performance por horário */}
          <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
            <p className="text-[10px] uppercase tracking-widest" style={{ color: `rgb(${cor})` }}>
              Horário
            </p>
            <h2 className="font-display text-lg text-stone-100">Performance por horário</h2>
            <TresGraficos
              itens={painel.porHora.filter((h) => h.ligacoes > 0).map((h) => ({ rotulo: `${h.hora}h`, ...h }))}
              cor={cor}
              sufixo="por hora"
            />
          </section>

          {/* Diagnóstico do discador */}
          <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
            <p className="text-[10px] uppercase tracking-widest" style={{ color: `rgb(${cor})` }}>
              Discador
            </p>
            <h2 className="font-display text-lg text-stone-100">Diagnóstico do discador</h2>
            <p className="mt-0.5 text-[12px] text-stone-400">Como terminaram as tentativas. Passe o mouse em cada linha para ver o que ela quer dizer.</p>
            <div className="mt-3 grid gap-x-8 md:grid-cols-2">
              <Barras itens={painel.porDiagnostico.filter((d) => d.ligacoes > 0)} cor={cor} total={painel.totais.ligacoes} vazio="Nenhuma tentativa no período." />
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function Kpi({ rotulo, valor, sub, dica, nota }: { rotulo: string; valor: string; sub: string; dica: string; nota?: string }) {
  return (
    <div className="rounded-lg border border-imperium-line bg-imperium-surface p-4" title={dica}>
      <p className="text-[10px] uppercase tracking-widest text-stone-500">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold text-stone-100">{valor}</p>
      <p className="text-[11px] text-stone-500">{sub}</p>
      {nota && <p className="mt-2 border-t border-imperium-line pt-2 text-[11px] text-wine-bright">{nota}</p>}
    </div>
  );
}

/** Funil do discador: cada etapa num trapézio, a passagem ideal à esquerda e a real à direita. */
function FunilDiscador({ t, seg, idealAlo, idealConexao, cor }: { t: PainelEsforco["totais"]; seg: number; idealAlo: number; idealConexao: number; cor: string }) {
  const etapas = [
    { nome: "Tentativas", valor: t.ligacoes, sub: "discagens das campanhas", dica: "Tudo o que o discador discou, atendido ou não.", ideal: null, real: null },
    { nome: "Alôs", valor: t.alos, sub: "atendida e falou com o pré-vendas", dica: "Ligação atendida que chegou ao pré-vendas (mesma regra do funil do Dashboard).", ideal: idealAlo, real: t.ligacoes > 0 ? t.alos / t.ligacoes : null },
    { nome: "Conexões", valor: t.conexoes, sub: `${seg} s ou mais de conversa`, dica: `Conversas de ${seg} s ou mais com o pré-vendas.`, ideal: idealConexao, real: t.alos > 0 ? t.conexoes / t.alos : null },
  ];
  const fmtPct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return (
    <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(11rem,15rem)] gap-x-3">
        {etapas.map((e, i) => {
          const topo = 100 - i * 18;
          const base = topo - 18;
          const dif = e.real !== null && e.ideal !== null ? (e.real - e.ideal) * 100 : null;
          return (
            <div key={e.nome} className="contents">
              <div className="flex flex-col items-end justify-center border-r border-imperium-line pr-3 text-right">
                {e.ideal !== null && (
                  <>
                    <span className="text-[10px] uppercase tracking-widest text-stone-500">Ideal</span>
                    <span className="text-lg font-semibold text-stone-100">{fmtPct(e.ideal)}</span>
                  </>
                )}
              </div>
              <div className="flex h-16 items-center justify-center">
                <div
                  className="flex h-full w-full items-center justify-center text-2xl font-semibold text-stone-950"
                  style={{
                    clipPath: `polygon(${(100 - topo) / 2}% 0, ${100 - (100 - topo) / 2}% 0, ${100 - (100 - base) / 2}% 100%, ${(100 - base) / 2}% 100%)`,
                    backgroundColor: `rgb(${cor} / ${0.55 + i * 0.2})`,
                    marginTop: i ? 2 : 0,
                  }}
                >
                  {num(e.valor)}
                </div>
              </div>
              <div className="flex flex-col justify-center border-l border-imperium-line pl-3 text-xs" title={e.dica}>
                <span className="font-semibold text-stone-100">{e.nome}</span>
                <span className="text-[11px] text-stone-500">{e.sub}</span>
                {e.real !== null && (
                  <span className="mt-0.5 text-[11px] text-stone-300">
                    Real <span className="font-semibold text-stone-100">{fmtPct(e.real)}</span>{" "}
                    {dif !== null && (
                      <span className={`rounded px-1 ${dif >= 0 ? "bg-success/15 text-success-bright" : "bg-wine/15 text-wine-bright"}`}>
                        {dif >= 0 ? "▲" : "▼"} {Math.abs(dif).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p. {dif >= 0 ? "acima" : "abaixo"}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-stone-500">
        Ideal: alô {fmtPct(idealAlo)} das tentativas (meta do comercial) · conexão {fmtPct(idealConexao)} dos alôs (forecast da B.U.).
      </p>
    </section>
  );
}

/** Caixa de múltipla escolha (checkboxes) dentro do formulário GET. */
function Multi({ rotulo, nome, opcoes, marcadas, vazio, largo }: { rotulo: string; nome: string; opcoes: string[]; marcadas: string[]; vazio: string; largo?: boolean }) {
  const resumo = marcadas.length === 0 ? vazio : marcadas.length === 1 ? marcadas[0] : `${marcadas.length} marcadas`;
  return (
    <div className="flex flex-col gap-1 text-[11px] text-stone-500">
      {rotulo}
      <details className="relative">
        <summary className={`cursor-pointer list-none truncate rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-sm text-stone-100 ${largo ? "w-72" : "w-48"}`}>{resumo}</summary>
        <div className={`absolute z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-imperium-line bg-imperium-surface p-2 shadow-xl ${largo ? "w-[28rem]" : "w-64"}`}>
          {opcoes.length === 0 ? (
            <p className="text-xs text-stone-500">Nada no período.</p>
          ) : (
            opcoes.map((o) => (
              <label key={o} className="flex items-start gap-2 py-0.5 text-xs text-stone-200">
                <input type="checkbox" name={nome} value={o} defaultChecked={marcadas.includes(o)} className="mt-0.5" />
                <span className="break-all">{o}</span>
              </label>
            ))
          )}
        </div>
      </details>
    </div>
  );
}

function Barras({ itens, cor, vazio, total }: { itens: { nome: string; ligacoes: number; nota?: string }[]; cor: string; vazio?: string; total?: number }) {
  if (itens.length === 0) return vazio ? <p className="text-sm text-stone-500">{vazio}</p> : null;
  const max = Math.max(...itens.map((i) => i.ligacoes), 1);
  const soma = total ?? itens.reduce((s, i) => s + i.ligacoes, 0);
  return (
    <>
      {itens.slice(0, 12).map((i) => (
        <div key={i.nome} className="mb-1.5 text-xs" title={i.nota}>
          <div className="flex justify-between gap-2">
            <span className="truncate text-stone-300">{i.nome}</span>
            <span className="shrink-0 tabular-nums text-stone-100">
              {num(i.ligacoes)} <span className="text-stone-500">· {pct(i.ligacoes, soma)}</span>
            </span>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-imperium-raised">
            <div className="h-full rounded-full" style={{ width: `${(i.ligacoes / max) * 100}%`, backgroundColor: `rgb(${cor})` }} />
          </div>
        </div>
      ))}
    </>
  );
}

/** Três gráficos de colunas lado a lado: tentativas, alôs e conexões (como na versão nova do painel antigo). */
function TresGraficos({ itens, cor, sufixo }: { itens: { rotulo: string; ligacoes: number; alos: number; conexoes: number }[]; cor: string; sufixo: string }) {
  const series = [
    ["Tentativas", (x: (typeof itens)[number]) => x.ligacoes],
    ["Alôs", (x: (typeof itens)[number]) => x.alos],
    ["Conexões", (x: (typeof itens)[number]) => x.conexoes],
  ] as const;
  if (itens.length === 0) return <p className="mt-2 text-sm text-stone-500">Nenhuma ligação no período.</p>;
  return (
    <div className="mt-3 grid gap-4 lg:grid-cols-3">
      {series.map(([nome, valor]) => {
        const max = Math.max(...itens.map(valor), 1);
        const total = itens.reduce((s, x) => s + valor(x), 0);
        return (
          <div key={nome}>
            <p className="text-xs text-stone-300">
              {nome} {sufixo} <span className="text-stone-500">· {num(total)} no período</span>
            </p>
            <div className="mt-2 flex h-28 items-end gap-0.5">
              {itens.map((x) => (
                <div key={x.rotulo} className="flex h-full flex-1 items-end" title={`${x.rotulo}: ${num(valor(x))} ${nome.toLowerCase()}`}>
                  <div className="w-full rounded-t" style={{ height: `${(valor(x) / max) * 100}%`, minHeight: valor(x) > 0 ? 2 : 0, backgroundColor: `rgb(${cor})` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-0.5 text-[9px] text-stone-500">
              {itens.map((x, i) => (
                <span key={x.rotulo} className="flex-1 truncate text-center">
                  {itens.length <= 16 || i % 2 === 0 ? x.rotulo : ""}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Tabela com as colunas da versão nova do painel antigo: tentativas, alôs, taxa de alô, conexões e taxa alô → conexão. */
function TabelaFunil({
  rotulo,
  titulo,
  coluna,
  nota,
  linhas,
  seg,
}: {
  rotulo: string;
  titulo: string;
  coluna: string;
  nota?: string;
  linhas: { chave: string; nome: string; extra?: string; origem?: string | null; fraco?: boolean; ligacoes: number; alos: number; conexoes: number }[];
  seg: number;
}) {
  const comCampanha = linhas.some((l) => l.extra);
  return (
    <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <p className="text-[10px] uppercase tracking-widest text-stone-500">{rotulo}</p>
      <h2 className="font-display text-lg text-stone-100">{titulo}</h2>
      {nota && <p className="mt-0.5 text-[12px] text-stone-400">{nota}</p>}
      {linhas.length === 0 ? (
        <p className="mt-2 text-sm text-stone-500">Nenhuma ligação no período.</p>
      ) : (
        <div className="mt-2 max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-imperium-surface text-[11px] text-stone-500">
              <tr className="border-b border-imperium-line">
                <th className="py-1.5 text-left font-normal">{coluna}</th>
                {comCampanha && <th className="py-1.5 text-left font-normal">Campanha</th>}
                <th className="py-1.5 text-right font-normal">Tentativas</th>
                <th className="py-1.5 text-right font-normal">Alôs</th>
                <th className="py-1.5 text-right font-normal">Taxa de alô</th>
                <th className="py-1.5 text-right font-normal" title={`Conversas de ${seg} s ou mais`}>
                  Conexões
                </th>
                <th className="py-1.5 text-right font-normal">Taxa alô → conexão</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {linhas.map((l) => (
                <tr key={l.chave} className="border-b border-imperium-line/60">
                  <td className={`max-w-md py-1.5 ${l.fraco ? "text-stone-500" : "text-stone-100"}`}>
                    <span className="break-words">{l.nome}</span>
                    {l.origem && <span className="ml-1.5 rounded border border-sky-400/40 bg-sky-400/10 px-1 text-[10px] text-sky-300">{l.origem}</span>}
                  </td>
                  {comCampanha && <td className="py-1.5 text-stone-400">{l.extra}</td>}
                  <td className="py-1.5 text-right text-stone-300">{num(l.ligacoes)}</td>
                  <td className="py-1.5 text-right text-stone-300">{num(l.alos)}</td>
                  <td className="py-1.5 text-right text-stone-300">{pct(l.alos, l.ligacoes)}</td>
                  <td className="py-1.5 text-right font-semibold text-stone-100">{num(l.conexoes)}</td>
                  <td className="py-1.5 text-right text-stone-300">{pct(l.conexoes, l.alos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
