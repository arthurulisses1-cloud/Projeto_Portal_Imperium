import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hojeBR } from "@/lib/data-br";
import { getViewerContext } from "@/lib/preview";
import { COOKIE_NEGOCIO, NEGOCIO_COR, buscarNegociosVisiveis, negocioEmFoco, nomeEquipe } from "@/lib/negocios";
import { buscarDashboardNegocio, RANKINGS, type MixCanal } from "@/lib/dashboard-negocio";
import { etapasIntegradas, funilUnicoDoNegocio, funisDoMes, leadsPorQualificacao, montarFunisDaVisao, pessoasDoCanal, type CanalDoFunil, type LeadEtapa } from "@/lib/funil-negocio";
import { TIMES_POR_CANAL } from "@/lib/pace-esforco";
import { buscarLeadsDoFunil, buscarListasGravadas, buscarRankingGravado } from "@/lib/integracoes/leads-funil";
import type { Qualificacao, Recorte } from "@/lib/integracoes/realizado";
import { createAdminClient } from "@/lib/supabase/admin";
import { RealizadoComLeads } from "@/components/negocio/RealizadoComLeads";
import { CardsValor } from "@/components/negocio/CardsValor";
import type { FollowGravado } from "@/lib/integracoes/realizado";
import { CRM_POR_NEGOCIO } from "@/lib/integracoes/config";
import { buscarComissoesNegocios } from "@/lib/comissao-negocio";
import { buscarResumoSunne, type SunneResumo } from "@/lib/sunne";
import ContasSunne from "@/components/negocio/ContasSunne";
import { buscarLigacoesSunne, type LigacoesResumo } from "@/lib/api4com";
import { calcularPace, type PaceCalculado, type StatusPace } from "@/lib/pace-negocio";
import { metaKwhForecast } from "@/lib/forecast-negocios";
import { buscarAcumuladoKwhSunne } from "@/lib/sunne";
import { faixasAcima100k, pctAcima100k, resumirAcima100k } from "@/lib/faturamento-100k";
import { resumirDesfechoAgendadas, type DesfechoAgendadas, type LeadDesfecho } from "@/lib/desfecho-agendadas";
import type { AuditoriaGravada, LeadAuditoria } from "@/lib/integracoes/auditoria";
import { BotaoAtualizarRealizado } from "@/components/negocio/BotaoAtualizarRealizado";

export const dynamic = "force-dynamic";
// O botão "Atualizar agora" roda a sincronização do negócio (3C Plus + Pipefácil) nesta rota.
export const maxDuration = 60;

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const CANAL: Record<MixCanal["canal"], string> = { outbound: "Outbound", inbound: "Tráfego Pago", indicacao: "Referidos", alternativo: "Canais alternativos", sem_canal: "Sem canal" };
const STATUS: Record<StatusPace, { texto: string; classe: string }> = {
  sem_meta: { texto: "Sem meta", classe: "border-imperium-line text-stone-400" },
  adiantado: { texto: "Adiantado", classe: "border-success/50 text-success-bright" },
  no_ritmo: { texto: "No ritmo", classe: "border-amber-400/50 text-amber-400" },
  atrasado: { texto: "Atrasado", classe: "border-wine/60 text-wine-bright" },
  critico: { texto: "Crítico", classe: "border-wine/80 bg-wine/10 text-wine-bright" },
};

function kwh(v: number) {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kWh`;
}

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

export default async function NegocioDashboardPage({
  searchParams,
}: {
  searchParams: { negocio?: string; mes?: string; visao?: string; recorte?: string; pvOut?: string; pvIn?: string };
}) {
  // Visões do funil: qualificação (só Inbound) e recorte dos leads. Padrão: MQLs + todos os leads.
  const qualificacao: Qualificacao = searchParams.visao === "completo" || searchParams.visao === "nao_mql" ? searchParams.visao : "mql";
  const recorte: Recorte = searchParams.recorte === "mes" ? "mes" : "todos";
  const supabase = await createClient();
  // "Ver como": o Diretor enxerga os negócios e o papel da pessoa escolhida, não os dele.
  const viewer = await getViewerContext(supabase);
  if (!viewer) redirect("/login");
  const user = { id: viewer.effectiveId };
  const eu = { role: viewer.effectiveRole };

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

  // Energy: a mesma visão do financeiro em kWh fechados (Sunne) contra a meta de kWh do mês.
  let paceKwh: PaceCalculado | null = null;
  if (atual.slug === "vorp-energy") {
    const metaKwh = Math.round(metaKwhForecast(atual.slug, ano, mes));
    if (metaKwh > 0) {
      try {
        const acumulado = await buscarAcumuladoKwhSunne(ano, mes, hoje);
        paceKwh = calcularPace({ meta: metaKwh, recebido: acumulado[acumulado.length - 1]?.valor ?? 0, hoje, ano, mes });
      } catch (e) {
        console.error("kWh da Sunne indisponível no Dashboard:", e);
      }
    }
  }

  const { pace } = dados.pace;
  const cor = NEGOCIO_COR[atual.slug] ?? "201 162 74";
  // Faturamento acima de 100 mil (Acrópole): discreto, embaixo das reuniões agendadas e realizadas.
  const faixas100k = faixasAcima100k(atual.slug);
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
          .range(0, 29999)
      : { data: [] as { canal: string; etapa: string; quantidade: number; synced_at: string }[] };
  // Funis por canal do forecast; o negócio com funil próprio no CRM (Energy) mostra só ele, sem meta.
  const previstos = funisDoMes(atual.slug, ano, mes);
  const funilUnico = funilUnicoDoNegocio(atual.slug);
  // Leads de cada número (agendadas, realizadas, propostas, vendas): as listas que a sincronização grava
  // por mês e visão; mês fora da janela gravada cai no cálculo direto (só a visão padrão). O negócio já
  // passou pelo filtro de visibilidade acima; o espelho do CRM só é lido no servidor.
  let listasFunil = new Map<string, LeadEtapa[]>();
  if (integradas.size > 0 && !funilUnico) {
    try {
      const admin = createAdminClient();
      listasFunil = (await buscarListasGravadas(admin, atual.slug, mesParam)) ?? (await buscarLeadsDoFunil(admin, atual.slug, atual.id, inicioMes, fimMesExcl));
    } catch (e) {
      console.error("listas de leads do funil falharam:", e);
    }
  }
  const comVisoes = integradas.size > 0 && !funilUnico;
  // Filtro de pré-vendas de cada funil (Outbound e Tráfego Pago): o time do canal (Pace) mais quem tem número
  // no mês. Meta da pessoa = meta do canal ÷ tamanho do time do canal.
  const filtroPv: Partial<Record<CanalDoFunil, { opcoes: { id: string; nome: string }[]; escolhido: string | null; divisor: number }>> = {};
  if (comVisoes) {
    let nomes: Record<string, string> = {};
    try {
      const { data } = await createAdminClient().from("integracao_estado").select("valor").eq("chave", `pipefacil:${atual.slug}:membros`).maybeSingle();
      nomes = (data?.valor as Record<string, string> | null) ?? {};
    } catch (e) {
      console.error("nomes do Pipefácil falharam:", e);
    }
    for (const canal of ["outbound", "inbound"] as const) {
      const time = TIMES_POR_CANAL[atual.slug]?.[canal] ?? [];
      const ids = Array.from(new Set([...time, ...pessoasDoCanal(linhasRealizado ?? [], canal)]));
      if (ids.length === 0) continue;
      const primeiro = (id: string) => (nomes[id] ?? "Sem nome").split(" ")[0];
      const opcoes = ids
        .map((id) => ({ id, nome: ids.filter((x) => primeiro(x) === primeiro(id)).length > 1 ? nomes[id] ?? id : primeiro(id) }))
        .sort((a, b) => Number(time.includes(b.id)) - Number(time.includes(a.id)) || a.nome.localeCompare(b.nome, "pt-BR"));
      const pedido = canal === "outbound" ? searchParams.pvOut : searchParams.pvIn;
      filtroPv[canal] = { opcoes, escolhido: opcoes.some((o) => o.id === pedido) ? pedido! : null, divisor: time.length || opcoes.length };
    }
  }
  // Cards de valor embaixo dos funis (só negócios com follow, ex.: Acrópole): gravados pela sincronização.
  let follow: FollowGravado | null = null;
  if (comVisoes && CRM_POR_NEGOCIO[atual.slug]?.follow) {
    try {
      const { data } = await createAdminClient().from("integracao_estado").select("valor").eq("chave", `follow:${atual.slug}`).maybeSingle();
      follow = (data?.valor as FollowGravado | null) ?? null;
    } catch (e) {
      console.error("follow falhou:", e);
    }
  }
  // Desfecho das agendadas (realizadas, no-show, em aberto): a situação de cada reunião vem da base da Auditoria.
  let auditoria: LeadAuditoria[] = [];
  if (comVisoes) {
    try {
      const { data } = await createAdminClient().from("integracao_estado").select("valor").eq("chave", `auditoria:${atual.slug}`).maybeSingle();
      auditoria = (data?.valor as AuditoriaGravada | null)?.leads ?? [];
    } catch (e) {
      console.error("auditoria (desfecho das agendadas) falhou:", e);
    }
  }
  const pessoasEscolhidas: Partial<Record<CanalDoFunil, { id: string; divisor: number }>> = {};
  for (const [canal, f] of Object.entries(filtroPv) as [CanalDoFunil, NonNullable<(typeof filtroPv)[CanalDoFunil]>][]) {
    if (f.escolhido) pessoasEscolhidas[canal] = { id: f.escolhido, divisor: f.divisor };
  }
  let funis = montarFunisDaVisao(
    funilUnico ? [funilUnico] : previstos,
    linhasRealizado ?? [],
    integradas,
    listasFunil,
    comVisoes ? recorte : "todos",
    comVisoes ? qualificacao : "completo",
    pessoasEscolhidas,
  );
  // Vorp Finance: Entrevistas = as subidas pelo QR Code (planilha); Subidos = leads movidos para Subido em Meus Leads;
  // Vendas = vendas efetivas (aprovadas) do mês.
  if (atual.slug === "vorp-finance") {
    const contar = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
    const [entrevistas, subidos, vendasQtd] = await Promise.all([
      contar(supabase.from("entrevistas_leads").select("id", { count: "exact", head: true }).eq("negocio_id", atual.id).gte("data", inicioMes).lt("data", fimMesExcl)),
      contar(supabase.from("entrevistas_leads").select("id", { count: "exact", head: true }).eq("negocio_id", atual.id).gte("subido_em", inicioMes).lt("subido_em", fimMesExcl)),
      contar(supabase.from("vendas").select("id", { count: "exact", head: true }).eq("negocio_id", atual.id).gte("data", inicioMes).lt("data", fimMesExcl)),
    ]);
    const porChave: Record<string, number> = { reunioes_realizadas: entrevistas, propostas: subidos, vendas: vendasQtd };
    funis = funis.map((f) => (f.canal === "outbound" ? { ...f, etapas: f.etapas.map((e) => (e.chave in porChave ? { ...e, realizado: porChave[e.chave] } : e)) } : f));
  }
  const leadsQualificacao = leadsPorQualificacao(linhasRealizado ?? [], recorte, pessoasEscolhidas.inbound?.id);
  const hrefVisao = (mudar: { visao?: Qualificacao; recorte?: Recorte; pvOut?: string | null; pvIn?: string | null }) => {
    const q = new URLSearchParams({ mes: mesParam, negocio: atual.slug, visao: mudar.visao ?? qualificacao, recorte: mudar.recorte ?? recorte });
    const out = mudar.pvOut !== undefined ? mudar.pvOut : filtroPv.outbound?.escolhido;
    const inb = mudar.pvIn !== undefined ? mudar.pvIn : filtroPv.inbound?.escolhido;
    if (out) q.set("pvOut", out);
    if (inb) q.set("pvIn", inb);
    return `/negocio?${q}`;
  };
  const ultimaSyncFunil = (linhasRealizado ?? []).reduce<string | null>((m, l) => (!m || l.synced_at > m ? l.synced_at : m), null);
  const fracaoMes = pace.diasUteisTotal > 0 ? pace.diasUteisDecorridos / pace.diasUteisTotal : 0;
  // Desfecho das agendadas de cada funil; os canais sem ele reservam o mesmo espaço (conversões alinhadas).
  const desfechos = funis.map((fu) => resumirDesfechoAgendadas(fu.etapas.find((e) => e.chave === "reunioes_agendadas")?.leads, auditoria, hoje));
  const algumDesfecho = desfechos.some(Boolean);
  // Energy: contas subidas vêm da Sunne (negócios criados no mês por vendedor), não do compromisso do dia.
  // Ranking de pré-vendas pelo Pipefácil (agendadas e realizadas, todos os leads e canais), gravado pela
  // sincronização. Sem ele (negócio sem CRM ou mês fora da janela), vale o Compromisso do dia.
  let rankingCrm: Awaited<ReturnType<typeof buscarRankingGravado>> = null;
  if (comVisoes) {
    try {
      rankingCrm = await buscarRankingGravado(createAdminClient(), atual.slug, mesParam);
    } catch (e) {
      console.error("ranking do CRM falhou:", e);
    }
  }
  const CANAL_LEAD: Record<string, string> = { outbound: "Outbound", inbound: "Tráfego Pago", indicacao: "Referidos" };
  const rankings = (RANKINGS[atual.slug] ?? [])
    .map((k) => dados.esforco.find((e) => e.chave === k) ?? (rankingCrm?.[k] ? { chave: k, label: LABEL_RANKING[k] ?? k, meta: 0, realizado: 0, porPessoa: [] } : undefined))
    .filter((e): e is NonNullable<typeof e> => !!e)
    .map((rk) => {
      const doCrm = rankingCrm?.[rk.chave];
      if (doCrm) {
        return {
          ...rk,
          realizado: doCrm.reduce((s, p) => s + p.total, 0),
          porPessoa: doCrm.map((p) => ({
            nome: p.nome,
            meta: 0,
            realizado: p.total,
            leads: p.leads.map((l) => ({ nome: l.nome, data: l.data, responsavel: CANAL_LEAD[l.canal] ?? l.canal, preVendas: null, origem: l.origem ?? null, faturamento: l.faturamento })) as LeadEtapa[],
          })),
          fonte: "Pipefácil" as string | null,
        };
      }
      return atual.slug === "vorp-energy" && rk.chave === "contas_subidas" && sunne
        ? {
            ...rk,
            realizado: sunne.criados,
            porPessoa: sunne.porOrganizacao
              .filter((o) => o.criados > 0)
              .map((o) => ({ nome: o.pessoa ?? o.nome, meta: 0, realizado: o.criados, leads: undefined as LeadEtapa[] | undefined }))
              .sort((a, b) => b.realizado - a.realizado || a.nome.localeCompare(b.nome, "pt-BR")),
            fonte: "Sunne" as string | null,
          }
        : { ...rk, porPessoa: rk.porPessoa.map((p) => ({ ...p, leads: undefined as LeadEtapa[] | undefined })), fonte: null as string | null };
    });
  // Realizado do funil do Energy: a Sunne não informa o canal, então é o total de todos os canais.
  const metaEtapa = (label: string) => previstos.reduce((s, fu) => s + (fu.etapas.find((e) => e.label === label)?.meta ?? 0), 0);
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

      {paceKwh && (
        <section className="rounded-lg border bg-imperium-surface p-4" style={{ borderColor: `rgb(${cor} / 0.55)` }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-stone-500">kWh vendidos</p>
              <p className="text-3xl font-semibold text-stone-100">{kwh(paceKwh.recebido)}</p>
              <p className="text-sm text-stone-400">
                {Math.round((paceKwh.recebido / paceKwh.meta) * 100)}% de {kwh(paceKwh.meta)} (meta do forecast)
              </p>
            </div>
            <span className={`rounded border px-2 py-0.5 text-xs ${STATUS[paceKwh.status].classe}`}>{STATUS[paceKwh.status].texto}</span>
          </div>
          <div className="mt-3">
            <Barra valor={paceKwh.recebido} total={paceKwh.meta} cor={cor} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Deveria estar em</p>
              <p className="font-semibold text-stone-100">{kwh(paceKwh.esperadoAteHoje)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Projeção do mês</p>
              <p className="font-semibold text-stone-100">{paceKwh.diasUteisDecorridos > 0 ? kwh(paceKwh.projecao) : "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Falta por dia útil</p>
              <p className="font-semibold text-stone-100">{paceKwh.necessarioPorDia === null ? "—" : kwh(paceKwh.necessarioPorDia)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Dias úteis</p>
              <p className="font-semibold text-stone-100">
                {paceKwh.diasUteisDecorridos} de {paceKwh.diasUteisTotal}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Funil do mês: volumes e conversões, um bloco por canal, lado a lado */}
      <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-stone-500">{funilUnico ? `Funil do mês (${funilUnico.titulo} no Pipefácil)` : "Funil do mês (meta do forecast)"}</p>
            {comVisoes && (
              <div className="flex flex-wrap items-center gap-2">
                <Seletor
                  opcoes={[
                    { rotulo: "Todos os leads", href: hrefVisao({ recorte: "todos" }), ativo: recorte === "todos", dica: "Tudo o que aconteceu no mês, inclusive com leads de meses anteriores" },
                    { rotulo: "Leads do mês", href: hrefVisao({ recorte: "mes" }), ativo: recorte === "mes", dica: "Só os leads que entraram no mês e o que fizeram dentro do mês" },
                  ]}
                />
                {recorte === "mes" && <span className="text-[11px] text-stone-500">Alôs e conexões vêm do 3C (ligações) e não mudam.</span>}
              </div>
            )}
          </div>
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
                {integradas.size > 0 && (
                  <>
                    {" "}
                    <BotaoAtualizarRealizado slug={atual.slug} />
                  </>
                )}
              </p>
            )}
            {atual.slug === "vorp-energy" && (
              <>
                <p className="text-[11px] text-stone-500">
                  {ligacoes
                    ? `Ligações na Api4Com: ${num(ligacoes.ligacoes)} · ${num(ligacoes.alos)} alôs · ${num(ligacoes.conexoes)} conexões no mês`
                    : ligacoesErro
                      ? "Ligações da Api4Com indisponíveis no momento"
                      : null}
                </p>
                <p className="text-[11px] text-stone-500">
                  Funil: Pipefácil ·{" "}
                  {ultimaSyncFunil
                    ? `atualizado ${new Date(ultimaSyncFunil).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                    : "aguardando a primeira sincronização"}
                </p>
              </>
            )}
          </div>
        </div>
        {funis.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">Este negócio ainda não tem forecast neste mês.</p>
        ) : (
          <div className={`mt-3 grid gap-5 ${funis.length >= 3 ? "lg:grid-cols-3" : funis.length === 2 ? "lg:grid-cols-2" : ""}`}>
            {funis.map((fu, iFunil) => {
              // Todos os canais têm o mesmo número de linhas: os mais curtos ganham linhas vazias no topo,
              // assim as etapas finais (reuniões, propostas, vendas) e os cabeçalhos ficam na mesma altura.
              const pad = Math.max(...funis.map((x) => x.etapas.length)) - fu.etapas.length;
              return (
                <div key={fu.canal} className="min-w-0">
                  <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-1.5" style={{ borderColor: `rgb(${cor} / 0.4)` }}>
                    <p className="text-sm font-semibold" style={{ color: `rgb(${cor})` }}>
                      {fu.titulo}
                    </p>
                    {comVisoes && fu.canal === "inbound" && (
                      <Seletor
                        opcoes={[
                          { rotulo: "MQLs", contagem: leadsQualificacao.mql, href: hrefVisao({ visao: "mql" }), ativo: qualificacao === "mql" },
                          { rotulo: "Funil completo", contagem: leadsQualificacao.completo, href: hrefVisao({ visao: "completo" }), ativo: qualificacao === "completo" },
                          { rotulo: "Não MQLs", contagem: leadsQualificacao.nao_mql, href: hrefVisao({ visao: "nao_mql" }), ativo: qualificacao === "nao_mql" },
                        ]}
                      />
                    )}
                  </div>
                  {/* Pré-vendas do funil: "Time" ou uma pessoa (o funil inteiro dela, com a meta dela), numa lista suspensa */}
                  {comVisoes && (fu.canal === "outbound" || fu.canal === "inbound") && filtroPv[fu.canal] && (
                    <div className="mt-1.5">
                      <SeletorPessoa
                        key={filtroPv[fu.canal]!.escolhido ?? "time"}
                        escolhido={filtroPv[fu.canal]!.opcoes.find((o) => o.id === filtroPv[fu.canal]!.escolhido)?.nome ?? null}
                        time={hrefVisao(fu.canal === "outbound" ? { pvOut: null } : { pvIn: null })}
                        opcoes={filtroPv[fu.canal]!.opcoes.map((o) => ({
                          nome: o.nome,
                          href: hrefVisao(fu.canal === "outbound" ? { pvOut: o.id } : { pvIn: o.id }),
                          ativo: filtroPv[fu.canal]!.escolhido === o.id,
                        }))}
                        dica={`Funil de cada pessoa: alôs e conexões que atendeu no 3C, leads e reuniões que levou (a realizada, a proposta e a venda vão para quem agendou). Meta = meta do canal ÷ ${filtroPv[fu.canal]!.divisor}.`}
                      />
                    </div>
                  )}

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
                    {fu.etapas.map((e) =>
                      e.meta === null ? (
                        // Etapa sem meta (funil próprio do CRM): a barra é o realizado em relação à 1ª etapa.
                        <div key={e.label} className="contents">
                          <div className="min-w-0">
                            <p className="truncate text-stone-200" title={e.label}>
                              {e.label}
                            </p>
                            <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-imperium-raised" title={`Realizado ${e.realizado === null ? "—" : num(e.realizado)}`}>
                              {e.realizado !== null && (fu.etapas[0].realizado ?? 0) > 0 && (
                                <div
                                  className="absolute inset-y-0 left-0 rounded-full"
                                  style={{ width: `${Math.min(100, Math.max(e.realizado > 0 ? 1.5 : 0, (e.realizado / (fu.etapas[0].realizado as number)) * 100))}%`, backgroundColor: `rgb(${cor})` }}
                                />
                              )}
                            </div>
                          </div>
                          <span className="text-right text-stone-500">—</span>
                          <RealizadoComLeads valor={e.realizado === null ? "—" : num(e.realizado)} leads={e.leads} />
                          <span className="text-right text-stone-500">—</span>
                        </div>
                      ) : (
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
                            {faixas100k && (e.chave === "reunioes_agendadas" || e.chave === "reunioes_realizadas") && <Acima100kFunil leads={e.leads} faixas={faixas100k} />}
                          </div>
                          <span className="text-right text-stone-400">{num(e.meta * fracaoMes)}</span>
                          <RealizadoComLeads valor={e.realizado === null ? "—" : num(e.realizado)} leads={e.leads} />
                          <span className="text-right text-stone-300">{num(e.meta)}</span>
                        </div>
                      ),
                    )}
                  </div>

                  {/* Desfecho das agendadas: entre o funil e as conversões (os canais sem ele reservam o espaço) */}
                  {algumDesfecho && (
                    <div className="mt-3">
                      <DesfechoAgendadasFunil d={desfechos[iFunil]} />
                    </div>
                  )}

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
                          {e.conversaoMeta === null ? "—" : `${(e.conversaoMeta * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                        </span>
                      </div>
                      );
                    })}
                  </div>

                  {/* Valores: vendido no mês e follow (Funil de Vendas) por temperatura, com o filtro de pré-vendas
                      (Referidos não têm pré-vendas: sempre o canal todo) */}
                  {follow && (() => {
                    const pv = pessoasEscolhidas[fu.canal]?.id;
                    const doFunil = (l: { canal: string; pessoa: string | null }) => l.canal === fu.canal && (!pv || l.pessoa === pv);
                    return <CardsValor vendas={(follow.vendas[mesParam] ?? []).filter(doFunil)} abertos={follow.abertos.filter(doFunil)} cor={cor} />;
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Energy: contas na plataforma Sunne (todos os canais) até a validação e o desfecho */}
      {atual.slug === "vorp-energy" && sunne && <ContasSunne contas={sunne.contas} consolidado={sunne.consolidado} cor={cor} mesLabel={`${String(mes).padStart(2, "0")}/${ano}`} />}

      {/* Vendas de canais alternativos: fora dos funis, somam no recebido */}
      {comVisoes && (
        <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Vendas de canais alternativos · fora dos funis, somam no recebido</p>
            <p className="text-xs text-stone-400">
              <span className="text-stone-100">{dados.alternativas.qtd}</span> {dados.alternativas.qtd === 1 ? "venda" : "vendas"} ·{" "}
              <span className="text-stone-100">{moeda(dados.alternativas.valor)}</span>
              {dados.alternativas.mrr > 0 && (
                <>
                  {" "}
                  · MRR <span className="text-stone-100">{moeda(dados.alternativas.mrr)}</span>
                </>
              )}
            </p>
          </div>
          {dados.alternativas.qtd === 0 ? (
            <p className="mt-2 text-sm text-stone-500">Nenhuma venda de canal alternativo no mês.</p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                {dados.alternativas.porCanal.map((c) => (
                  <span key={c.canal} className="rounded-md border border-imperium-line bg-imperium-raised px-2.5 py-1.5 text-xs">
                    <span className="text-stone-300">{nomeCanalOrigem(c.canal)}</span> <span className="font-semibold text-stone-100">{c.qtd}</span>
                    <span className="text-stone-500"> · {moeda(c.valor)}</span>
                  </span>
                ))}
              </div>
              <ul className="mt-3 divide-y divide-imperium-line/60 text-sm">
                {dados.alternativas.vendas.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
                    <span className="w-12 shrink-0 text-xs text-stone-500">
                      {v.data.slice(8, 10)}/{v.data.slice(5, 7)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-stone-200">{v.cliente ?? "—"}</span>
                    <span className="w-36 shrink-0 text-xs text-stone-400">{nomeCanalOrigem(v.canal)}</span>
                    <span className="w-40 shrink-0 truncate text-xs text-stone-500">{v.vendedor}</span>
                    <span className="w-24 shrink-0 text-right text-stone-100">{moeda(v.valor)}</span>
                    <span className="w-28 shrink-0 text-right text-xs text-stone-500">{v.mrr ? `MRR ${moeda(v.mrr)}` : ""}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {/* Rankings dos indicadores-chave */}
      {rankings.length > 0 && (
        <div className={`grid gap-4 ${rankings.length >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
          {rankings.map((rk) => (
            <section key={rk.chave} className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Ranking · {rk.label}</p>
              <p className="text-xs text-stone-500">
                {num(rk.realizado)} no mês
                {rk.fonte === "Pipefácil" ? " · por pré-vendas, todos os leads · Pipefácil" : ` · ${num(rk.meta)} comprometidos${rk.fonte ? ` · ${rk.fonte}` : ""}`}
              </p>
              {rk.porPessoa.length === 0 ? (
                <p className="mt-2 text-sm text-stone-500">{rk.fonte === "Pipefácil" ? "Nenhuma reunião no mês." : "Ninguém registrou ainda."}</p>
              ) : (
                <ol className="mt-3 space-y-1.5 text-sm">
                  {rk.porPessoa.slice(0, 8).map((p, i) => {
                    const lider = rk.porPessoa[0]?.realizado || 1;
                    const medalha = MEDALHAS[i];
                    return (
                      <li
                        key={p.nome}
                        className={`relative rounded-md px-2 py-1.5 ${i === 0 ? "border border-gold/40 bg-gold/10" : "border border-transparent"}`}
                      >
                        <div className="flex items-center gap-2.5">
                          {medalha ? (
                            <span
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-stone-950 shadow"
                              style={{ background: `radial-gradient(circle at 35% 30%, ${medalha.brilho}, ${medalha.cor} 70%)`, boxShadow: `0 0 0 2px ${medalha.cor}55` }}
                              title={`${i + 1}º lugar`}
                            >
                              {i + 1}
                            </span>
                          ) : (
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center text-xs text-stone-500">{i + 1}</span>
                          )}
                          <span className={`min-w-0 flex-1 truncate ${i === 0 ? "font-semibold text-gold-bright" : "text-stone-200"}`}>
                            {p.nome}
                            {i === 0 && p.realizado > 0 && <span className="ml-1.5 text-[10px] uppercase tracking-widest text-gold">líder</span>}
                          </span>
                          {faixas100k && (rk.chave === "reunioes_agendadas" || rk.chave === "reunioes_realizadas") && (() => {
                            const r = resumirAcima100k(p.leads, faixas100k);
                            return r ? (
                              <span className="shrink-0 text-[10px] tabular-nums text-stone-500" title="Leads com faturamento a partir de 100 mil/mês no Pipefácil">
                                &gt;100k {r.qtd} · {pctAcima100k(r)}
                              </span>
                            ) : null;
                          })()}
                          <span className={i === 0 ? "text-base font-semibold" : ""}>
                            <RealizadoComLeads valor={num(p.realizado)} leads={p.leads} />
                          </span>
                        </div>
                        {/* Barra: quanto cada um tem em relação ao líder */}
                        <div className="ml-[2.125rem] mt-1 h-1 overflow-hidden rounded-full bg-imperium-raised">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${Math.max(4, (p.realizado / lider) * 100)}%`, background: medalha ? medalha.cor : `rgb(${cor} / 0.6)` }}
                          />
                        </div>
                      </li>
                    );
                  })}
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

      {/* Esforço (Compromisso do dia): fora dos negócios ligados ao Pipefácil, onde o realizado vem do CRM
          e o compromisso não é usado (decisão de 17/11/2026). */}
      {!comVisoes && (
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
      )}

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


/** Ouro, prata e bronze dos três primeiros do ranking. */
const MEDALHAS: ({ cor: string; brilho: string } | undefined)[] = [
  { cor: "#d4a72c", brilho: "#fff1b8" },
  { cor: "#a8b0ba", brilho: "#f4f6f8" },
  { cor: "#b8733a", brilho: "#f6d2b0" },
];

/** Nome do canal do CRM (valor do campo Canal) para exibir. */
const CANAIS_CRM: Record<string, string> = {
  social_selling: "Social Selling",
  indicacao: "Indicação",
  indicacao_cliente: "Indicação Cliente",
  indicacao_investidor: "Indicação Investidor",
  base_de_clientes: "Base de Clientes",
  base_de_leads: "Base de Leads",
  whatsapp_ia: "WhatsApp IA",
  linkedin: "LinkedIn",
  sem_canal: "Sem canal",
};
function nomeCanalOrigem(c: string) {
  return CANAIS_CRM[c] ?? c.split("_").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

const LABEL_RANKING: Record<string, string> = { reunioes_agendadas: "Reuniões agendadas", reunioes_realizadas: "Reuniões realizadas" };

/** Desfecho das agendadas do mês, abaixo do funil (antes das conversões): a barra e a legenda mostram a situação
 *  atual de cada lead (uma categoria por lead, a soma fecha com as agendadas); embaixo, os dois indicadores de
 *  no-show sobre o total de agendadas. Altura fixa: os canais sem o bloco reservam o mesmo espaço. */
function DesfechoAgendadasFunil({ d }: { d: DesfechoAgendadas | null }) {
  // Sem overflow-hidden: as listas de leads abrem por cima do que vem embaixo.
  const caixa = "h-[7rem] rounded-md border px-2 py-1.5";
  if (!d) return <div className={`${caixa} invisible border-transparent`} aria-hidden="true" />;
  const partes = [
    { rotulo: d.qtd.realizadas === 1 ? "realizada" : "realizadas", qtd: d.qtd.realizadas, leads: d.leads.realizadas, cor: "bg-success-bright", dica: "A reunião aconteceu (inclusive depois de um no-show)" },
    { rotulo: "no-show", qtd: d.qtd.noShow, leads: d.leads.noShow, cor: "bg-wine-bright", dica: "Parado no No Show, ou perdido depois de um no-show sem realizar" },
    { rotulo: "a acontecer", qtd: d.qtd.aAcontecer, leads: d.leads.aAcontecer, cor: "bg-stone-400", dica: "Em Reunião Agendada com data de hoje em diante (ou sem data), inclusive reagendados após no-show" },
    { rotulo: d.qtd.vencidas === 1 ? "vencida" : "vencidas", qtd: d.qtd.vencidas, leads: d.leads.vencidas, cor: "bg-warning-bright", dica: "Em Reunião Agendada com a data já passada, sem atualização no Pipefácil" },
    { rotulo: d.qtd.canceladas === 1 ? "cancelada" : "canceladas", qtd: d.qtd.canceladas, leads: d.leads.canceladas, cor: "bg-stone-600", dica: "Perdido sem ter dado no-show nem realizado" },
    ...(d.qtd.semInfo > 0
      ? [{ rotulo: "sem info", qtd: d.qtd.semInfo, leads: d.leads.semInfo, cor: "bg-imperium-line-strong", dica: "Lead não encontrado na Auditoria (aguarda a próxima sincronização)" }]
      : []),
  ];
  const pctTexto = (p: number) => `${(Math.round(p * 1000) / 10).toLocaleString("pt-BR")}%`;
  const corNaoRecuperado = d.naoRecuperado.pct > 0.3 ? "text-wine-bright" : d.naoRecuperado.pct > 0.15 ? "text-warning-bright" : "text-success-bright";
  return (
    <div className={`${caixa} border-imperium-line/60 bg-imperium-raised/40`}>
      <div className="flex items-baseline justify-between gap-2 whitespace-nowrap">
        <span className="truncate text-[10px] uppercase tracking-widest text-stone-500" title="Situação atual de cada lead agendado no mês">
          Das {num(d.total)} agendadas
        </span>
        <span className="text-[10px] text-stone-500">situação atual</span>
      </div>
      <div className="mt-1 flex h-1.5 gap-px overflow-hidden rounded-full bg-imperium-raised">
        {partes.filter((p) => p.qtd > 0).map((p) => (
          <div key={p.rotulo} className={p.cor} style={{ width: `${(p.qtd / d.total) * 100}%` }} title={`${p.qtd} ${p.rotulo}`} />
        ))}
      </div>
      <div className="mt-1 grid grid-cols-3 gap-x-2 gap-y-0.5 text-[10px] text-stone-400">
        {partes.map((p, i) => (
          <ListaLeads key={p.rotulo} titulo={`${p.qtd} ${p.rotulo}`} dica={p.dica} leads={p.leads} lado={i % 3 === 2 ? "direita" : "esquerda"} apagado={p.qtd === 0}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.cor}`} />
            <span className="text-stone-200">{p.qtd}</span>
            <span className={`truncate ${p.leads.length > 0 ? "underline decoration-stone-600 decoration-dotted underline-offset-2" : ""}`}>{p.rotulo}</span>
          </ListaLeads>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-2 border-t border-imperium-line/60 pt-1">
        <div className="min-w-0">
          <p className="truncate text-[10px] text-stone-500" title="(Parados no No Show + perdidos após no-show) ÷ agendadas">
            No-show não recuperado
          </p>
          <ListaLeads titulo={`${d.naoRecuperado.qtd} no-show não recuperado`} dica="Parados no No Show ou perdidos depois do no-show, sem realizar. Sobre o total de agendadas." leads={d.naoRecuperado.leads} lado="esquerda">
            <span className={`text-sm font-semibold ${corNaoRecuperado} ${d.naoRecuperado.qtd > 0 ? "underline decoration-dotted underline-offset-2" : ""}`}>{d.naoRecuperado.qtd}</span>
            <span className="text-[11px] text-stone-400">· {pctTexto(d.naoRecuperado.pct)}</span>
          </ListaLeads>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[10px] text-stone-500" title="Leads que passaram pelo No Show ao menos uma vez ÷ agendadas">
            No-show histórico
          </p>
          <ListaLeads titulo={`${d.historico.qtd} no-show histórico`} dica="Passaram pelo No Show ao menos uma vez, qualquer que seja a situação atual. Sobre o total de agendadas." leads={d.historico.leads} lado="direita">
            <span className={`text-sm font-semibold text-stone-100 ${d.historico.qtd > 0 ? "underline decoration-dotted underline-offset-2" : ""}`}>{d.historico.qtd}</span>
            <span className="text-[11px] text-stone-400">· {pctTexto(d.historico.pct)}</span>
          </ListaLeads>
        </div>
      </div>
    </div>
  );
}

/** Conteúdo com a lista de leads (lead, pré-vendas que agendou, data da reunião e situação após o no-show) ao passar o mouse. */
function ListaLeads({ titulo, dica, leads, lado, apagado = false, children }: { titulo: string; dica: string; leads: LeadDesfecho[]; lado: "esquerda" | "direita"; apagado?: boolean; children: React.ReactNode }) {
  if (leads.length === 0) {
    return (
      <span className={`inline-flex min-w-0 items-center gap-1 whitespace-nowrap ${apagado ? "opacity-40" : ""}`} title={dica}>
        {children}
      </span>
    );
  }
  // Leads com no-show: quantos em cada situação (parado no No Show, perdido, reagendado, realizada depois).
  const porDepois = new Map<string, number>();
  for (const l of leads) if (l.depois) porDepois.set(l.depois, (porDepois.get(l.depois) ?? 0) + 1);
  const resumoDepois = Array.from(porDepois.entries()).map(([k, n]) => `${n} ${k}`).join(" · ");
  const dataReuniao = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <span className="group relative inline-flex min-w-0 cursor-help items-center gap-1 whitespace-nowrap" tabIndex={0}>
      {children}
      <span
        className={`pointer-events-none invisible absolute ${lado === "direita" ? "right-0" : "left-0"} top-full z-30 mt-1 w-72 whitespace-normal rounded-md border border-imperium-line bg-imperium-surface p-2 text-left font-normal opacity-0 shadow-xl transition-opacity group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-focus:pointer-events-auto group-focus:visible group-focus:opacity-100`}
      >
        <span className="mb-1 block text-[10px] uppercase tracking-widest text-stone-500">{titulo}</span>
        <span className="mb-1.5 block text-[10px] text-stone-500">{dica}</span>
        {resumoDepois && <span className="mb-1.5 block text-[10px] text-stone-300">{resumoDepois}</span>}
        <span className="block max-h-72 space-y-1.5 overflow-y-auto">
          {leads.map((l, i) => (
            <span key={i} className="block text-[11px] leading-tight">
              <span className="text-stone-100">{l.nome}</span>
              {l.depois ? <span className="ml-1.5 rounded border border-imperium-line px-1 text-[10px] text-stone-300">{l.depois}</span> : null}
              <span className="block text-stone-400">
                pré-vendas: {l.preVendas ?? "—"}
                {l.reuniao ? <span className="text-stone-500"> · reunião {dataReuniao(l.reuniao)}</span> : null}
              </span>
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

/** Grupo de botões (links) de uma visão do funil; o ativo fica destacado. */
/** Linha discreta embaixo da barra da etapa: quantas reuniões são de leads com faturamento a partir de 100 mil.
 *  Sem a lista com o campo (gravada antes), ocupa o mesmo espaço vazio para não desalinhar os canais. */
function Acima100kFunil({ leads, faixas }: { leads?: LeadEtapa[]; faixas: string[] }) {
  const r = resumirAcima100k(leads, faixas);
  if (!r) return <p className="invisible mt-0.5 text-[10px]" aria-hidden="true">.</p>;
  return (
    <p
      className="mt-0.5 truncate text-[10px] text-stone-500"
      title={`${r.qtd} de ${r.total} com faturamento a partir de 100 mil/mês no Pipefácil${r.semFaturamento > 0 ? ` · ${r.semFaturamento} sem faturamento` : ""}`}
    >
      &gt;100k {r.qtd} · {pctAcima100k(r)}
    </p>
  );
}

function Seletor({ opcoes }: { opcoes: { rotulo: string; href: string; ativo: boolean; contagem?: number; dica?: string }[] }) {
  return (
    <span className="inline-flex rounded-lg border border-imperium-line bg-imperium-raised p-0.5 text-[11px]">
      {opcoes.map((o) => (
        <Link
          key={o.rotulo}
          href={o.href}
          scroll={false}
          title={o.dica}
          aria-current={o.ativo ? "true" : undefined}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 transition ${o.ativo ? "bg-imperium-surface font-semibold text-stone-100 shadow" : "text-stone-400 hover:text-stone-200"}`}
        >
          {o.rotulo}
          {o.contagem !== undefined && (
            <span className={`rounded-full px-1.5 tabular-nums ${o.ativo ? "bg-gold/20 text-gold-bright" : "bg-imperium-line/60 text-stone-400"}`}>{o.contagem.toLocaleString("pt-BR")}</span>
          )}
        </Link>
      ))}
    </span>
  );
}

/** Filtro de pré-vendas do funil numa lista suspensa: compacto mesmo com muitas pessoas (ex.: Galáticos). */
function SeletorPessoa({ escolhido, time, opcoes, dica }: { escolhido: string | null; time: string; opcoes: { nome: string; href: string; ativo: boolean }[]; dica: string }) {
  return (
    <details className="group relative inline-block text-[11px]">
      <summary
        title={dica}
        className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-imperium-line bg-imperium-raised px-2.5 py-1 text-stone-300 hover:text-stone-100 [&::-webkit-details-marker]:hidden"
      >
        <span className="text-[10px] uppercase tracking-widest text-stone-500">Pré-vendas</span>
        <span className={escolhido ? "font-semibold text-gold-bright" : "text-stone-100"}>{escolhido ?? "Time"}</span>
        <span className="text-stone-500 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="absolute left-0 z-30 mt-1 max-h-72 min-w-[12rem] overflow-y-auto rounded-md border border-imperium-line bg-imperium-surface p-1 shadow-xl">
        <Link href={time} scroll={false} className={`block rounded px-2 py-1 ${!escolhido ? "bg-imperium-raised font-semibold text-stone-100" : "text-stone-300 hover:bg-imperium-raised"}`}>
          Time
        </Link>
        {opcoes.map((o) => (
          <Link key={o.nome} href={o.href} scroll={false} className={`block rounded px-2 py-1 ${o.ativo ? "bg-imperium-raised font-semibold text-gold-bright" : "text-stone-300 hover:bg-imperium-raised"}`}>
            {o.nome}
          </Link>
        ))}
      </div>
    </details>
  );
}
