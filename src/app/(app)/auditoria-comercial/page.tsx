import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeBR } from "@/lib/data-br";
import { podeVerArea } from "@/lib/permissoes-analista";
import { vinculoCloser } from "@/lib/closer-negocio";
import { FiltroMultiplo } from "@/components/negocio/FiltroMultiplo";
import { pagamentoDoMes, resumirRqa, situacaoDaRqa, bantPreenchidos, type SituacaoRqa, type ValidacaoGerente } from "@/lib/rqa";
import { podeValidarRqa, salvarValidacaoRqa } from "./actions";
import { COOKIE_NEGOCIO, NEGOCIO_COR, buscarNegociosVisiveis, negocioEmFoco, nomeEquipe } from "@/lib/negocios";
import { CRM_POR_NEGOCIO } from "@/lib/integracoes/config";
import type { AuditoriaGravada, LeadAuditoria, SituacaoReuniao } from "@/lib/integracoes/auditoria";

export const dynamic = "force-dynamic";

// Auditoria comercial (Dados → Auditoria): Reuniões, Pós-reunião (closer) e Leads do período, com a
// ficha de cada lead (linha do tempo). A base é a mesma do Dashboard (gravada pela sincronização), então
// as contagens batem com o funil e o ranking. Só Diretor, Líder e Analista com acesso a Dados.

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const CANAL: Record<string, string> = { outbound: "Outbound", inbound: "Tráfego Pago", indicacao: "Referidos", eventos: "Eventos", alternativo: "Canais alternativos" };
const SITUACAO: Record<SituacaoReuniao, { texto: string; classe: string }> = {
  a_acontecer: { texto: "A acontecer", classe: "border-gold/50 text-gold-bright" },
  realizada: { texto: "Realizada", classe: "border-success/50 text-success-bright" },
  no_show: { texto: "No-show", classe: "border-wine/60 text-wine-bright" },
  cancelada: { texto: "Cancelada", classe: "border-imperium-line text-stone-400" },
  sem_reuniao: { texto: "Sem reunião", classe: "border-imperium-line text-stone-500" },
};

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
  /** RQA: situação da RQA, validação do gerente (aprovada, reprovada, sem) e BANT (completo, incompleto). */
  sitR?: string;
  ger?: string;
  bant?: string;
  /** Pós-reunião: etapas atuais (uma ou mais), RQA (sim, nao, sem) e mês da previsão de fechamento (AAAA-MM ou "sem"). */
  etapa?: string | string[];
  rqa?: string;
  prev?: string;
  /** Reuniões: faturamento (valor do CRM) e dia da reunião (AAAA-MM-DD). */
  fat?: string;
  diaR?: string;
  temp?: string;
  /** Visão da lista do Inbound: todos, mql ou nao_mql. */
  vq?: string;
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
  // Closer da Acrópole (Vorp) também vê, só com os dados do Vorp (pelos vínculos dele).
  const closerVorp = !!(await vinculoCloser(supabase, user.id));
  const pode = eu.role === "diretor" || eu.role === "lider" || closerVorp || (eu.role === "analista" && (await podeVerArea(supabase, user.id, eu.role, "dados")));
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
  // RQA: só nos negócios com critério de RQA (Acrópole) e só para a gestão (o closer não vê; 18/11/2026).
  const cfgRqa = CRM_POR_NEGOCIO[atual.slug]?.rqa;
  const veRqa = !!cfgRqa && (eu.role === "diretor" || eu.role === "lider" || eu.role === "analista");
  const temEventos = Object.values(CRM_POR_NEGOCIO[atual.slug]?.canais ?? {}).includes("eventos");
  const ABAS = ["closer", "leads_outbound", "leads_inbound", ...(temEventos ? ["leads_eventos"] : []), ...(veRqa ? ["rqa"] : [])];
  const aba = ABAS.includes(searchParams.aba ?? "") ? searchParams.aba! : "reunioes";
  const f: Filtros = { pv: searchParams.pv ?? "", closer: searchParams.closer ?? "", canal: searchParams.canal ?? "", q: (searchParams.q ?? "").trim() };

  const { data: est } = await createAdminClient().from("integracao_estado").select("valor").eq("chave", `auditoria:${atual.slug}`).maybeSingle();
  const base = (est?.valor as AuditoriaGravada | null) ?? null;
  // A base tem também os leads do Inbound que só entraram ou conectaram (para "Leads Inbound do período");
  // as demais sub-abas olham só quem chegou a Reunião Agendada.
  const baseToda = base?.leads ?? [];
  // Validações do gerente (Auditoria → RQA): lidas pelo servidor; sem a tabela (migration 0118 ainda não
  // aplicada), a página mostra a RQA do closer e avisa.
  const gerenteRqa = new Map<string, ValidacaoGerente>();
  let rqaIndisponivel = false;
  let podeValidar = false;
  let nomesPerfis: Record<string, string> = {};
  if (aba === "rqa" && veRqa) {
    const admin = createAdminClient();
    const { data: vals, error } = await admin.from("rqa_gerente").select("deal_id, decisao, observacao, atualizado_em, atualizado_por").eq("negocio_id", atual.id);
    if (error) rqaIndisponivel = true;
    for (const v of vals ?? []) gerenteRqa.set(v.deal_id, { decisao: v.decisao, observacao: v.observacao, atualizadoEm: v.atualizado_em, atualizadoPor: v.atualizado_por });
    podeValidar = !rqaIndisponivel && (await podeValidarRqa(supabase, user.id, eu.role, atual.id, atual.slug));
    const ids = Array.from(new Set(Array.from(gerenteRqa.values()).map((v) => v.atualizadoPor).filter((x): x is string => !!x)));
    if (ids.length) {
      const { data: perfis } = await admin.from("profiles").select("id, full_name").in("id", ids);
      nomesPerfis = Object.fromEntries((perfis ?? []).map((p) => [p.id, p.full_name]));
    }
  }
  const todos = baseToda.filter((l) => l.agendadaEm);
  const noMes = (iso: string | null) => dataBR(iso)?.slice(0, 7) === mesParam;

  // Opções dos filtros (de toda a base, para não sumirem ao filtrar).
  const preVendas = Array.from(new Set(todos.map((l) => l.preVendas).filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const closers = Array.from(new Set(todos.flatMap((l) => [l.closer, l.responsavel]).filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const canais = Array.from(new Set(todos.map((l) => l.canal)));
  // Opções dos filtros da aba closer: das reuniões realizadas da base (etapa de agora e mês da previsão).
  const realizadasBase = todos.filter((l) => l.realizadaEm);
  const etapasCloser = Array.from(new Set(realizadasBase.map((l) => l.etapa))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const etapasPedidas = [searchParams.etapa ?? []].flat();
  const etapasSel = etapasCloser.filter((x) => etapasPedidas.includes(x));
  const mesesPrevisao = Array.from(new Set(realizadasBase.map((l) => l.previsao?.slice(0, 7)).filter((x): x is string => !!x))).sort();
  const faturamentos = Array.from(new Map(todos.filter((l) => l.faturamento).map((l) => [l.faturamento!, l.faturamentoRotulo ?? legivel(l.faturamento)!])).entries()).sort(
    (a, b) => ordemFaixa(a[0]) - ordemFaixa(b[0]) || a[1].localeCompare(b[1], "pt-BR"),
  );

  const href = (mudar: Partial<Params>) => {
    const p = new URLSearchParams();
    const tudo: Params = { negocio: atual.slug, mes: mesParam, aba, pv: f.pv, closer: f.closer, canal: f.canal, q: f.q, base: searchParams.base, situacao: searchParams.situacao, modo: searchParams.modo, fat: searchParams.fat, diaR: searchParams.diaR, temp: searchParams.temp, sitR: searchParams.sitR, ger: searchParams.ger, bant: searchParams.bant, etapa: searchParams.etapa, rqa: searchParams.rqa, prev: searchParams.prev, vq: searchParams.vq, ...mudar };
    for (const [k, v] of Object.entries(tudo)) for (const x of Array.isArray(v) ? v : [v]) if (x) p.append(k, x);
    return `/auditoria-comercial?${p}`;
  };
  const lead = searchParams.lead ? baseToda.find((l) => String(l.seq) === searchParams.lead || l.id === searchParams.lead) : undefined;

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
            ["leads_outbound", "Leads Outbound do período"],
            ["leads_inbound", "Leads Inbound do período"],
            ...(temEventos ? ([["leads_eventos", "Leads Eventos do período"]] as const) : []),
            ...(veRqa ? ([["rqa", "RQA"]] as const) : []),
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
        {!aba.startsWith("leads_") && aba !== "rqa" && (
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
        )}
        {aba === "reunioes" && (
          <Campo rotulo="Faturamento">
            <select name="fat" defaultValue={searchParams.fat ?? ""} className="rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-stone-200">
              <option value="">Todos</option>
              {faturamentos.map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {aba === "reunioes" && (
          <Campo rotulo="Dia da reunião">
            <input
              type="date"
              name="diaR"
              defaultValue={searchParams.diaR ?? ""}
              className="rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-stone-200"
              title="A data marcada da reunião (sem ela, a data em que foi realizada)"
            />
          </Campo>
        )}
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
          // A chave recria o filtro quando a seleção da URL muda (ex.: Limpar filtros).
          <FiltroMultiplo key={etapasSel.join("|")} nome="etapa" rotulo="Etapa" opcoes={etapasCloser} selecionadas={etapasSel} />
        )}
        {aba === "closer" && (
          <Campo rotulo="RQA">
            <select name="rqa" defaultValue={searchParams.rqa ?? ""} className="rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-stone-200">
              <option value="">Todas</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
              <option value="sem">Sem validação</option>
            </select>
          </Campo>
        )}
        {aba === "closer" && (
          <Campo rotulo="Previsão">
            <select name="prev" defaultValue={searchParams.prev ?? ""} className="rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-stone-200">
              <option value="">Todas</option>
              {mesesPrevisao.map((m) => (
                <option key={m} value={m}>
                  {mesCurto(m)}
                </option>
              ))}
              <option value="sem">Sem previsão</option>
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
        {aba === "rqa" && (
          <Campo rotulo="Situação da RQA">
            <select name="sitR" defaultValue={searchParams.sitR ?? ""} className="rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-stone-200">
              <option value="">Todas</option>
              {Object.entries(SITUACAO_RQA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.texto}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {aba === "rqa" && (
          <Campo rotulo="Validação do gerente">
            <select name="ger" defaultValue={searchParams.ger ?? ""} className="rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-stone-200">
              <option value="">Todas</option>
              <option value="aprovada">Aprovada</option>
              <option value="reprovada">Reprovada</option>
              <option value="sem">Sem validação</option>
            </select>
          </Campo>
        )}
        {aba === "rqa" && (
          <Campo rotulo="BANT">
            <select name="bant" defaultValue={searchParams.bant ?? ""} className="rounded border border-imperium-line bg-imperium-raised px-2 py-1 text-stone-200">
              <option value="">Todos</option>
              <option value="completo">Os 4 preenchidos</option>
              <option value="incompleto">Falta algum</option>
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
        {(f.pv || f.closer || f.canal || f.q || searchParams.situacao || searchParams.temp || searchParams.fat || searchParams.diaR || etapasSel.length > 0 || searchParams.rqa || searchParams.prev || searchParams.sitR || searchParams.ger || searchParams.bant) && (
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
        <AbaCloser todos={todos} etapas={etapasSel} f={f} noMes={noMes} sp={searchParams} href={href} />
      ) : aba === "rqa" && cfgRqa ? (
        <AbaRqa
          todos={todos}
          f={f}
          noMes={noMes}
          sp={searchParams}
          href={href}
          mesParam={mesParam}
          valor={cfgRqa.valor}
          desde={cfgRqa.desde}
          gerente={gerenteRqa}
          indisponivel={rqaIndisponivel}
          podeValidar={podeValidar}
          negocio={atual.slug}
          nomes={nomesPerfis}
        />
      ) : aba === "leads_outbound" ? (
        <AbaLeadsDoPeriodo todos={todos} f={f} noMes={noMes} canal="outbound" href={href} />
      ) : aba === "leads_eventos" ? (
        <AbaLeadsDoPeriodo todos={todos} f={f} noMes={noMes} canal="eventos" href={href} />
      ) : (
        <AbaLeadsInbound todos={baseToda} f={f} noMes={noMes} sp={searchParams} href={href} />
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

function Kpis({ itens, colunas = 6 }: { itens: { rotulo: string; valor: string; sub?: string; dica?: string }[]; colunas?: 2 | 4 | 6 }) {
  const grade = colunas === 2 ? "sm:grid-cols-2" : colunas === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3 lg:grid-cols-6";
  return (
    <div className={`grid grid-cols-2 gap-3 ${grade}`}>
      {itens.map((k) => (
        <div key={k.rotulo} className="rounded-lg border border-imperium-line bg-imperium-surface p-3" title={k.dica}>
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

/** BANT em quatro colunas, como no sistema antigo: o texto de cada campo do CRM. */
const BANT = [
  { k: "B", nome: "Faturamento", valor: (l: LeadAuditoria) => l.faturamentoRotulo ?? legivel(l.faturamento) },
  { k: "A", nome: "Cargo", valor: (l: LeadAuditoria) => l.cargoRotulo ?? legivel(l.cargo) },
  { k: "N", nome: "Necessidade", valor: (l: LeadAuditoria) => l.necessidade },
  { k: "T", nome: "Timing", valor: (l: LeadAuditoria) => l.timingRotulo ?? legivel(l.timing) },
] as const;
const BantCabecalho = () => (
  <>
    {BANT.map((c) => (
      <th key={c.k} className="px-2 py-2 text-left align-bottom font-normal">
        <span className="block text-xs font-semibold text-stone-200">{c.k}</span>
        <span className="block text-[10px] uppercase tracking-widest text-stone-500">{c.nome}</span>
      </th>
    ))}
  </>
);
const BantCelulas = ({ l }: { l: LeadAuditoria }) => (
  <>
    {BANT.map((c) => {
      const v = c.valor(l);
      return (
        <td key={c.k} className={`px-2 py-2 align-top text-[12px] ${c.k === "N" ? "min-w-[12rem] max-w-[16rem]" : "min-w-[7rem]"}`}>
          {v ? <span className="text-stone-200">{v}</span> : <span className="text-stone-600">não preenchido</span>}
        </td>
      );
    })}
  </>
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
  const diaDaReuniao = (l: LeadAuditoria) => dataBR(reuniaoBR(l.reuniaoMarcada) ?? l.realizadaEm);
  const filtrados = doMes.filter(
    (l) => passaFiltros(l, f) && (!sp.fat || l.faturamento === sp.fat) && (!sp.diaR || diaDaReuniao(l) === sp.diaR),
  );
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
        <table className="w-full min-w-[1250px] text-sm">
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
              <BantCabecalho />
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
                  <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] ${SITUACAO[l.situacao].classe}`}>{SITUACAO[l.situacao].texto}</span>
                  {l.situacao === "no_show" && <p className="mt-0.5 text-[11px] text-stone-500">no-show em {dia(l.noShowEm)}</p>}
                </td>
                <td className={tdClasse}>{l.reuniaoMarcada ? diaHora(reuniaoBR(l.reuniaoMarcada)) : <span className="text-stone-600">—</span>}</td>
                <td className={tdClasse}>{l.realizadaEm ? diaHora(l.realizadaEm) : <span className="text-stone-600">—</span>}</td>
                <td className={tdClasse}>{l.closer ?? "—"}</td>
                <BantCelulas l={l} />
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
function AbaCloser({ todos, etapas, f, noMes, sp, href }: { todos: LeadAuditoria[]; etapas: string[]; f: Filtros; noMes: (iso: string | null) => boolean; sp: Params; href: (m: Partial<Params>) => string }) {
  const emAberto = sp.modo === "aberto";
  const base = todos.filter((l) => l.realizadaEm && (emAberto ? l.status === "open" : noMes(l.realizadaEm)));
  const filtrados = base.filter((l) => passaFiltros(l, f));
  const temp = (l: LeadAuditoria) => {
    const t = (l.temperatura ?? "").toLowerCase();
    return ["quente", "morno", "frio"].includes(t) ? t : "sem";
  };
  const rqaDe = (l: LeadAuditoria) => (/^(sim|true)$/i.test(l.rqa ?? "") ? "sim" : /^(nao|não|false)$/i.test(l.rqa ?? "") ? "nao" : "sem");
  // Os filtros da aba valem para a lista e para os cards (como no sistema antigo).
  const lista = filtrados.filter(
    (l) =>
      (!sp.temp || temp(l) === sp.temp) &&
      (etapas.length === 0 || etapas.includes(l.etapa)) &&
      (!sp.rqa || rqaDe(l) === sp.rqa) &&
      (!sp.prev || (sp.prev === "sem" ? !l.previsao : l.previsao?.slice(0, 7) === sp.prev)),
  );
  const ganhos = lista.filter((l) => l.status === "won");
  const perdidos = lista.filter((l) => l.status === "lost");
  const comRqa = lista.filter((l) => l.rqa);
  const abertos = lista.filter((l) => l.status === "open");
  const follow = (t: string) => abertos.filter((l) => temp(l) === t);
  const soma = (ls: LeadAuditoria[]) => ls.reduce((s, l) => s + l.valor, 0);
  // Previsão de fechamento no mês vigente (o do calendário, como no sistema antigo).
  const mesVigente = hojeBR().slice(0, 7);
  const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const mesNome = `${MES_CURTO[Number(mesVigente.slice(5, 7)) - 1]}/${mesVigente.slice(2, 4)}`;
  const previstoNoMes = abertos.filter((l) => l.previsao?.slice(0, 7) === mesVigente);
  const quaseFechando = previstoNoMes.filter((l) => temp(l) === "quente" || temp(l) === "morno");
  const comRqaSim = comRqa.filter((l) => /^(sim|true)$/i.test(l.rqa ?? "")).length;
  const leads = (n: number) => (n === 0 ? "nenhum lead" : `${n} ${n === 1 ? "lead" : "leads"}`);
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
        colunas={4}
        itens={[
          { rotulo: "Reuniões realizadas", valor: String(lista.length), sub: emAberto ? "em aberto, de qualquer mês" : "no mês", dica: "Leads que chegaram à reunião realizada (com os filtros)." },
          {
            rotulo: "RQA",
            valor: String(comRqaSim),
            sub: comRqa.length ? `${Math.round((comRqaSim / comRqa.length) * 1000) / 10}% das ${comRqa.length} validadas pelo closer`.replace(".", ",") : "nenhuma validada ainda",
            dica: 'Reuniões com "RQA validada?" = Sim no CRM. A porcentagem é sobre as que o closer já validou (Sim ou Não).',
          },
          { rotulo: "Ganhos", valor: moeda(soma(ganhos)), sub: `${ganhos.length} ${ganhos.length === 1 ? "venda" : "vendas"}`, dica: "Leads ganhos: soma do valor do lead." },
          { rotulo: "Perdidos", valor: String(perdidos.length), sub: "perdidos no Pipefácil", dica: "Leads perdidos; o motivo aparece na lista." },
        ]}
      />
      <p className="text-sm font-semibold text-stone-200">
        Em negociação, por temperatura <span className="font-normal text-stone-400">{moeda(soma(abertos))} em {leads(abertos.length)}</span>
      </p>
      <Kpis
        colunas={4}
        itens={[
          { rotulo: "Follow quente", valor: moeda(soma(follow("quente"))), sub: leads(follow("quente").length), dica: "Em negociação (nem ganho nem perdido), Temperatura Quente: soma do valor." },
          { rotulo: "Follow morno", valor: moeda(soma(follow("morno"))), sub: leads(follow("morno").length), dica: "Em negociação, Temperatura Morno: soma do valor." },
          { rotulo: "Follow frio", valor: moeda(soma(follow("frio"))), sub: leads(follow("frio").length), dica: "Em negociação, Temperatura Frio: soma do valor." },
          { rotulo: "Follow sem temperatura", valor: moeda(soma(follow("sem"))), sub: leads(follow("sem").length), dica: "Em negociação sem a Temperatura preenchida no Pipefácil." },
        ]}
      />
      <p className="text-sm font-semibold text-stone-200">
        Previsão de fechamento <span className="font-normal text-stone-400">mês vigente: {mesNome}</span>
      </p>
      <Kpis
        colunas={2}
        itens={[
          {
            rotulo: `Follow com previsão em ${mesNome}`,
            valor: moeda(soma(previstoNoMes)),
            sub: leads(previstoNoMes.length),
            dica: `Em negociação, com a Previsão de fechamento no mês vigente (${mesNome}). Acompanha o mês do calendário.`,
          },
          {
            rotulo: `Quente/Morno · ${mesNome}`,
            valor: moeda(soma(quaseFechando)),
            sub: leads(quaseFechando.length),
            dica: `O follow mais perto de fechar: em negociação, Temperatura Quente ou Morno e Previsão de fechamento em ${mesNome}.`,
          },
        ]}
      />
      <PorPessoa titulo="Por closer" itens={contarPor(lista, (l) => l.closer ?? l.responsavel)} href={(nome) => href({ closer: nome, lead: undefined })} />
      <div className="overflow-x-auto rounded-lg border border-imperium-line bg-imperium-surface">
        <table className="w-full min-w-[1600px] text-sm">
          <thead className="border-b border-imperium-line">
            <tr>
              <th className={thClasse}>Lead</th>
              <th className={thClasse}>Realizada</th>
              <th className={thClasse}>Canal</th>
              <th className={thClasse}>Pré-vendas</th>
              <th className={thClasse} title="Quem fez a reunião (campo Closer do CRM)">
                Closer
              </th>
              <th className={thClasse} title="O responsável pelo lead agora no Pipefácil">
                Com quem está agora
              </th>
              <BantCabecalho />
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
                <td className={tdClasse}>{l.closer ?? <span className="text-stone-600">—</span>}</td>
                <td className={tdClasse}>
                  {l.responsavel ?? "—"}
                  {/* Lead aberto com outra pessoa que não o closer da reunião: em destaque, como no sistema antigo */}
                  {l.status === "open" && l.closer && l.responsavel && l.responsavel !== l.closer && <p className="text-[11px] text-amber-300">não é o closer da reunião</p>}
                </td>
                <BantCelulas l={l} />
                <td className={tdClasse}>
                  <SeloRqa rqa={l.rqa} />
                </td>
                <td className={tdClasse}>{l.etapa}</td>
                <td className={tdClasse}>
                  <SeloTemperatura t={l.temperatura} />
                </td>
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
          {linha("Faturamento", l.faturamentoRotulo ?? legivel(l.faturamento))}
          {linha("Cargo", l.cargoRotulo ?? legivel(l.cargo))}
          {linha("Necessidade", l.necessidade)}
          {linha("Timing", l.timingRotulo ?? legivel(l.timing))}
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

/**
 * Leads Outbound / Inbound do período (como no Funil Outbound do sistema antigo): o caminho de cada lead do
 * canal com algum passo no mês (agendamento, realização ou venda), quem agendou, a etapa atual no Funil de
 * Vendas com o closer e o valor. Cada passo com a sua data; "Não realizada" é o no-show ou a perda antes da
 * reunião. Mesma base e mesmas regras do Dashboard.
 */
function AbaLeadsDoPeriodo({
  todos,
  f,
  noMes,
  canal,
  href,
}: {
  todos: LeadAuditoria[];
  f: Filtros;
  noMes: (iso: string | null) => boolean;
  canal: "outbound" | "inbound" | "eventos";
  href: (m: Partial<Params>) => string;
}) {
  const lista = todos
    .filter((l) => l.canal === canal && passaFiltros(l, { ...f, canal: "" }) && (noMes(l.agendadaEm) || noMes(l.realizadaEm) || noMes(l.vendaEm)))
    .map((l) => ({ l, ultimo: [l.vendaEm, l.realizadaEm, l.agendadaEm].filter((x): x is string => !!x).sort().pop() ?? "" }))
    .sort((a, b) => b.ultimo.localeCompare(a.ultimo))
    .map((x) => x.l);
  const conta = (t: (l: LeadAuditoria) => boolean) => lista.filter(t).length;
  const titulo = CANAL[canal];
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-stone-500">
        O caminho de cada lead do {titulo} com algum passo no mês (agendamento, realização ou venda) e a etapa dele no Funil de Vendas. {lista.length} leads ·{" "}
        {conta((l) => noMes(l.agendadaEm))} agendados no mês · {conta((l) => noMes(l.realizadaEm))} realizados · {conta((l) => noMes(l.vendaEm))} vendas.
      </p>
      <PorPessoa titulo="Por pré-vendas" itens={contarPor(lista, (l) => l.preVendas)} href={(nome) => href({ pv: nome, lead: undefined })} />
      <div className="overflow-x-auto rounded-lg border border-imperium-line bg-imperium-surface">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-imperium-line">
            <tr>
              <th className={thClasse}>Lead</th>
              <th className={thClasse}>{canal === "outbound" ? "BDR" : canal === "eventos" ? "Pré-vendas" : "SDR"}</th>
              <th className={thClasse}>Caminho</th>
              <th className={thClasse}>Closer</th>
              <th className={`${thClasse} text-right`}>Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-imperium-line/60">
            {lista.map((l) => {
              const naoRealizada = !l.realizadaEm && (l.situacao === "no_show" || l.situacao === "cancelada");
              // Etapa depois da reunião (no Funil de Vendas da Acrópole; no próprio funil da Galáticos, que fecha a venda nele).
              const noFunilDeVendas = !!l.realizadaEm || /vendas/i.test(l.funil) || l.status === "lost" || l.status === "won";
              return (
                <tr key={l.id} className="hover:bg-imperium-raised/40">
                  <td className={tdClasse}>
                    <LinkLead l={l} href={href} /> <span className="text-[11px] text-stone-500">#{l.seq}</span>
                  </td>
                  <td className={`${tdClasse} text-stone-400`}>{l.preVendas ?? "—"}</td>
                  <td className={tdClasse}>
                    <span className="flex flex-wrap items-center gap-1 text-[11px]">
                      <Passo rotulo="Agendada" em={l.agendadaEm} />
                      <span className="text-stone-600">→</span>
                      {naoRealizada ? <span className="rounded border border-wine/60 bg-wine/10 px-1.5 py-0.5 text-wine-bright">Não realizada</span> : <Passo rotulo="Realizada" em={l.realizadaEm} />}
                      <span className="text-stone-600">→</span>
                      <Passo rotulo="Venda" em={l.vendaEm} />
                    </span>
                  </td>
                  <td className={tdClasse}>
                    {noFunilDeVendas ? <span className="text-stone-200">{l.etapa}</span> : <span className="text-stone-500">—</span>}{" "}
                    <span className="text-[11px] text-stone-500">{l.closer ?? ""}</span>
                  </td>
                  <td className={`${tdClasse} text-right tabular-nums`}>{l.valor ? moeda(l.valor) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && <p className="p-4 text-sm text-stone-500">Nenhum lead do {titulo} com passo no mês.</p>}
      </div>
    </div>
  );
}

/** Um passo do caminho: verde com a data quando aconteceu, cinza quando ainda não. */
function Passo({ rotulo, em }: { rotulo: string; em: string | null }) {
  return em ? (
    <span className="rounded border border-success/40 bg-success/10 px-1.5 py-0.5 text-success-bright">
      {rotulo} <span className="text-stone-400">{dia(em)}</span>
    </span>
  ) : (
    <span className="rounded border border-imperium-line px-1.5 py-0.5 text-stone-500">{rotulo}</span>
  );
}

/**
 * Leads Inbound do período (como no Funil Inbound do sistema antigo): todo lead do Tráfego Pago com algum
 * passo no mês (entrou, conectou, agendou, realizou ou vendeu), com o perfil (MQL ou não, faturamento e
 * cargo), o caminho com a data de cada passo e a etapa de agora. Visões: todos, só MQL ou só não MQL. Lead
 * falso fica fora (como no funil); os números batem com o funil do Dashboard.
 */
function AbaLeadsInbound({
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
  const doPeriodo = todos
    .filter((l) => l.canal === "inbound" && passaFiltros(l, { ...f, canal: "" }))
    .filter((l) => [l.criadoEm, l.conectadoEm, l.agendadaEm, l.realizadaEm, l.vendaEm].some(noMes));
  const visao = sp.vq === "mql" || sp.vq === "nao_mql" ? sp.vq : "todos";
  const daVisao = (l: LeadAuditoria) => (visao === "mql" ? l.mql : visao === "nao_mql" ? !l.mql : true);
  const lista = doPeriodo
    .filter(daVisao)
    .map((l) => ({ l, ultimo: [l.vendaEm, l.realizadaEm, l.agendadaEm, l.conectadoEm, l.criadoEm].filter((x): x is string => !!x).sort().pop() ?? "" }))
    .sort((a, b) => b.ultimo.localeCompare(a.ultimo))
    .map((x) => x.l);
  const conta = (t: (l: LeadAuditoria) => boolean) => lista.filter(t).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmentos
          opcoes={[
            { rotulo: "Todos", href: href({ vq: undefined, lead: undefined }), ativo: visao === "todos", contagem: doPeriodo.length },
            { rotulo: "MQL", href: href({ vq: "mql", lead: undefined }), ativo: visao === "mql", contagem: doPeriodo.filter((l) => l.mql).length },
            { rotulo: "Não MQL", href: href({ vq: "nao_mql", lead: undefined }), ativo: visao === "nao_mql", contagem: doPeriodo.filter((l) => !l.mql).length },
          ]}
        />
        <span className="text-[11px] text-stone-500">
          Todo lead do Tráfego Pago com algum passo no mês. {conta((l) => noMes(l.criadoEm))} entraram · {conta((l) => noMes(l.conectadoEm))} conectaram ·{" "}
          {conta((l) => noMes(l.agendadaEm))} agendaram · {conta((l) => noMes(l.realizadaEm))} realizaram · {conta((l) => noMes(l.vendaEm))} venderam no mês.
        </span>
      </div>
      <PorPessoa titulo="Por SDR" itens={contarPor(lista, (l) => l.preVendas)} href={(nome) => href({ pv: nome, lead: undefined })} />
      <div className="overflow-x-auto rounded-lg border border-imperium-line bg-imperium-surface">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b border-imperium-line">
            <tr>
              <th className={thClasse}>Lead</th>
              <th className={thClasse}>SDR</th>
              <th className={thClasse}>Perfil</th>
              <th className={thClasse}>Caminho</th>
              <th className={thClasse}>Etapa agora</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-imperium-line/60">
            {lista.map((l) => {
              const naoRealizada = !!l.agendadaEm && !l.realizadaEm && (l.situacao === "no_show" || l.situacao === "cancelada");
              const perfil = [legivel(l.faturamento), legivel(l.cargo)].filter(Boolean).join(" · ");
              return (
                <tr key={l.id} className="hover:bg-imperium-raised/40">
                  <td className={tdClasse}>
                    <LinkLead l={l} href={href} /> <span className="text-[11px] text-stone-500">#{l.seq}</span>
                  </td>
                  <td className={`${tdClasse} text-stone-400`}>{l.preVendas ?? "—"}</td>
                  <td className={tdClasse}>
                    <span className={`rounded border px-1.5 py-0.5 text-[11px] ${l.mql ? "border-success/50 text-success-bright" : "border-imperium-line text-stone-400"}`}>{l.mql ? "MQL" : "Não MQL"}</span>
                    <p className="mt-0.5 text-[11px] text-stone-500">{perfil || "sem faturamento e cargo"}</p>
                  </td>
                  <td className={tdClasse}>
                    <span className="flex flex-wrap items-center gap-1 text-[11px]">
                      <Passo rotulo="Entrou" em={l.criadoEm} />
                      <span className="text-stone-600">→</span>
                      <Passo rotulo="Conectou" em={l.conectadoEm} />
                      <span className="text-stone-600">→</span>
                      <Passo rotulo="Agendada" em={l.agendadaEm} />
                      <span className="text-stone-600">→</span>
                      {naoRealizada ? <span className="rounded border border-wine/60 bg-wine/10 px-1.5 py-0.5 text-wine-bright">Não realizada</span> : <Passo rotulo="Realizada" em={l.realizadaEm} />}
                      <span className="text-stone-600">→</span>
                      <Passo rotulo="Venda" em={l.vendaEm} />
                    </span>
                  </td>
                  <td className={`${tdClasse} text-stone-300`}>
                    {l.etapa}
                    {l.status === "lost" && l.motivoPerda ? <p className="text-[11px] text-stone-500">{l.motivoPerda}</p> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && <p className="p-4 text-sm text-stone-500">Nenhum lead do Tráfego Pago com passo no mês nesta visão.</p>}
      </div>
    </div>
  );
}

/** Ordem das faixas de faturamento pelo primeiro número do valor ("ate_30_mil" < "entre_30_e_100_mil" < …). */
function ordemFaixa(v: string): number {
  const n = Number(/\d+/.exec(v)?.[0] ?? 0);
  const milhao = /milh/.test(v) ? 1000 : 1;
  return /ate|abaixo/.test(v) ? -1 : /acima/.test(v) ? 1e7 + n * milhao : n * milhao;
}

/** RQA com cor, como no sistema antigo: Sim verde, Não vermelho, sem validação em cinza. */
function SeloRqa({ rqa }: { rqa: string | null }) {
  const v = (rqa ?? "").toLowerCase();
  if (/^(sim|true)$/.test(v)) return <span className="whitespace-nowrap rounded border border-success/50 bg-success/10 px-1.5 py-0.5 text-[11px] text-success-bright">Sim</span>;
  if (/^(nao|não|false)$/.test(v)) return <span className="whitespace-nowrap rounded border border-wine/60 bg-wine/10 px-1.5 py-0.5 text-[11px] text-wine-bright">Não</span>;
  return <span className="text-[11px] text-stone-500">validar no CRM</span>;
}

/** Temperatura com cor: quente vermelho, morno âmbar, frio azul. */
function SeloTemperatura({ t }: { t: string | null }) {
  const v = (t ?? "").toLowerCase();
  const cores: Record<string, string> = {
    quente: "border-red-400/60 bg-red-400/10 text-red-300",
    morno: "border-amber-400/60 bg-amber-400/10 text-amber-300",
    frio: "border-sky-400/60 bg-sky-400/10 text-sky-300",
  };
  if (!cores[v]) return <span className="text-stone-600">—</span>;
  return <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] ${cores[v]}`}>{legivel(v)}</span>;
}

/** "2026-11" → "nov/26". */
function mesCurto(m: string): string {
  const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${MESES_CURTOS[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
}

// ------------------------------------------------------------ RQA (só Acrópole, só gestão)
const SITUACAO_RQA: Record<SituacaoRqa, { texto: string; classe: string; dica: string }> = {
  validada: { texto: "Validada", classe: "border-success/50 bg-success/10 text-success-bright", dica: 'O closer marcou "RQA validada?" = Sim.' },
  nao_validada: { texto: "Não validada", classe: "border-wine/60 bg-wine/10 text-wine-bright", dica: 'O closer marcou "RQA validada?" = Não, com o motivo e a justificativa.' },
  aguardando: { texto: "Aguardando closer", classe: "border-gold/50 text-gold-bright", dica: "Sem a validação e o lead ainda está na Reunião Realizada: o closer ainda vai validar." },
  sem_registro: { texto: "Sem registro", classe: "border-amber-400/60 bg-amber-400/10 text-amber-300", dica: "Saiu da Reunião Realizada (ou foi perdido) sem a validação: acertar no Pipefácil." },
};

function AbaRqa({
  todos,
  f,
  noMes,
  sp,
  href,
  mesParam,
  valor,
  desde,
  gerente,
  indisponivel,
  podeValidar,
  negocio,
  nomes,
}: {
  todos: LeadAuditoria[];
  f: Filtros;
  noMes: (iso: string | null) => boolean;
  sp: Params;
  href: (m: Partial<Params>) => string;
  mesParam: string;
  valor: number;
  desde: string;
  gerente: Map<string, ValidacaoGerente>;
  indisponivel: boolean;
  podeValidar: boolean;
  negocio: string;
  nomes: Record<string, string>;
}) {
  if (mesParam < desde) return <p className="text-sm text-stone-500">A RQA no Senatus começa em {mesCurto(desde)}. Os meses anteriores ficaram no sistema antigo.</p>;
  // As reuniões realizadas do mês (o BDR é quem agendou, como no Pace), com os filtros.
  const doMes = todos.filter((l) => l.realizadaEm && noMes(l.realizadaEm) && passaFiltros(l, { ...f, canal: "" }));
  const lista = doMes
    .filter(
      (l) =>
        (!sp.sitR || situacaoDaRqa(l) === sp.sitR) &&
        (!sp.ger || (sp.ger === "sem" ? !gerente.has(l.id) : gerente.get(l.id)?.decisao === sp.ger)) &&
        (!sp.bant || (sp.bant === "completo" ? bantPreenchidos(l) === 4 : bantPreenchidos(l) < 4)),
    )
    .sort((a, b) => (b.realizadaEm ?? "").localeCompare(a.realizadaEm ?? ""));
  const r = resumirRqa(lista, gerente, valor);
  const pag = pagamentoDoMes(mesParam);
  const pagamento = `${pag.slice(8, 10)}/${pag.slice(5, 7)}`;
  const porBdr = new Map<string, LeadAuditoria[]>();
  for (const l of lista) porBdr.set(l.preVendas ?? "Sem BDR", [...(porBdr.get(l.preVendas ?? "Sem BDR") ?? []), l]);
  const linhasBdr = Array.from(porBdr, ([nome, ls]) => ({ nome, ...resumirRqa(ls, gerente, valor) })).sort((a, b) => b.validada - a.validada || b.realizadas - a.realizadas);
  const regularizar = lista.filter((l) => situacaoDaRqa(l) === "sem_registro");
  return (
    <div className="space-y-5">
      {indisponivel && (
        <p className="rounded-lg border border-amber-400/50 bg-amber-400/10 p-3 text-sm text-amber-300">
          A validação do gerente ainda não está disponível (falta aplicar a migration 0118 no banco). A página mostra a RQA do closer; a comissão oficial aparece quando a
          validação estiver ativa.
        </p>
      )}
      <Kpis
        colunas={4}
        itens={[
          { rotulo: "Realizadas", valor: String(r.realizadas), sub: `em ${mesCurto(mesParam)}`, dica: "Reuniões realizadas no mês (com os filtros). O BDR é quem agendou." },
          { rotulo: "RQA validadas", valor: String(r.validada), sub: r.realizadas ? `${Math.round((r.validada / r.realizadas) * 100)}% das realizadas` : "—", dica: 'O closer marcou "RQA validada?" = Sim.' },
          { rotulo: "Não validadas", valor: String(r.nao_validada), sub: "o closer recusou", dica: SITUACAO_RQA.nao_validada.dica },
          { rotulo: "Aguardando closer", valor: String(r.aguardando), sub: "ainda na Reunião Realizada", dica: SITUACAO_RQA.aguardando.dica },
        ]}
      />
      <Kpis
        colunas={4}
        itens={[
          { rotulo: "Sem registro", valor: String(r.sem_registro), sub: r.sem_registro ? "acertar no Pipefácil" : "nenhuma pendência", dica: SITUACAO_RQA.sem_registro.dica },
          { rotulo: "BANT incompleto", valor: String(r.bantIncompleto), sub: "falta algum dos 4 campos", dica: "Faturamento, Cargo, Necessidade ou Timing vazio no lead." },
          { rotulo: "Previsão", valor: moeda(r.previsao), sub: `${r.validada} validadas pelo closer × ${moeda(valor)}`, dica: "O que vem, pela validação do closer. Quem paga é o gerente." },
          {
            rotulo: "Comissão oficial",
            valor: moeda(r.comissao),
            sub: `${r.aprovadas} aprovadas pelo gerente × ${moeda(valor)} · paga em ${pagamento}`,
            dica: "Aprovadas pelo gerente comercial × valor da RQA. Paga no dia 15 do mês seguinte. Fica só nesta página (não entra na Comissão do mês).",
          },
        ]}
      />

      {regularizar.length > 0 && (
        <section className="rounded-lg border border-amber-400/40 bg-amber-400/5 p-4">
          <p className="text-[10px] uppercase tracking-widest text-amber-300">Para acertar no CRM</p>
          <p className="mt-0.5 text-sm font-semibold text-stone-100">Saíram da Reunião Realizada sem registro ({regularizar.length})</p>
          <p className="mt-0.5 text-[12px] text-stone-400">
            Já saíram da Reunião Realizada do Funil de Vendas (ou foram perdidos), mas o campo &quot;RQA validada?&quot; está vazio. Abra o lead no Pipefácil e preencha a
            validação (e, se não validada, o motivo e a justificativa). Na próxima sincronização ele sai daqui.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs">
            {regularizar.map((l) => (
              <li key={l.id} className="rounded border border-imperium-line bg-imperium-surface px-2 py-1">
                <LinkLead l={l} href={href} /> <span className="text-stone-500">#{l.seq} · {l.etapa} · {l.closer ?? l.responsavel ?? "—"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">Comissão</p>
        <p className="text-sm font-semibold text-stone-100">Por BDR</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm tabular-nums">
            <thead className="border-b border-imperium-line">
              <tr>
                <th className={thClasse}>BDR</th>
                {["Realizadas", "Validadas closer", "Não validadas", "Aguardando closer", "Sem registro", "BANT incompleto", "Aprovadas gerente", "Previsão", "Comissão oficial"].map((t) => (
                  <th key={t} className={`${thClasse} text-right`}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-imperium-line/60">
              {linhasBdr.map((b) => (
                <tr key={b.nome}>
                  <td className={tdClasse}>
                    <Link href={href({ pv: b.nome === "Sem BDR" ? undefined : b.nome, lead: undefined })} className="text-stone-100 hover:text-gold-bright">
                      {b.nome}
                    </Link>
                  </td>
                  <td className={`${tdClasse} text-right`}>{b.realizadas}</td>
                  <td className={`${tdClasse} text-right text-success-bright`}>{b.validada}</td>
                  <td className={`${tdClasse} text-right`}>{b.nao_validada}</td>
                  <td className={`${tdClasse} text-right`}>{b.aguardando}</td>
                  <td className={`${tdClasse} text-right ${b.sem_registro ? "text-amber-300" : ""}`}>{b.sem_registro}</td>
                  <td className={`${tdClasse} text-right`}>{b.bantIncompleto}</td>
                  <td className={`${tdClasse} text-right`}>{b.aprovadas}</td>
                  <td className={`${tdClasse} text-right`}>{moeda(b.previsao)}</td>
                  <td className={`${tdClasse} text-right font-semibold text-stone-100`}>{moeda(b.comissao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {linhasBdr.length === 0 && <p className="p-3 text-sm text-stone-500">Nenhuma reunião realizada com esses filtros.</p>}
        </div>
      </section>

      <div className="overflow-x-auto rounded-lg border border-imperium-line bg-imperium-surface">
        <p className="px-3 pt-3 text-[11px] text-stone-500">
          B: Faturamento · A: Cargo · N: Necessidade · T: Timing (o BANT do lead, preenchido pelo BDR). Closer: o &quot;RQA validada?&quot; que o closer preenche para tirar o
          lead da Reunião Realizada. Gerente: a validação do gerente comercial, aqui no Senatus (é ela que paga).
        </p>
        <table className="w-full min-w-[1500px] text-sm">
          <thead className="border-b border-imperium-line">
            <tr>
              <th className={thClasse}>Lead</th>
              <th className={thClasse}>BDR</th>
              <th className={thClasse}>Realizada em</th>
              <th className={thClasse}>Closer</th>
              <BantCabecalho />
              <th className={thClasse}>RQA do closer</th>
              <th className={thClasse}>Gerente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-imperium-line/60">
            {lista.map((l) => {
              const sit = SITUACAO_RQA[situacaoDaRqa(l)];
              const g = gerente.get(l.id);
              return (
                <tr key={l.id} className="hover:bg-imperium-raised/40">
                  <td className={tdClasse}>
                    <LinkLead l={l} href={href} />
                    <p className="text-[11px] text-stone-500">
                      #{l.seq} · {l.etapa}
                    </p>
                  </td>
                  <td className={tdClasse}>{l.preVendas ?? "—"}</td>
                  <td className={`${tdClasse} whitespace-nowrap`}>{dia(l.realizadaEm)}</td>
                  <td className={tdClasse}>{l.closer ?? l.responsavel ?? "—"}</td>
                  <BantCelulas l={l} />
                  <td className={`${tdClasse} min-w-[12rem]`}>
                    <span title={sit.dica} className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] ${sit.classe}`}>
                      {sit.texto}
                    </span>
                    {(l.rqaMotivos?.length ?? 0) > 0 && <p className="mt-1 text-[11px] text-stone-400">{l.rqaMotivos!.join(", ")}</p>}
                    {l.rqaJustificativa && <p className="mt-0.5 text-[11px] italic text-stone-500">&quot;{l.rqaJustificativa}&quot;</p>}
                  </td>
                  <td className={`${tdClasse} min-w-[13rem]`}>
                    {g ? (
                      <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] ${g.decisao === "aprovada" ? SITUACAO_RQA.validada.classe : SITUACAO_RQA.nao_validada.classe}`}>
                        {g.decisao === "aprovada" ? "Aprovada" : "Reprovada"}
                      </span>
                    ) : (
                      <span className="text-[11px] text-stone-500">sem validação</span>
                    )}
                    {g?.observacao && <p className="mt-1 text-[11px] text-stone-400">{g.observacao}</p>}
                    {g && (
                      <p className="text-[10px] text-stone-600">
                        {g.atualizadoPor ? nomes[g.atualizadoPor] ?? "" : ""} {diaHora(g.atualizadoEm)}
                      </p>
                    )}
                    {podeValidar && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[11px] text-gold-bright hover:underline">{g ? "Alterar" : "Validar"}</summary>
                        <form action={salvarValidacaoRqa} className="mt-1 space-y-1.5 rounded border border-imperium-line bg-imperium-raised p-2">
                          <input type="hidden" name="negocio" value={negocio} />
                          <input type="hidden" name="deal" value={l.id} />
                          <div className="flex flex-wrap gap-2 text-[11px] text-stone-200">
                            <label className="flex items-center gap-1">
                              <input type="radio" name="decisao" value="aprovada" defaultChecked={g?.decisao !== "reprovada"} /> Aprovar
                            </label>
                            <label className="flex items-center gap-1">
                              <input type="radio" name="decisao" value="reprovada" defaultChecked={g?.decisao === "reprovada"} /> Reprovar
                            </label>
                            {g && (
                              <label className="flex items-center gap-1 text-stone-400">
                                <input type="radio" name="decisao" value="limpar" /> Limpar
                              </label>
                            )}
                          </div>
                          <textarea
                            name="observacao"
                            defaultValue={g?.observacao ?? ""}
                            maxLength={1000}
                            rows={2}
                            placeholder="Observação (opcional)"
                            className="w-full rounded border border-imperium-line bg-imperium-surface px-2 py-1 text-[11px] text-stone-200 placeholder:text-stone-600"
                          />
                          <button type="submit" className="rounded border border-gold/60 px-2 py-0.5 text-[11px] text-gold-bright hover:bg-gold/10">
                            Salvar
                          </button>
                        </form>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {lista.length === 0 && <p className="p-4 text-sm text-stone-500">Nenhuma reunião realizada com esses filtros.</p>}
      </div>
    </div>
  );
}
