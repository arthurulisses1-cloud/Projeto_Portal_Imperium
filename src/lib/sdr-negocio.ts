// Visão do SDR (pré-vendas) num negócio com CRM: pace de reuniões agendadas e realizadas, no-show,
// RQA (Reunião Qualificada Agendada), vendas originadas e a tabela diária etapa por etapa (como o Pace
// da Matri). Pedido do Diretor, 17/11/2026, para o SDR da Acrópole (Vorp).
//
// De onde vem cada número:
//  - agendadas, realizadas e vendas da pessoa: o ranking de pré-vendas da sincronização (quem era o
//    responsável pelo lead no agendamento), com a meta do forecast dividida entre o time do canal
//    (TIMES_POR_CANAL, em pace-esforco.ts);
//  - no-show e RQA: a base da Auditoria comercial (mesmo "pré-vendas" do ranking). O RQA é o campo
//    "RQA validada" que o closer preenche no Pipefácil: "sim" = validada, "não" = recusada, vazio =
//    aguardando validação;
//  - vendas em MRR e recebido: tabela vendas, onde a pessoa é o SDR (indicador) ou quem fechou.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanalPortal } from "@/lib/integracoes/config";
import type { AuditoriaGravada, LeadAuditoria } from "@/lib/integracoes/auditoria";
import { buscarEsforcoNegocio, diasUteisDoMes, type EtapaEsforco, type PreVendasPace } from "@/lib/pace-esforco";
import { calcularPace, limitesDoMes } from "@/lib/pace-negocio";

/** Cargos de pré-vendas no negócio (quem agenda reunião). */
export const CARGOS_PRE_VENDAS = ["sdr", "bdr", "pre_vendas"];

/**
 * Valor de cada RQA validada, por canal do lead. Vorp: R$ 20 no outbound e R$ 10 no inbound (regra
 * anotada em comissao-negocio.ts; a validação fica para o fim do mês). Referido paga como inbound.
 */
export const RQA_VALOR: Record<string, Record<CanalPortal, number>> = {
  vorp: { outbound: 20, inbound: 10, indicacao: 10 },
};

/** Negócios com a visão do pré-vendas (Mural, Pace, Produção). Só a Acrópole paga RQA. */
export const SLUGS_PAINEL_SDR = ["vorp", "matchsales"];
export function temPainelSdr(slug: string): boolean {
  return SLUGS_PAINEL_SDR.includes(slug);
}
export function temRqa(slug: string): boolean {
  return !!RQA_VALOR[slug];
}

// ------------------------------------------------------------------ nomes (portal x Pipefácil)

function tokens(nome: string): string[] {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !["de", "da", "do", "das", "dos", "e"].includes(t));
}

/** Mesmo primeiro nome e mesmo último sobrenome (ex.: "Vinícius Ferreira" = "Vinícius Anastácio Ferreira"). */
export function mesmaPessoa(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  if (ta[0] !== tb[0]) return false;
  if (ta.length === 1 || tb.length === 1) return ta.length === tb.length;
  return ta[ta.length - 1] === tb[tb.length - 1];
}

/**
 * Usuário do Pipefácil de uma pessoa do portal. Primeiro pelo vínculo de e-mail gravado na sincronização
 * (`perfis`: usuário do Pipefácil → perfil do portal); sem ele, pelo nome.
 */
export function usuarioCrmDoPerfil(
  perfis: Record<string, string> | null,
  nomes: Record<string, string>,
  profileId: string,
  nomePerfil: string,
): string | null {
  for (const [usuario, perfil] of Object.entries(perfis ?? {})) if (perfil === profileId) return usuario;
  const achados = Object.entries(nomes).filter(([, nome]) => mesmaPessoa(nome, nomePerfil));
  return achados.length === 1 ? achados[0][0] : null;
}

// ------------------------------------------------------------------ reuniões, no-show e RQA

export type StatusRqa = "validada" | "aguardando" | "recusada";

export function statusRqa(valor: string | null): StatusRqa {
  if (!valor || !valor.trim()) return "aguardando";
  if (/^(sim|true|s|validad|aprovad|yes)/i.test(valor.trim())) return "validada";
  if (/^(n[aã]o|false|n|recusad|reprovad|no)\b/i.test(valor.trim())) return "recusada";
  return "aguardando";
}

export type ReuniaoSdr = {
  id: string;
  nome: string;
  empresa: string | null;
  canal: string;
  agendadaEm: string | null;
  realizadaEm: string | null;
  closer: string | null;
  rqa: StatusRqa;
  /** Valor da RQA pelo canal do lead (pago só se validada). */
  valorRqa: number;
};

/** Reunião agendada que ainda não aconteceu (nem no-show, nem cancelada). */
export type ReuniaoFutura = {
  id: string;
  nome: string;
  empresa: string | null;
  canal: string;
  agendadaEm: string | null;
  /** Data e hora da reunião (campo "Reunião agendada" do Pipefácil), em ISO quando deu para ler. */
  quando: string | null;
  /** O valor do campo como veio, quando não deu para ler como data. */
  quandoTexto: string | null;
  /** Quem agendou (visão do closer). */
  sdr?: string | null;
  /** Com quem é a reunião (visão do SDR/BDR): o closer, ou a pessoa para quem o lead foi repassado. */
  com?: string | null;
};

/** Lê o campo de data da reunião: ISO, "dd/mm/aaaa" ou "dd/mm/aaaa hh:mm" (horário de Brasília). */
export function lerDataReuniao(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{2}))?/.exec(s);
  if (br) {
    const [, d, m, a, h = "00", mi = "00"] = br;
    return new Date(`${a}-${m}-${d}T${h.padStart(2, "0")}:${mi}:00-03:00`).toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const t = Date.parse(s.length === 10 ? `${s}T00:00:00-03:00` : s);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  }
  return null;
}

export type ResumoReunioes = {
  /** Reuniões dele ainda por acontecer (qualquer mês), da mais próxima para a mais distante. */
  aAcontecer: ReuniaoFutura[];
  /** Reuniões realizadas no mês (pela data em que foram realizadas), com o status da RQA. */
  realizadas: ReuniaoSdr[];
  noShow: { qtd: number; base: number; pct: number | null };
  rqa: { validadas: number; aguardando: number; recusadas: number; valorValidado: number; valorAguardando: number };
};

/** Lead que o pré-vendas/BDR repassou: o responsável de hoje, quando não é quem agendou (no Match o campo closer quase não é preenchido). */
function repassadoPara(l: Pick<LeadAuditoria, "responsavel" | "preVendas">): string | null {
  return l.responsavel && l.responsavel !== l.preVendas ? l.responsavel : null;
}

const noMes = (iso: string | null, inicio: string, fimExcl: string) => !!iso && iso.slice(0, 10) >= inicio && iso.slice(0, 10) < fimExcl;
/** Instantes da auditoria vêm em UTC; a data do Brasil é UTC-3. */
const dataBR = (iso: string | null) =>
  !iso ? null : iso.length <= 10 ? iso : new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/**
 * Resumo das reuniões de um pré-vendas no mês (pura).
 * No-show: das reuniões que ele agendou no mês e que já tiveram desfecho (realizada ou no-show), quantas
 * foram no-show. RQA: as reuniões realizadas no mês, com o status preenchido pelo closer.
 */
export function resumirReunioes(leads: LeadAuditoria[], nomeCrm: string, slug: string, ano: number, mes: number): ResumoReunioes {
  const { inicio, fim } = limitesDoMes(ano, mes);
  const fimExcl = new Date(Date.parse(fim + "T00:00:00Z") + 86400_000).toISOString().slice(0, 10);
  const valores = RQA_VALOR[slug] ?? { outbound: 0, inbound: 0, indicacao: 0 };
  const meus = leads.filter((l) => l.preVendas === nomeCrm);

  const agendadas = meus.filter((l) => noMes(dataBR(l.agendadaEm), inicio, fimExcl));
  const comDesfecho = agendadas.filter((l) => l.situacao === "realizada" || l.situacao === "no_show");
  const qtdNoShow = comDesfecho.filter((l) => l.situacao === "no_show").length;

  const realizadas: ReuniaoSdr[] = meus
    .filter((l) => noMes(dataBR(l.realizadaEm), inicio, fimExcl))
    .map((l) => ({
      id: l.id,
      nome: l.nome,
      empresa: l.empresa,
      canal: l.canal,
      agendadaEm: dataBR(l.agendadaEm),
      realizadaEm: dataBR(l.realizadaEm),
      closer: l.closer ?? l.vendedor ?? repassadoPara(l),
      rqa: statusRqa(l.rqa),
      valorRqa: valores[l.canal as CanalPortal] ?? 0,
    }))
    .sort((a, b) => (b.realizadaEm ?? "").localeCompare(a.realizadaEm ?? ""));

  const aAcontecer: ReuniaoFutura[] = meus
    .filter((l) => l.situacao === "a_acontecer")
    .map((l) => {
      const quando = lerDataReuniao(l.reuniaoMarcada);
      return {
        id: l.id,
        nome: l.nome,
        empresa: l.empresa,
        canal: l.canal,
        agendadaEm: dataBR(l.agendadaEm),
        quando,
        quandoTexto: quando ? null : l.reuniaoMarcada,
        com: l.closer ?? repassadoPara(l),
      };
    })
    .sort((a, b) => (a.quando ?? "9999").localeCompare(b.quando ?? "9999"));

  const de = (s: StatusRqa) => realizadas.filter((r) => r.rqa === s);
  return {
    aAcontecer,
    realizadas,
    noShow: { qtd: qtdNoShow, base: comDesfecho.length, pct: comDesfecho.length > 0 ? qtdNoShow / comDesfecho.length : null },
    rqa: {
      validadas: de("validada").length,
      aguardando: de("aguardando").length,
      recusadas: de("recusada").length,
      valorValidado: de("validada").reduce((s, r) => s + r.valorRqa, 0),
      valorAguardando: de("aguardando").reduce((s, r) => s + r.valorRqa, 0),
    },
  };
}

/**
 * Soma dos pré-vendas (SDRs) do negócio como se fossem uma pessoa só: a meta é a soma das metas individuais e o
 * realizado, a união dos leads de cada um. Usada na visão do closer (pura).
 */
export function somarPreVendas(lista: PreVendasPace[], ctx: { ano: number; mes: number; hoje: string }): PreVendasPace {
  const indicadores = {} as PreVendasPace["indicadores"];
  for (const e of ["reunioes_agendadas", "reunioes_realizadas", "vendas"] as EtapaEsforco[]) {
    const leads = lista.flatMap((p) => p.indicadores[e].leads ?? []).sort((a, b) => a.data.localeCompare(b.data));
    const meta = lista.reduce((s, p) => s + p.indicadores[e].pace.meta, 0);
    indicadores[e] = { pace: calcularPace({ meta, recebido: leads.length, ...ctx }), canais: [], leads };
  }
  return { id: "todos", nome: "Todos os SDRs", indicadores, ideal: { realizadas: null, vendas: null } };
}

// ------------------------------------------------------------------ tabela diária (Pace da Matri)

export type EtapaDiaria = { chave: string; label: string; meta: number; datas: string[] };
export type CelulaDia = { real: number; meta: number; acum: number | null };
export type LinhaDiaria = { data: string; diaSemana: string; util: boolean; futuro: boolean; celulas: CelulaDia[] };

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/**
 * Uma linha por dia do mês e, por etapa: realizado do dia, meta do dia (meta do mês ÷ dias úteis, só em
 * dia útil), e acumulado = soma corrida de (realizado − meta), a mesma conta do Pace da Matri. Dias que
 * ainda não chegaram ficam sem acumulado. O total traz o mês: realizado, meta e o acumulado até hoje (pura).
 */
export function tabelaDiaria(etapas: EtapaDiaria[], ano: number, mes: number, hoje: string): { linhas: LinhaDiaria[]; total: CelulaDia[] } {
  const { inicio, fim } = limitesDoMes(ano, mes);
  const uteis = new Set(diasUteisDoMes(ano, mes));
  const porDia = etapas.map((e) => {
    const m = new Map<string, number>();
    for (const d of e.datas) m.set(d.slice(0, 10), (m.get(d.slice(0, 10)) ?? 0) + 1);
    return m;
  });
  const acum = etapas.map(() => 0);
  const total: CelulaDia[] = etapas.map(() => ({ real: 0, meta: 0, acum: 0 }));
  const linhas: LinhaDiaria[] = [];
  for (let t = Date.parse(inicio + "T00:00:00Z"); t <= Date.parse(fim + "T00:00:00Z"); t += 86400_000) {
    const data = new Date(t).toISOString().slice(0, 10);
    const util = uteis.has(data);
    const futuro = data > hoje;
    const celulas = etapas.map((e, i) => {
      const real = porDia[i].get(data) ?? 0;
      const meta = util && uteis.size > 0 ? e.meta / uteis.size : 0;
      total[i].real += real;
      total[i].meta += meta;
      if (futuro) return { real, meta, acum: null };
      acum[i] += real - meta;
      total[i].acum = acum[i];
      return { real, meta, acum: acum[i] };
    });
    linhas.push({ data, diaSemana: DIAS_SEMANA[new Date(t).getUTCDay()], util, futuro, celulas });
  }
  return { linhas, total };
}

// ------------------------------------------------------------------ busca

export const ROTULO_ETAPA: Record<EtapaEsforco, string> = {
  reunioes_agendadas: "Reuniões agendadas",
  reunioes_realizadas: "Reuniões realizadas",
  vendas: "Vendas originadas",
};

export type VendaSdr = { id: string; data: string; cliente: string | null; valor: number; mrr: number | null; canal: string | null };

export type PainelSdr = {
  slug: string;
  usuarioCrm: string | null;
  nomeCrm: string | null;
  /** Pace da pessoa (agendadas, realizadas e vendas, com a meta do canal dividida pelo time). null = fora dos times. */
  pv: PreVendasPace | null;
  reunioes: ResumoReunioes | null;
  /** Auditoria gravada (data da última sincronização). */
  atualizadoEm: string | null;
  vendas: { lista: VendaSdr[]; recebido: number; mrr: number };
};

/** Lê tudo o que a visão do SDR precisa. `admin`: só depois de conferir que a pessoa vista é do negócio. */
export async function buscarPainelSdr(
  admin: SupabaseClient,
  negocio: { id: string; slug: string },
  pessoa: { id: string; nome: string },
  ctx: { ano: number; mes: number; hoje: string },
): Promise<PainelSdr> {
  const { inicio, fim } = limitesDoMes(ctx.ano, ctx.mes);
  const fimExcl = new Date(Date.parse(fim + "T00:00:00Z") + 86400_000).toISOString().slice(0, 10);
  const [esforco, { data: mb }, { data: pf }, { data: au }, { data: vendas }] = await Promise.all([
    buscarEsforcoNegocio(admin, negocio.slug, negocio.id, ctx),
    admin.from("integracao_estado").select("valor").eq("chave", `pipefacil:${negocio.slug}:membros`).maybeSingle(),
    admin.from("integracao_estado").select("valor").eq("chave", `pipefacil:${negocio.slug}:perfis`).maybeSingle(),
    admin.from("integracao_estado").select("valor").eq("chave", `auditoria:${negocio.slug}`).maybeSingle(),
    admin
      .from("vendas")
      .select("id, data, cliente, valor, mrr, canal")
      .eq("negocio_id", negocio.id)
      .or(`indicador_id.eq.${pessoa.id},profile_id.eq.${pessoa.id}`)
      .gte("data", inicio)
      .lt("data", fimExcl)
      .order("data", { ascending: false }),
  ]);
  const nomes = (mb?.valor as Record<string, string> | null) ?? {};
  const usuarioCrm = usuarioCrmDoPerfil((pf?.valor as Record<string, string> | null) ?? null, nomes, pessoa.id, pessoa.nome);
  const nomeCrm = usuarioCrm ? nomes[usuarioCrm] ?? null : null;
  const auditoria = (au?.valor as AuditoriaGravada | null) ?? null;
  const lista: VendaSdr[] = (vendas ?? []).map((v) => ({
    id: v.id as string,
    data: v.data as string,
    cliente: (v.cliente as string | null) ?? null,
    valor: Number(v.valor ?? 0),
    mrr: v.mrr == null ? null : Number(v.mrr),
    canal: (v.canal as string | null) ?? null,
  }));
  return {
    slug: negocio.slug,
    usuarioCrm,
    nomeCrm,
    pv: (usuarioCrm && esforco?.preVendas.find((p) => p.id === usuarioCrm)) || null,
    reunioes: nomeCrm && auditoria ? resumirReunioes(auditoria.leads ?? [], nomeCrm, negocio.slug, ctx.ano, ctx.mes) : null,
    atualizadoEm: auditoria?.atualizado_em ?? null,
    vendas: { lista, recebido: lista.reduce((s, v) => s + v.valor, 0), mrr: lista.reduce((s, v) => s + (v.mrr ?? 0), 0) },
  };
}

/** Vínculo de pré-vendas da pessoa num negócio com painel de SDR (o principal primeiro). null = não tem. */
export async function vinculoPreVendas(
  supabase: SupabaseClient,
  profileId: string,
): Promise<{ id: string; slug: string; nome: string; equipe_nome: string | null } | null> {
  const { data } = await supabase
    .from("profile_negocios")
    .select("cargo, principal, negocios(id, slug, nome, equipe_nome, status)")
    .eq("profile_id", profileId);
  type N = { id: string; slug: string; nome: string; equipe_nome: string | null; status: string };
  type L = { cargo: string; principal: boolean; negocios: N | N[] | null };
  const achado = ((data ?? []) as unknown as L[])
    .map((l) => ({ ...l, n: Array.isArray(l.negocios) ? l.negocios[0] : l.negocios }))
    .filter((l) => l.n && l.n.status === "ativo" && CARGOS_PRE_VENDAS.includes(l.cargo) && temPainelSdr(l.n.slug))
    .sort((a, b) => Number(b.principal) - Number(a.principal))[0];
  return achado?.n ? { id: achado.n.id, slug: achado.n.slug, nome: achado.n.nome, equipe_nome: achado.n.equipe_nome } : null;
}

// ------------------------------------------------------------------ carteira de recorrência

export type ContratoCarteira = {
  chave: string;
  cliente: string;
  canal: string | null;
  papel: "sdr" | "closer";
  desde: string;
  ultimo: string;
  mrr: number;
  /** % da pessoa sobre cada MRR recebido (regra do negócio para o papel e o canal). */
  pct: number;
  porMes: number;
  recebidoNoMes: number;
  ativo: boolean;
  /** A venda teve pré-vendas (muda o % do executivo no Match Sales). */
  comIndicador: boolean;
  /** Meses de contrato já pagos de uma vez (plano semestral/anual pago à vista); 1 = mensal. */
  mesesPagos: number;
  /** Até quando o contrato está pago (AAAA-MM-DD) e se ainda vale hoje: a recorrência só começa depois, se houver renovação. */
  pagoAte: string | null;
  antecipado: boolean;
  /** Plano semestral/anual com só um sinal pago: o restante entra quando for pago (a venda é atualizada) e aí vira pago antecipado. */
  sinal: boolean;
};

/** Plano de vários meses (Tipo de Contrato) em que o recebido está entre uma parcela e o período todo: sinal pago, restante a vir (pura). */
export function ehSinalDePlano(v: { valor: number; mrr: number | null; valor_implantacao?: number | null; tipo_contrato?: string | null }): boolean {
  const meses = DICA_PLANO.find(([re]) => re.test(v.tipo_contrato ?? ""))?.[1] ?? 1;
  const mrr = Number(v.mrr ?? 0);
  if (meses <= 1 || !(mrr > 0)) return false;
  const razao = Math.max(0, Number(v.valor) - Number(v.valor_implantacao ?? 0)) / mrr;
  return razao > 1.5 && razao < meses * 0.9;
}

/** Planos cobrados de uma vez e a quantidade de meses que cobrem. */
const PLANOS_MESES = [12, 6, 3];
const DICA_PLANO: [RegExp, number][] = [[/anual/i, 12], [/semestral/i, 6], [/trimestral/i, 3], [/mensal/i, 1]];

/**
 * Quantos meses de contrato o recebimento da venda já cobre (pura). Cruza o valor recebido de uma vez (sem o
 * setup) com o MRR: 6 x MRR = semestral, 12 x MRR = anual. O nome do produto ("semestral", "anual") ajuda quando
 * o valor não fecha exato. 1 = mensal (ou não dá para saber).
 */
export function mesesPagosDaVenda(v: { valor: number; mrr: number | null; valor_implantacao?: number | null; produto?: string | null; tipo_contrato?: string | null }): number {
  const mrr = Number(v.mrr ?? 0);
  if (!(mrr > 0)) return 1;
  const base = Math.max(0, Number(v.valor) - Number(v.valor_implantacao ?? 0));
  const razao = base / mrr;
  // Tipo de Contrato do CRM manda: Mensal = 1; Semestral/Anual só contam como pagos se o recebido cobre o período.
  const tipo = DICA_PLANO.find(([re]) => re.test(v.tipo_contrato ?? ""))?.[1];
  if (tipo !== undefined) return tipo > 1 && razao >= tipo * 0.9 ? tipo : 1;
  const dica = DICA_PLANO.find(([re]) => re.test(v.produto ?? ""))?.[1];
  if (dica && dica > 1 && razao >= dica * 0.9) return dica;
  return PLANOS_MESES.find((c) => Math.abs(razao - c) <= c * 0.08) ?? 1;
}

/** Soma meses a uma data AAAA-MM-DD (mesmo dia do mês; o fim do mês curto fica no último dia). */
export function somaMesesData(data: string, meses: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimo));
  return alvo.toISOString().slice(0, 10);
}

type LinhaVendaCarteira = {
  data: string;
  cliente: string | null;
  crm_deal_id: string | null;
  mrr: number | null;
  valor: number;
  canal: string | null;
  profile_id: string | null;
  indicador_id: string | null;
  primeiro_contrato: boolean | null;
  valor_implantacao?: number | null;
  produto?: string | null;
  tipo_contrato?: string | null;
};

/**
 * Carteira de recorrência (pura): os contratos com MRR em que a pessoa foi o SDR ou fechou, agrupados
 * por cliente. Ativo = teve lançamento no mês corrente ou no anterior (o contrato que deixa de ser
 * lançado sai da recorrência). `pctDe` dá o % da pessoa por papel e canal.
 */
export function montarCarteira(
  vendas: LinhaVendaCarteira[],
  profileId: string,
  hoje: string,
  pctDe: (papel: "sdr" | "closer", canal: string | null, comIndicador?: boolean) => number,
  detectarPrepago = false,
): ContratoCarteira[] {
  const mesAtual = hoje.slice(0, 7);
  const [a, m] = mesAtual.split("-").map(Number);
  const mesAnterior = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
  const porChave = new Map<string, ContratoCarteira>();
  for (const v of [...vendas].sort((x, y) => x.data.localeCompare(y.data))) {
    if (!(Number(v.mrr) > 0) || v.primeiro_contrato === false) continue;
    const papel = v.indicador_id === profileId ? "sdr" : v.profile_id === profileId ? "closer" : null;
    if (!papel) continue;
    const chave = (v.cliente ?? "").trim().toLowerCase() || v.crm_deal_id || v.data;
    const c = porChave.get(chave) ?? {
      chave,
      cliente: v.cliente ?? "—",
      canal: v.canal,
      papel,
      desde: v.data,
      ultimo: v.data,
      mrr: 0,
      pct: 0,
      porMes: 0,
      recebidoNoMes: 0,
      ativo: false,
      comIndicador: !!v.indicador_id,
      mesesPagos: 1,
      pagoAte: null,
      antecipado: false,
      sinal: false,
    };
    // Match Sales: plano semestral/anual pago de uma vez cobre o contrato todo; conta pela 1ª venda do cliente.
    if (detectarPrepago && !porChave.has(chave)) {
      c.mesesPagos = mesesPagosDaVenda({ valor: Number(v.valor), mrr: Number(v.mrr), valor_implantacao: v.valor_implantacao, produto: v.produto, tipo_contrato: v.tipo_contrato });
      if (c.mesesPagos > 1) c.pagoAte = somaMesesData(v.data, c.mesesPagos);
      c.sinal = c.mesesPagos === 1 && ehSinalDePlano({ valor: Number(v.valor), mrr: Number(v.mrr), valor_implantacao: v.valor_implantacao, tipo_contrato: v.tipo_contrato });
    }
    c.ultimo = v.data;
    c.mrr = Number(v.mrr);
    c.canal = v.canal ?? c.canal;
    if (v.data.startsWith(mesAtual)) c.recebidoNoMes += Number(v.valor);
    porChave.set(chave, c);
  }
  return Array.from(porChave.values())
    .map((c) => {
      const pct = pctDe(c.papel, c.canal, c.comIndicador);
      // Contrato pago de uma vez: não gera recorrência até o fim do período pago (só vigora se houver renovação).
      const antecipado = !!c.pagoAte && hoje < c.pagoAte;
      const ativo = !antecipado && !c.sinal && (c.ultimo.startsWith(mesAtual) || c.ultimo.startsWith(mesAnterior));
      return { ...c, pct, porMes: (c.mrr * pct) / 100, ativo, antecipado };
    })
    .sort((x, y) => Number(y.ativo) - Number(x.ativo) || Number(y.antecipado) - Number(x.antecipado) || y.mrr - x.mrr);
}

export async function buscarCarteira(
  admin: SupabaseClient,
  negocioId: string,
  profileId: string,
  hoje: string,
  pctDe: (papel: "sdr" | "closer", canal: string | null, comIndicador?: boolean) => number,
  detectarPrepago = false,
): Promise<ContratoCarteira[]> {
  const consulta = (colunas: string) =>
    admin
      .from("vendas")
      .select(colunas)
      .eq("negocio_id", negocioId)
      .or(`indicador_id.eq.${profileId},profile_id.eq.${profileId}`)
      .gt("mrr", 0)
      .order("data")
      .range(0, 4999);
  // tipo_contrato é da migration 0117: sem ela, lê sem a coluna e o plano sai só pelo valor.
  let { data, error } = await consulta("data, cliente, crm_deal_id, mrr, valor, canal, profile_id, indicador_id, primeiro_contrato, valor_implantacao, produto, tipo_contrato");
  if (error) ({ data, error } = await consulta("data, cliente, crm_deal_id, mrr, valor, canal, profile_id, indicador_id, primeiro_contrato, valor_implantacao, produto"));
  return montarCarteira((data ?? []) as unknown as LinhaVendaCarteira[], profileId, hoje, pctDe, detectarPrepago);
}
