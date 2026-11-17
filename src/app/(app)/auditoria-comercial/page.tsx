import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeBR } from "@/lib/data-br";
import { podeVerArea } from "@/lib/permissoes-analista";
import { COOKIE_NEGOCIO, NEGOCIO_COR, buscarNegociosVisiveis, negocioEmFoco, nomeEquipe } from "@/lib/negocios";
import { CRM_POR_NEGOCIO } from "@/lib/integracoes/config";
import type { AuditoriaGravada, LeadAuditoria, SituacaoReuniao } from "@/lib/integracoes/auditoria";

export const dynamic = "force-dynamic";

// Auditoria comercial (Dados → Auditoria): Reuniões, Pós-reunião (closer) e Movimentações do mês, com a
// ficha de cada lead (linha do tempo). A base é a mesma do Dashboard (gravada pela sincronização), então
// as contagens batem com o funil e o ranking. Só Diretor, Líder e Analista com acesso a Dados.

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const CANAL: Record<string, string> = { outbound: "Outbound", inbound: "Inbound", indicacao: "Indicação" };
const SITUACAO: Record<SituacaoReuniao, { texto: string; classe: string }> = {
  a_acontecer: { texto: "A acontecer", classe: "border-gold/50 text-gold-bright" },
  realizada: { texto: "Realizada", classe: "border-success/50 text-success-bright" },
  no_show: { texto: "No-show", classe: "border-wine/60 text-wine-bright" },
  cancelada: { texto: "Cancelada", classe: "border-imperium-line text-stone-400" },
};
const TIPO_MOV = { agendada: "Reunião agendada", realizada: "Reunião realizada", venda: "Venda" } as const;
type TipoMov = keyof typeof TIPO_MOV;

const dataBR = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : null);
const dia = (iso: string | null) => {
  const d = dataBR(iso);
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "—";
};
const diaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const legivel = (v: string | null) => (v ? v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : null);
/** Data da reunião marcada: "2026-11-11T10:00" é Brasília; com Z, converte. */
const reuniaoBR = (v: string | null) => {
  if (!v) return null;
  const iso = /Z$|[+-]\d{2}:?\d{2}$/.test(v) ? v : `${v.length === 16 ? `${v}:00` : v}-03:00`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

type Filtros = { pv: string; closer: string; canal: string; q: string };
type Params = {
  negocio?: string;
  mes?: string;
  aba?: string;
  pv?: string;
  closer?: string;
  canal?: string;
  q?: string;
  base?: string;
  situacao?: string;
  modo?: string;
  tipo?: string;
  temp?: string;
  lead?: string;
};

function passaFiltros(l: LeadAuditoria, f: Filtros, campoPessoa: "preVendas" | "vendedor" = "preVendas") {
  if (f.pv && (campoPessoa === "vendedor" ? l.vendedor : l.preVendas) !== f.pv && l.preVendas !== f.pv) return false;
  if (f.closer && l.closer !== f.closer && l.responsavel !== f.closer) return false;
  if (f.canal && l.canal !== f.canal) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const alvo = [l.nome, l.empresa ?? "", ...l.tags, String(l.seq ?? "")].join(" ").toLowerCase();
    if (!alvo.includes(q)) return false;
  }
  return true;
}

export default async function AuditoriaComercialPage({ searchParams }: { searchParams: Params }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: eu } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!eu) redirect("/");
  const pode = eu.role === "diretor" || eu.role === "lider" || (eu.role === "analista" && (await podeVerArea(supabase, user.id, eu.role, "dados")));
  if (!pode) redirect("/");

  const visiveis = (await buscarNegociosVisiveis(supabase, user.id, eu.role)).filter((n) => n.status === "ativo" && CRM_POR_NEGOCIO[n.slug] && !CRM_POR_NEGOCIO[n.slug].funilUnico);
  if (visiveis.length === 0) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="font-display text-xl text-gold-bright">Auditoria</h1>
        <p className="mt-2 text-sm text-stone-400">Nenhum negócio seu está ligado ao Pipefácil.</p>
      </main>
    );
  }
  const atual = negocioEmFoco(searchParams.negocio ?? cookies().get(COOKIE_NEGOCIO)?.value, visiveis) ?? visiveis[0];
  const cor = NEGOCIO_COR[atual.slug] ?? "201 162 74";
  const hoje = hojeBR();
  const mesParam = /^\d{4}-\d{2}$/.test(searchParams.mes ?? "") ? searchParams.mes! : hoje.slice(0, 7);
  const [ano, mes] = mesParam.split("-").map(Number);
  const ant = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
  const seg = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
  const aba = searchParams.aba === "closer" || searchParams.aba === "movimentacoes" ? searchParams.aba : "reunioes";
  const f: Filtros = { pv: searchParams.pv ?? "", closer: searchParams.closer ?? "", canal: searchParams.canal ?? "", q: (searchParams.q ?? "").trim() };

  const { data: est } = await createAdminClient().from("integracao_estado").select("valor").eq("chave", `auditoria:${atual.slug}`).maybeSingle();
  const base = (est?.valor as AuditoriaGravada | null) ?? null;
  const todos = base?.leads ?? [];
  const noMes = (iso: string | null) => dataBR(iso)?.slice(0, 7) === mesParam;

  // Opções dos filtros (de toda a base, para não sumirem ao filtrar).
  const preVendas = Array.from(new Set(todos.map((l) => l.preVendas).filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const closers = Array.from(new Set(todos.flatMap((l) => [l.closer, l.responsavel]).filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const canais = Array.from(new Set(todos.map((l) => l.canal)));

  const href = (mudar: Partial<Params>) => {
    const p = new URLSearchParams();
    const tudo: Params = { negocio: atual.slug, mes: mesParam, aba, pv: f.pv, closer: f.closer, canal: f.canal, q: f.q, base: searchParams.base, situacao: searchParams.situacao, modo: searchParams.modo, tipo: searchParams.tipo, temp: searchParams.temp, ...mudar };
    for (const [k, v] of Object.entries(tudo)) if (v) p.set(k, v);
    return `/auditoria-comercial?${p}`;
  };
  const lead = searchParams.lead ? todos.find((l) => String(l.seq) === searchParams.lead || l.id === searchParams.lead) : undefined;

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Auditoria comercial</h1>
          <p className="mt-1 text-sm text-stone-400">
            {nomeEquipe(atual)} · {MESES[mes]} de {ano} · Pipefácil
            {base ? ` · atualizado ${diaHora(base.atualizado_em)}` : " · aguardando a primeira sincronização"}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={href({ mes: ant, lead: undefined })} className="rounded border border-imperium-line px-3 py-1 text-stone-300 hover:text-stone-100">
            ← {MESES[mes === 1 ? 12 : mes - 1]}
          </Link>
          <Link href={href({ mes: seg, lead: undefined })} className="rounded border border-imperium-line px-3 py-1 text-stone-300 hover:text-stone-100">
            {MESES[mes === 12 ? 1 : mes + 1]} →
          </Link>
        </div>
      </div>

      {visiveis.length > 1 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {visiveis.map((n) => (
            <Link
              key={n.id}
              href={`/auditoria-comercial?negocio=${n.slug}&mes=${mesParam}&aba=${aba}`}
              className={`rounded border px-3 py-1 ${n.id === atual.id ? "border-gold text-stone-100" : "border-imperium-line text-stone-400 hover:text-stone-100"}`}
            >
              {nomeEquipe(n)}
            </Link>
          ))}
        </div>
      )}

      {/* Abas */}
      <div className="flex flex-wrap gap-1 border-b border-imperium-line">
        {(
          [
            ["reunioes", "Reuniões"],
            ["closer", "Pós-reunião (closer)"],
            ["movimentacoes", "Movimentações"],
          ] as const
        ).map(([k, rotulo]) => (
          <Link
            key={k}
            href={href({ aba: k, lead: undefined })}
            className={`-mb-px rounded-t-md border px-4 py-2 text-sm ${aba === k ? "border-imperium-line border-b-imperium-surface bg-imperium-surface font-semibold text-stone-100" : "border-transparent text-stone-400 hover:text-stone-200"}`}
          >
            {rotulo}
          </Link>
        ))}
      </div>

      {/* Filtros em comum */}
      <form method="get" className="flex flex-wrap items-end gap-3 rounded-lg border border-imperium-line bg-imperium-surface p-3 text-sm">
        <input type="hidden" name="negocio" value={atual.slug} />
        <input type="hidden" name="mes" value={mesParam} />
        <input type="hidden" name="aba" value={aba} />
        {searchParams.base && <input type="hidden" name="base" value={searchParams.base} />}
        {searchParams.modo && <input type="hidden" name="modo" value={searchParams.modo} />}
        {searchParams.tipo && <input type="hidden" name="tipo" value={searchParams.tipo} />}
        <Campo rotulo="Pré-vendas">
          <select name="pv" defaultValue={f.pv} className="rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-stone-200">
            <option value="">Todos</option>
            {preVendas.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Closer">
          <select name="closer" defaultValue={f.closer} className="rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-stone-200">
            <option value="">Todos</option>
            {closers.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Canal">
          <select name="canal" defaultValue={f.canal} className="rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-stone-200">
            <option value="">Todos</option>
            {canais.map((x) => (
              <option key={x} value={x}>
                {CANAL[x] ?? x}
              </option>
            ))}
          </select>
        </Campo>
        {aba === "reunioes" && (
          <Campo rotulo="Situação">
            <select name="situacao" defaultValue={searchParams.situacao ?? ""} className="rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-stone-200">
              <option value="">Todas</option>
              {Object.entries(SITUACAO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.texto}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {aba === "closer" && (
          <Campo rotulo="Temperatura">
            <select name="temp" defaultValue={searchParams.temp ?? ""} className="rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-stone-200">
              <option value="">Todas</option>
              <option value="quente">Quente</option>
              <option value="morno">Morno</option>
              <option value="frio">Frio</option>
              <option value="sem">Sem temperatura</option>
            </select>
          </Campo>
        )}
        <Campo rotulo="Buscar">
          <input
            name="q"
            defaultValue={f.q}
            placeholder="Lead, empresa, tag ou nº"
            className="w-56 rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-stone-200 placeholder:text-stone-600"
          />
        </Campo>
        <button type="submit" className="rounded border border-gold/60 px-3 py-1 text-gold-bright hover:bg-gold/10">
          Filtrar
        </button>
        {(f.pv || f.closer || f.canal || f.q || searchParams.situacao || searchParams.temp) && (
          <Link href={`/auditoria-comercial?negocio=${atual.slug}&mes=${mesParam}&aba=${aba}`} className="px-2 py-1 text-stone-400 hover:text-stone-200">
            Limpar filtros
          </Link>
        )}
      </form>

      {!base ? (
        <p className="text-sm text-stone-500">A base da auditoria é montada pela sincronização. Use &quot;Atualizar agora&quot; no Dashboard do Negócio ou aguarde a próxima.</p>
      ) : aba === "reunioes" ? (
        <AbaReunioes todos={todos} f={f} noMes={noMes} mesParam={mesParam} sp={searchParams} href={href} />
      ) : aba === "closer" ? (
        <AbaCloser todos={todos} f={f} noMes={noMes} sp={searchParams} href={href} />
      ) : (
        <AbaMovimentacoes todos={todos} f={f} noMes={noMes} sp={searchParams} href={href} />
      )}

      {lead && <FichaLead l={lead} cor={cor} fechar={href({ lead: undefined })} />}
    </main>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-stone-500">{rotulo}</span>
      {children}
    </label>
  );
}

function Kpis({ itens }: { itens: { rotulo: string; valor: string; sub?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {itens.map((k) => (
        <div key={k.rotulo} className="rounded-lg border border-imperium-line bg-imperium-surface p-3">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">{k.rotulo}</p>
          <p className="mt-0.5 text-xl font-semibold text-stone-100">{k.valor}</p>
          {k.sub && <p className="text-[11px] text-stone-500">{k.sub}</p>}
        </div>
      ))}
    </div>
  );
}

function Segmentos({ opcoes }: { opcoes: { rotulo: string; href: string; ativo: boolean; contagem?: number }[] }) {
  return (
    <span className="inline-flex flex-wrap rounded-lg border border-imperium-line bg-imperium-raised p-0.5 text-xs">
      {opcoes.map((o) => (
        <Link
          key={o.rotulo}
          href={o.href}
          scroll={false}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 ${o.ativo ? "bg-imperium-surface font-semibold text-stone-100 shadow" : "text-stone-400 hover:text-stone-200"}`}
        >
          {o.rotulo}
          {o.contagem !== undefined && <span className="rounded-full bg-imperium-line/60 px-1.5 text-stone-300 tabular-nums">{o.contagem}</span>}
        </Link>
      ))}
    </span>
  );
}

/** Contagem por pessoa (atalho para filtrar). */
function PorPessoa({ titulo, itens, href }: { titulo: string; itens: [string, number][]; href: (nome: string) => string }) {
  if (itens.length === 0) return null;
  return (
    <p className="text-xs text-stone-400">
      <span className="text-stone-500">{titulo}: </span>
      {itens.map(([nome, n], i) => (
        <span key={nome}>
          {i > 0 && " · "}
          <Link href={href(nome)} className="hover:text-gold-bright">
            {nome} <span className="text-stone-100">{n}</span>
          </Link>
        </span>
      ))}
    </p>
  );
}

const contarPor = (lista: LeadAuditoria[], campo: (l: LeadAuditoria) => string | null): [string, number][] => {
  const m = new Map<string, number>();
  for (const l of lista) {
    const k = campo(l) ?? "Sem responsável";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
};

function LinkLead({ l, href }: { l: LeadAuditoria; href: (m: Partial<Params>) => string }) {
  return (
    <Link href={href({ lead: String(l.seq ?? l.id) })} scroll={false} className="font-medium text-stone-100 hover:text-gold-bright">
      {l.nome}
    </Link>
  );
}

const Bant = ({ l }: { l: LeadAuditoria }) => (
  <span className="whitespace-nowrap text-[11px]">
    {(
      [
        ["B", l.faturamento],
        ["A", l.cargo],
        ["N", l.necessidade],
        ["T", l.timing],
      ] as const
    ).map(([k, v]) => (
      <span key={k} title={v ? `${k}: ${legivel(v)}` : `${k}: não preenchido`} className={`mr-1 ${v ? "text-success-bright" : "text-stone-600"}`}>
        {k}
      </span>
    ))}
  </span>
);

const thClasse = "px-2 py-2 text-left text-[10px] font-normal uppercase tracking-widest text-stone-500";
const tdClasse = "px-2 py-2 align-top";

// ------------------------------------------------------------ Reuniões
function AbaReunioes({
  todos,
  f,
  noMes,
  mesParam,
  sp,
  href,
}: {
  todos: LeadAuditoria[];
  f: Filtros;
  noMes: (iso: string | null) => boolean;
  mesParam: string;
  sp: Params;
  href: (m: Partial<Params>) => string;
}) {
  const pelaReuniao = sp.base === "reuniao";
  // Pela data do agendamento: agendadas no mês. Pela data da reunião: realizadas no mês e, as que não
  // realizaram, pela data marcada (sem ela, o agendamento).
  const doMes = todos.filter((l) =>
    pelaReuniao ? (l.realizadaEm ? noMes(l.realizadaEm) : dataBR(reuniaoBR(l.reuniaoMarcada) ?? l.agendadaEm)?.slice(0, 7) === mesParam) : noMes(l.agendadaEm),
  );
  const filtrados = doMes.filter((l) => passaFiltros(l, f));
  const lista = sp.situacao ? filtrados.filter((l) => l.situacao === sp.situacao) : filtrados;
  const n = (s: SituacaoReuniao) => filtrados.filter((l) => l.situacao === s).length;
  const realizadas = n("realizada");
  const noShow = n("no_show");
  const semFat = filtrados.filter((l) => !l.faturamento).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-stone-500">Contar pela data</span>
        <Segmentos
          opcoes={[
            { rotulo: "do agendamento", href: href({ base: undefined, lead: undefined }), ativo: !pelaReuniao },
            { rotulo: "da reunião", href: href({ base: "reuniao", lead: undefined }), ativo: pelaReuniao },
          ]}
        />
      </div>
      <Kpis
        itens={[
          { rotulo: "Reuniões", valor: String(filtrados.length), sub: pelaReuniao ? "pela data da reunião" : "agendadas no mês" },
          { rotulo: "A acontecer", valor: String(n("a_acontecer")), sub: "ainda agendadas" },
          { rotulo: "Realizadas", valor: String(realizadas) },
          { rotulo: "No-show", valor: String(noShow), sub: n("cancelada") ? `+ ${n("cancelada")} canceladas` : "nenhuma cancelada" },
          { rotulo: "Comparecimento", valor: realizadas + noShow > 0 ? `${Math.round((realizadas / (realizadas + noShow)) * 100)}%` : "—", sub: "realizadas ÷ (realizadas + no-show)" },
          { rotulo: "Sem faturamento", valor: String(semFat), sub: semFat ? "preencher no Pipefácil" : "todas preenchidas" },
        ]}
      />
      <PorPessoa titulo="Por pré-vendas" itens={contarPor(filtrados, (l) => l.preVendas)} href={(nome) => href({ pv: nome, lead: undefined })} />
      <div className="overflow-x-auto rounded-lg border border-imperium-line bg-imperium-surface">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="border-b border-imperium-line">
            <tr>
              <th className={thClasse}>Lead</th>
              <th className={thClasse}>Pré-vendas</th>
              <th className={thClasse}>Canal</th>
              <th className={thClasse}>Agendada em</th>
              <th className={thClasse}>Situação</th>
              <th className={thClasse}>Reunião marcada</th>
              <th className={thClasse}>Realizada em</th>
              <th className={thClasse}>Closer</th>
              <th className={thClasse} title="Faturamento, Cargo, Necessidade, Timing (verde = preenchido)">
                BANT
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-imperium-line/60">
            {lista.map((l) => (
              <tr key={l.id} className="hover:bg-imperium-raised/40">
                <td className={tdClasse}>
                  <LinkLead l={l} href={href} />
                  <p className="text-[11px] text-stone-500">
                    #{l.seq} · {l.etapa}
                  </p>
                </td>
                <td className={tdClasse}>{l.preVendas ?? "—"}</td>
                <td className={tdClasse}>
                  {CANAL[l.canal] ?? l.canal}
                  {l.tags.length > 0 && <p className="text-[11px] text-stone-500">{l.tags.slice(0, 3).join(", ")}</p>}
                </td>
                <td className={tdClasse}>{diaHora(l.agendadaEm)}</td>
                <td className={tdClasse}>
                  <span className={`rounded border px-1.5 py-0.5 text-[11px] ${SITUACAO[l.situacao].classe}`}>{SITUACAO[l.situacao].texto}</span>
                  {l.situacao === "no_show" && <p className="mt-0.5 text-[11px] text-stone-500">no-show em {dia(l.noShowEm)}</p>}
                </td>
                <td className={tdClasse}>{l.reuniaoMarcada ? diaHora(reuniaoBR(l.reuniaoMarcada)) : <span className="text-stone-600">—</span>}</td>
                <td className={tdClasse}>{l.realizadaEm ? diaHora(l.realizadaEm) : <span className="text-stone-600">—</span>}</td>
                <td className={tdClasse}>{l.closer ?? "—"}</td>
                <td className={tdClasse}>
                  <Bant l={l} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.length === 0 && <p className="p-4 text-sm text-stone-500">Nenhuma reunião com esses filtros.</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Pós-reunião (closer)
function AbaCloser({ todos, f, noMes, sp, href }: { todos: LeadAuditoria[]; f: Filtros; noMes: (iso: string | null) => boolean; sp: Params; href: (m: Partial<Params>) => string }) {
  const emAberto = sp.modo === "aberto";
  const base = todos.filter((l) => l.realizadaEm && (emAberto ? l.status === "open" : noMes(l.realizadaEm)));
  const filtrados = base.filter((l) => passaFiltros(l, f));
  const temp = (l: LeadAuditoria) => {
    const t = (l.temperatura ?? "").toLowerCase();
    return ["quente", "morno", "frio"].includes(t) ? t : "sem";
  };
  const lista = sp.temp ? filtrados.filter((l) => temp(l) === sp.temp) : filtrados;
  const ganhos = filtrados.filter((l) => l.status === "won");
  const perdidos = filtrados.filter((l) => l.status === "lost");
  const comRqa = filtrados.filter((l) => l.rqa);
  const abertos = filtrados.filter((l) => l.status === "open");
  const follow = (t: string) => abertos.filter((l) => temp(l) === t);
  const soma = (ls: LeadAuditoria[]) => ls.reduce((s, l) => s + l.valor, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-stone-500">Reuniões realizadas</span>
        <Segmentos
          opcoes={[
            { rotulo: "no mês", href: href({ modo: undefined, lead: undefined }), ativo: !emAberto },
            { rotulo: "em aberto (qualquer mês)", href: href({ modo: "aberto", lead: undefined }), ativo: emAberto },
          ]}
        />
      </div>
      <Kpis
        itens={[
          { rotulo: "Reuniões realizadas", valor: String(filtrados.length), sub: emAberto ? "em aberto, de qualquer mês" : "no mês" },
          { rotulo: "RQA validada", valor: String(comRqa.filter((l) => /^(sim|true)$/i.test(l.rqa ?? "")).length), sub: `${comRqa.length} preenchidas pelo closer` },
          { rotulo: "Ganhos", valor: moeda(soma(ganhos)), sub: `${ganhos.length} ${ganhos.length === 1 ? "venda" : "vendas"}` },
          { rotulo: "Perdidos", valor: String(perdidos.length) },
          { rotulo: "Follow quente", valor: moeda(soma(follow("quente"))), sub: `${follow("quente").length} leads` },
          { rotulo: "Follow morno / frio", valor: moeda(soma(follow("morno")) + soma(follow("frio"))), sub: `${follow("morno").length} mornos · ${follow("frio").length} frios · ${follow("sem").length} sem temperatura` },
        ]}
      />
      <PorPessoa titulo="Por closer" itens={contarPor(filtrados, (l) => l.closer ?? l.responsavel)} href={(nome) => href({ closer: nome, lead: undefined })} />
      <div className="overflow-x-auto rounded-lg border border-imperium-line bg-imperium-surface">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="border-b border-imperium-line">
            <tr>
              <th className={thClasse}>Lead</th>
              <th className={thClasse}>Realizada</th>
              <th className={thClasse}>Canal</th>
              <th className={thClasse}>Pré-vendas</th>
              <th className={thClasse}>Closer</th>
              <th className={thClasse}>BANT</th>
              <th className={thClasse}>RQA</th>
              <th className={thClasse}>Etapa</th>
              <th className={thClasse}>Temperatura</th>
              <th className={`${thClasse} text-right`}>Valor</th>
              <th className={thClasse}>Produto</th>
              <th className={thClasse}>Previsão</th>
              <th className={thClasse}>Venda / perda</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-imperium-line/60">
            {lista.map((l) => (
              <tr key={l.id} className="hover:bg-imperium-raised/40">
                <td className={tdClasse}>
                  <LinkLead l={l} href={href} />
                  <p className="text-[11px] text-stone-500">#{l.seq}</p>
                </td>
                <td className={tdClasse}>{dia(l.realizadaEm)}</td>
                <td className={tdClasse}>{CANAL[l.canal] ?? l.canal}</td>
                <td className={tdClasse}>{l.preVendas ?? "—"}</td>
                <td className={tdClasse}>{l.closer ?? l.responsavel ?? "—"}</td>
                <td className={tdClasse}>
                  <Bant l={l} />
                </td>
                <td className={tdClasse}>{legivel(l.rqa) ?? <span className="text-stone-600">—</span>}</td>
                <td className={tdClasse}>{l.etapa}</td>
                <td className={tdClasse}>{legivel(l.temperatura) ?? <span className="text-stone-600">—</span>}</td>
                <td className={`${tdClasse} text-right tabular-nums`}>
                  {l.valor ? moeda(l.valor) : "—"}
                  {l.mrr ? <p className="text-[11px] text-stone-500">MRR {moeda(l.mrr)}</p> : null}
                </td>
                <td className={tdClasse}>{legivel(l.produtos) ?? <span className="text-stone-600">—</span>}</td>
                <td className={tdClasse}>{l.previsao ? dia(l.previsao) : <span className="text-stone-600">—</span>}</td>
                <td className={tdClasse}>
                  {l.status === "won" ? (
                    <span className="text-success-bright">Venda {dia(l.vendaEm)}</span>
                  ) : l.status === "lost" ? (
                    <span className="text-wine-bright">{l.motivoPerda ?? "Perdido"}</span>
                  ) : (
                    <span className="text-stone-500">em aberto</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.length === 0 && <p className="p-4 text-sm text-stone-500">Nenhuma reunião realizada com esses filtros.</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Movimentações
function AbaMovimentacoes({
  todos,
  f,
  noMes,
  sp,
  href,
}: {
  todos: LeadAuditoria[];
  f: Filtros;
  noMes: (iso: string | null) => boolean;
  sp: Params;
  href: (m: Partial<Params>) => string;
}) {
  type Mov = { tipo: TipoMov; quando: string; l: LeadAuditoria; quem: string | null };
  const movs: Mov[] = [];
  for (const l of todos) {
    if (!passaFiltros(l, f)) continue;
    if (noMes(l.agendadaEm)) movs.push({ tipo: "agendada", quando: l.agendadaEm!, l, quem: l.preVendas });
    if (noMes(l.realizadaEm)) movs.push({ tipo: "realizada", quando: l.realizadaEm!, l, quem: l.preVendas });
    if (noMes(l.vendaEm)) movs.push({ tipo: "venda", quando: l.vendaEm!, l, quem: l.vendedor ?? l.responsavel });
  }
  movs.sort((a, b) => b.quando.localeCompare(a.quando));
  const tipo = sp.tipo && sp.tipo in TIPO_MOV ? (sp.tipo as TipoMov) : null;
  const lista = tipo ? movs.filter((m) => m.tipo === tipo) : movs;
  const n = (t: TipoMov) => movs.filter((m) => m.tipo === t).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmentos
          opcoes={[
            { rotulo: "Todas", href: href({ tipo: undefined, lead: undefined }), ativo: !tipo, contagem: movs.length },
            { rotulo: "Agendadas", href: href({ tipo: "agendada", lead: undefined }), ativo: tipo === "agendada", contagem: n("agendada") },
            { rotulo: "Realizadas", href: href({ tipo: "realizada", lead: undefined }), ativo: tipo === "realizada", contagem: n("realizada") },
            { rotulo: "Vendas", href: href({ tipo: "venda", lead: undefined }), ativo: tipo === "venda", contagem: n("venda") },
          ]}
        />
        <span className="text-[11px] text-stone-500">Cada agendamento, reunião realizada e venda que conta no mês (os mesmos números do Dashboard), com a data e a hora do Pipefácil.</span>
      </div>
      <PorPessoa
        titulo={tipo === "venda" ? "Por quem vendeu" : "Por pré-vendas"}
        itens={contarPor(
          lista.map((m) => ({ ...m.l, preVendas: m.quem })),
          (l) => l.preVendas,
        )}
        href={(nome) => href({ pv: nome, lead: undefined })}
      />
      <div className="overflow-x-auto rounded-lg border border-imperium-line bg-imperium-surface">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-imperium-line">
            <tr>
              <th className={thClasse}>Quando</th>
              <th className={thClasse}>Movimentação</th>
              <th className={thClasse}>Lead</th>
              <th className={thClasse}>De quem</th>
              <th className={thClasse}>Canal / origem</th>
              <th className={`${thClasse} text-right`}>Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-imperium-line/60">
            {lista.map((m) => (
              <tr key={`${m.tipo}-${m.l.id}`} className="hover:bg-imperium-raised/40">
                <td className={`${tdClasse} whitespace-nowrap text-stone-400`}>{diaHora(m.quando)}</td>
                <td className={tdClasse}>
                  <span className={`rounded border px-1.5 py-0.5 text-[11px] ${m.tipo === "venda" ? "border-success/50 text-success-bright" : "border-imperium-line text-stone-300"}`}>{TIPO_MOV[m.tipo]}</span>
                </td>
                <td className={tdClasse}>
                  <LinkLead l={m.l} href={href} /> <span className="text-[11px] text-stone-500">#{m.l.seq}</span>
                </td>
                <td className={tdClasse}>{m.quem ?? "—"}</td>
                <td className={`${tdClasse} text-stone-400`}>
                  {CANAL[m.l.canal] ?? m.l.canal}
                  {m.tipo === "venda" && m.l.preVendas ? <p className="text-[11px]">pré-vendas de origem: {m.l.preVendas}</p> : null}
                </td>
                <td className={`${tdClasse} text-right tabular-nums`}>{m.tipo === "venda" ? moeda(m.l.valor) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {lista.length === 0 && <p className="p-4 text-sm text-stone-500">Nenhuma movimentação com esses filtros.</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ Ficha do lead
function FichaLead({ l, cor, fechar }: { l: LeadAuditoria; cor: string; fechar: string }) {
  const linha = (rotulo: string, valor: React.ReactNode) => (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-stone-500">{rotulo}</dt>
      <dd className="text-sm text-stone-200">{valor ?? <span className="text-stone-600">—</span>}</dd>
    </div>
  );
  const marcos: [string, string | null][] = [
    ["Agendou", l.agendadaEm],
    ["No-show", l.noShowEm],
    ["Realizou", l.realizadaEm],
    ["Proposta", l.propostaEm],
    ["Venda", l.vendaEm],
    ["Perda", l.perdidaEm],
  ];
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-label={`Ficha de ${l.nome}`}>
      <Link href={fechar} scroll={false} className="absolute inset-0" aria-label="Fechar" />
      <aside className="relative h-full w-full max-w-xl overflow-y-auto border-l border-imperium-line bg-imperium-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-stone-500">
              Lead #{l.seq} · {CANAL[l.canal] ?? l.canal}
            </p>
            <h2 className="mt-1 text-xl font-semibold" style={{ color: `rgb(${cor})` }}>
              {l.nome}
            </h2>
            <p className="text-sm text-stone-400">
              {l.funil} · {l.etapa} · {l.status === "won" ? "ganho" : l.status === "lost" ? `perdido${l.motivoPerda ? ` (${l.motivoPerda})` : ""}` : "aberto"}
            </p>
          </div>
          <Link href={fechar} scroll={false} className="rounded border border-imperium-line px-2 py-1 text-sm text-stone-300 hover:text-stone-100">
            Fechar
          </Link>
        </div>

        {/* Marcos que contam no Dashboard */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {marcos.map(([rotulo, iso]) => (
            <div key={rotulo} className={`rounded-md border px-2 py-1.5 ${iso ? "border-imperium-line bg-imperium-raised" : "border-dashed border-imperium-line/60"}`}>
              <p className="text-[10px] uppercase tracking-widest text-stone-500">{rotulo}</p>
              <p className={`text-sm ${iso ? "text-stone-100" : "text-stone-600"}`}>{iso ? diaHora(iso) : "—"}</p>
            </div>
          ))}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
          {linha("Pré-vendas (agendou)", l.preVendas)}
          {linha("Responsável hoje", l.responsavel)}
          {linha("Closer", l.closer)}
          {linha("Vendeu", l.vendaEm ? l.vendedor : null)}
          {linha("Reunião marcada", l.reuniaoMarcada ? diaHora(reuniaoBR(l.reuniaoMarcada)) : null)}
          {linha("Situação da reunião", SITUACAO[l.situacao].texto)}
          {linha("Faturamento", legivel(l.faturamento))}
          {linha("Cargo", legivel(l.cargo))}
          {linha("Necessidade", l.necessidade)}
          {linha("Timing", legivel(l.timing))}
          {linha("RQA", legivel(l.rqa))}
          {linha("Temperatura", legivel(l.temperatura))}
          {linha("Valor", l.valor ? moeda(l.valor) : null)}
          {linha("MRR", l.mrr ? moeda(l.mrr) : null)}
          {linha("Produto", legivel(l.produtos))}
          {linha("Previsão de fechamento", l.previsao ? dia(l.previsao) : null)}
        </dl>
        {l.tags.length > 0 && <p className="mt-3 text-xs text-stone-500">Tags: {l.tags.join(", ")}</p>}

        {/* Linha do tempo: cada mudança de etapa, com quem era o responsável */}
        <p className="mt-6 text-[10px] uppercase tracking-widest text-stone-500">Caminho do lead</p>
        <ol className="mt-2 space-y-0">
          {l.passos.map((p, i) => (
            <li key={i} className="relative flex gap-3 pb-3 pl-4">
              <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full" style={{ background: `rgb(${cor})` }} />
              {i < l.passos.length - 1 && <span className="absolute left-[3px] top-3.5 h-full w-px bg-imperium-line" />}
              <div className="min-w-0">
                <p className="text-sm text-stone-100">
                  {p.etapa} <span className="text-[11px] text-stone-500">· {p.funil}</span>
                </p>
                <p className="text-[11px] text-stone-500">
                  {diaHora(p.em)}
                  {p.quem ? ` · com ${p.quem}` : ""}
                  {p.tipo === "DEAL_CREATED" ? " · lead criado" : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
        {l.passos.length === 0 && <p className="text-sm text-stone-500">Sem histórico de etapas.</p>}
      </aside>
    </div>
  );
}
