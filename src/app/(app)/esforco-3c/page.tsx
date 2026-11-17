import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hojeBR } from "@/lib/data-br";
import { podeVerArea } from "@/lib/permissoes-analista";
import { COOKIE_NEGOCIO, NEGOCIO_COR, buscarNegociosVisiveis, negocioEmFoco, nomeEquipe } from "@/lib/negocios";
import { TRESC_POR_NEGOCIO } from "@/lib/integracoes/config";
import { MAX_DIAS, agregar, buscarLigacoes, type PainelEsforco } from "@/lib/esforco-3c";

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
  const pode = eu.role === "diretor" || eu.role === "lider" || (eu.role === "analista" && (await podeVerArea(supabase, user.id, eu.role, "dados")));
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
  let erro: string | null = null;
  let truncado = false;
  try {
    const lido = await buscarLigacoes(atual.slug, de, ate, hoje);
    truncado = lido.truncado;
    painel = agregar(atual.slug, lido.ligacoes, de, ate, filtro, TRESC_POR_NEGOCIO[atual.slug].segundosConexao);
  } catch (e) {
    console.error("esforço 3C:", e);
    erro = "Não foi possível ler as ligações do 3C Plus agora. Tente de novo em instantes.";
  }

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

          {/* Indicadores */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi rotulo="Ligações" valor={num(painel.totais.ligacoes)} sub="discagens das campanhas" dica="Tudo o que foi discado, atendido ou não. O discador disca sem agente e só entrega a ligação quando alguém atende." />
            <Kpi rotulo="Alôs" valor={num(painel.totais.alos)} sub={`${pct(painel.totais.alos, painel.totais.ligacoes)} das ligações`} dica="Ligação atendida que chegou ao pré-vendas. Manual não atendida ou com falha não conta (mesma regra do funil)." />
            <Kpi rotulo="Conversões" valor={num(painel.totais.conversoes)} sub={`${num(painel.totais.dmc)} com o decisor (DMC)`} dica="Ligações que o pré-vendas qualificou como conversão. DMC: falou com quem decide." />
            <Kpi
              rotulo="Tempo falado (mediana | média)"
              valor={`${tempo(painel.totais.faladoMediano)} | ${tempo(painel.totais.faladoMedio)}`}
              sub={`${tempo(painel.totais.faladoTotal)} no total`}
              dica="Mediana: metade das conversas dura até esse tempo. Média: tempo total dividido pelos alôs."
            />
          </div>

          {/* Gráficos */}
          <div className="grid gap-4 lg:grid-cols-2">
            {painel.porDia.length > 1 && (
              <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
                <p className="text-[10px] uppercase tracking-widest text-stone-500">Por dia · alôs e conexões</p>
                <Colunas itens={painel.porDia.map((d) => ({ rotulo: curta(d.dia), fundo: d.alos, frente: d.conexoes }))} cor={cor} />
              </section>
            )}
            <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Melhor horário · alôs e conexões por hora</p>
              <Colunas
                itens={painel.porHora.filter((h) => h.hora >= 7 && h.hora <= 20).map((h) => ({ rotulo: `${h.hora}h`, fundo: h.alos, frente: h.conexoes }))}
                cor={cor}
              />
            </section>
          </div>

          {/* Ranking */}
          <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Ranking dos pré-vendas · por conexões</p>
            {painel.porAgente.length === 0 ? (
              <p className="mt-2 text-sm text-stone-500">Nenhum pré-vendas falou com alguém no período.</p>
            ) : (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] text-stone-500">
                    <tr className="border-b border-imperium-line">
                      <th className="py-1.5 text-left font-normal">#</th>
                      <th className="py-1.5 text-left font-normal">Pré-vendas</th>
                      <th className="py-1.5 text-right font-normal">Conexões</th>
                      <th className="py-1.5 text-right font-normal">Alôs</th>
                      <th className="py-1.5 text-right font-normal" title="Alôs que viraram conexão">Aproveitamento</th>
                      <th className="py-1.5 text-right font-normal">Conversões</th>
                      <th className="py-1.5 text-right font-normal">Tempo falado</th>
                      <th className="py-1.5 text-right font-normal" title="Metade das conversas dura até esse tempo">Mediana</th>
                      <th className="py-1.5 text-right font-normal" title="Tempo falado ÷ alôs">Média</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {painel.porAgente.map((a, i) => (
                      <tr key={a.agente} className="border-b border-imperium-line/60">
                        <td className="py-1.5 text-stone-500">{i + 1}</td>
                        <td className="py-1.5 text-stone-100">{a.agente}</td>
                        <td className="py-1.5 text-right font-semibold text-stone-100">{num(a.conexoes)}</td>
                        <td className="py-1.5 text-right text-stone-300">{num(a.alos)}</td>
                        <td className="py-1.5 text-right text-stone-300">{pct(a.conexoes, a.alos)}</td>
                        <td className="py-1.5 text-right text-stone-300">{num(a.conversoes)}</td>
                        <td className="py-1.5 text-right text-stone-300">{tempo(a.faladoTotal)}</td>
                        <td className="py-1.5 text-right text-stone-300">{tempo(a.faladoMediano)}</td>
                        <td className="py-1.5 text-right text-stone-300">{tempo(a.faladoMedio)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Campanhas e listas */}
          <Tabela
            titulo="Por campanha"
            linhas={painel.porCampanha.map((c) => ({ ...c, chave: c.campanha, nome: c.campanha }))}
            seg={seg}
          />
          <Tabela
            titulo="Por lista"
            linhas={painel.porLista.map((l) => ({ ...l, chave: l.lista, nome: l.lista, extra: l.campanha }))}
            seg={seg}
            comCampanha
          />

          {/* Discador e qualificações */}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="space-y-3 rounded-lg border border-imperium-line bg-imperium-surface p-4">
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Resultado das discagens</p>
              <Barras itens={painel.porStatus} cor={cor} vazio="Nenhuma ligação no período." />
              {painel.porMotivoFalha.length > 0 && (
                <>
                  <p className="pt-2 text-[10px] uppercase tracking-widest text-stone-500">Motivo das falhas</p>
                  <Barras itens={painel.porMotivoFalha} cor={cor} />
                </>
              )}
            </section>
            <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
              <p className="mb-2 text-[10px] uppercase tracking-widest text-stone-500">Qualificações dos pré-vendas</p>
              <Barras itens={painel.porQualificacao} cor={cor} vazio="Nenhuma ligação qualificada no período." />
            </section>
          </div>
        </>
      )}
    </main>
  );
}

function Kpi({ rotulo, valor, sub, dica }: { rotulo: string; valor: string; sub: string; dica: string }) {
  return (
    <div className="rounded-lg border border-imperium-line bg-imperium-surface p-4" title={dica}>
      <p className="text-[10px] uppercase tracking-widest text-stone-500">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold text-stone-100">{valor}</p>
      <p className="text-[11px] text-stone-500">{sub}</p>
    </div>
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

function Barras({ itens, cor, vazio }: { itens: { nome: string; ligacoes: number }[]; cor: string; vazio?: string }) {
  if (itens.length === 0) return vazio ? <p className="text-sm text-stone-500">{vazio}</p> : null;
  const max = Math.max(...itens.map((i) => i.ligacoes), 1);
  const total = itens.reduce((s, i) => s + i.ligacoes, 0);
  return (
    <ul className="space-y-1.5 text-xs">
      {itens.slice(0, 12).map((i) => (
        <li key={i.nome}>
          <div className="flex justify-between gap-2">
            <span className="truncate text-stone-300">{i.nome}</span>
            <span className="shrink-0 tabular-nums text-stone-100">
              {num(i.ligacoes)} <span className="text-stone-500">· {pct(i.ligacoes, total)}</span>
            </span>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-imperium-raised">
            <div className="h-full rounded-full" style={{ width: `${(i.ligacoes / max) * 100}%`, backgroundColor: `rgb(${cor})` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Colunas: alôs (fundo claro) e conexões (frente, na cor da B.U.). */
function Colunas({ itens, cor }: { itens: { rotulo: string; fundo: number; frente: number }[]; cor: string }) {
  const max = Math.max(...itens.map((i) => i.fundo), 1);
  return (
    <div className="mt-3">
      <div className="flex h-36 items-end gap-1">
        {itens.map((i) => (
          <div key={i.rotulo} className="relative flex h-full flex-1 items-end" title={`${i.rotulo}: ${num(i.fundo)} alôs · ${num(i.frente)} conexões`}>
            <div className="w-full rounded-t opacity-30" style={{ height: `${(i.fundo / max) * 100}%`, backgroundColor: `rgb(${cor})` }} />
            <div className="absolute bottom-0 w-full rounded-t" style={{ height: `${(i.frente / max) * 100}%`, backgroundColor: `rgb(${cor})` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-[10px] text-stone-500">
        {itens.map((i) => (
          <span key={i.rotulo} className="flex-1 truncate text-center">
            {i.rotulo}
          </span>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-stone-500">Claro: alôs · forte: conexões. Passe o mouse para ver os números.</p>
    </div>
  );
}

function Tabela({
  titulo,
  linhas,
  seg,
  comCampanha,
}: {
  titulo: string;
  linhas: { chave: string; nome: string; extra?: string; origem?: string | null; ligacoes: number; alos: number; conexoes: number; conversoes: number }[];
  seg: number;
  comCampanha?: boolean;
}) {
  return (
    <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <p className="text-[10px] uppercase tracking-widest text-stone-500">{titulo}</p>
      {linhas.length === 0 ? (
        <p className="mt-2 text-sm text-stone-500">Nenhuma ligação no período.</p>
      ) : (
        <div className="mt-2 max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-imperium-surface text-[11px] text-stone-500">
              <tr className="border-b border-imperium-line">
                <th className="py-1.5 text-left font-normal">{comCampanha ? "Lista" : "Campanha"}</th>
                {comCampanha && <th className="py-1.5 text-left font-normal">Campanha</th>}
                <th className="py-1.5 text-right font-normal">Ligações</th>
                <th className="py-1.5 text-right font-normal">Alôs</th>
                <th className="py-1.5 text-right font-normal" title="Alôs ÷ ligações">Contato</th>
                <th className="py-1.5 text-right font-normal">{seg} s ou mais</th>
                <th className="py-1.5 text-right font-normal">Conversões</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {linhas.map((l) => (
                <tr key={l.chave} className="border-b border-imperium-line/60">
                  <td className="max-w-md py-1.5 text-stone-100">
                    <span className="break-words">{l.nome}</span>
                    {l.origem && <span className="ml-1.5 rounded border border-sky-400/40 bg-sky-400/10 px-1 text-[10px] text-sky-300">{l.origem}</span>}
                  </td>
                  {comCampanha && <td className="py-1.5 text-stone-400">{l.extra}</td>}
                  <td className="py-1.5 text-right text-stone-300">{num(l.ligacoes)}</td>
                  <td className="py-1.5 text-right text-stone-300">{num(l.alos)}</td>
                  <td className="py-1.5 text-right text-stone-300">{pct(l.alos, l.ligacoes)}</td>
                  <td className="py-1.5 text-right font-semibold text-stone-100">{num(l.conexoes)}</td>
                  <td className="py-1.5 text-right text-stone-300">{num(l.conversoes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
