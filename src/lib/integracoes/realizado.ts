// Cálculo puro do realizado dos funis a partir do espelho do CRM (sem banco, sem rede — testado).
//
// Regra de contagem: um lead conta numa etapa no dia em que, pela primeira vez, chegou
// nela OU numa etapa mais avançada (lead que pula etapa ou já nasce adiantado também conta).
// O canal é o campo Canal do lead: outbound, trafego (= Inbound) ou indicacao.
// Regras opcionais por negócio (config): voltar de etapa desfaz realizada/proposta/venda; nascer no
// Funil de Vendas não conta etapa.
import { ETAPAS_PORTAL, NIVEL, NIVEL_DA_ETAPA, type CanalPortal, type ConfigCrm, type CriterioMql, type FunilUnico, type Nivel } from "./config";

export type DealCrm = {
  deal_id: string;
  canal: string | null;
  faturamento: string | null;
  cargo: string | null;
  /** Tamanho do time comercial (só em memória; não vai para crm_deals). */
  tamanho_time?: string | null;
  /** Motivo de perda (só em memória; não vai para crm_deals). */
  motivo_perda?: string | null;
  /** Origem do lead quando difere do canal (só em memória; vai para as listas do hover). */
  origem?: string | null;
  status: string | null;
  stage_id: string | null;
  valor: number | null;
  mrr: number | null;
  nome: string | null;
  empresa: string | null;
  produtos: string[] | null;
  responsavel_user_id: string | null;
  closer_user_id: string | null;
  sdr_user_id: string | null;
  criado_em: string | null;
  fechado_em: string | null;
};

export type EventoCrm = {
  deal_id: string;
  stage_id: string | null;
  ocorrido_em: string;
  /** Tipo da atividade (DEAL_CREATED, STAGE_CHANGED, DEAL_WON). */
  tipo?: string | null;
  pipeline_id?: string | null;
};

/** Data (YYYY-MM-DD) no fuso de Brasília de um instante ISO. */
export function dataBR(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function canalPortal(deal: Pick<DealCrm, "canal">, cfg: ConfigCrm): CanalPortal | null {
  return deal.canal ? cfg.canais[deal.canal] ?? null : null;
}

/** MQL: o lead atende todos os critérios definidos na config do negócio. */
export function ehMql(deal: Pick<DealCrm, "faturamento" | "cargo" | "tamanho_time">, cfg: ConfigCrm): boolean {
  const criterios = (Object.entries(cfg.mql) as [CriterioMql, string[] | undefined][]).filter(([, v]) => v && v.length > 0);
  if (criterios.length === 0) return false;
  return criterios.every(([k, aceitos]) => {
    const v = deal[k];
    return !!v && aceitos!.includes(v);
  });
}

type Marcos = Partial<Record<Nivel, string>>;
const NIVEIS_DESFEITOS: Nivel[] = [NIVEL.realizada, NIVEL.proposta, NIVEL.venda];

/** Marcos de um lead (eventos dele, em qualquer ordem): quando chegou em cada nível. */
function marcosDoLead(eventos: EventoCrm[], cfg: ConfigCrm): Marcos {
  const nivelDe = (e: EventoCrm): Nivel | undefined => {
    if (e.tipo === "DEAL_CREATED" && e.pipeline_id && cfg.pipelinesSemNivelNaCriacao?.includes(e.pipeline_id)) return undefined;
    return e.stage_id ? cfg.niveis[e.stage_id] : undefined;
  };
  // Mesmo instante: o nível menor primeiro (o CRM grava "Agendada" e "Ganho" no mesmo segundo).
  const ordem = eventos
    .map((e) => ({ t: e.ocorrido_em, n: nivelDe(e) }))
    .filter((e): e is { t: string; n: Nivel } => e.n !== undefined)
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t) || a.n - b.n);
  const m: Marcos = {};
  for (const { t, n } of ordem) {
    if (cfg.regressaoDesfaz) for (const k of NIVEIS_DESFEITOS) if (k > n) delete m[k];
    for (let k = 1 as Nivel; k <= n; k = (k + 1) as Nivel) if (!m[k]) m[k] = t;
  }

  return m;
}

/** Quando cada lead atingiu cada nível (ou mais), com a regra de regressão. */
export function marcosPorLead(eventos: EventoCrm[], cfg: ConfigCrm): Map<string, Marcos> {
  const porLead = new Map<string, EventoCrm[]>();
  for (const e of eventos) {
    const lista = porLead.get(e.deal_id);
    if (lista) lista.push(e);
    else porLead.set(e.deal_id, [e]);
  }
  const out = new Map<string, Marcos>();
  porLead.forEach((lista, id) => out.set(id, marcosDoLead(lista, cfg)));
  return out;
}

export type ContagemDia = { data: string; canal: CanalPortal; etapa: string; quantidade: number };

/** Realizado das etapas que vêm do CRM, por dia, no intervalo [inicio, fimExcl) (datas YYYY-MM-DD de Brasília). */
/** Lead perdido com um dos motivos de lead falso do negócio (sem diferenciar maiúsculas). */
export function ehLeadFalso(d: Pick<DealCrm, "motivo_perda">, cfg: ConfigCrm): boolean {
  const motivo = d.motivo_perda?.trim().toLowerCase();
  return !!motivo && !!cfg.motivosLeadFalso?.some((m) => m.toLowerCase() === motivo);
}

/** Percorre cada contagem do realizado (lead, canal, etapa, dia), com a mesma regra para o número e
 *  para a lista de leads do número. */
function percorrerRealizado(
  deals: DealCrm[],
  eventos: EventoCrm[],
  cfg: ConfigCrm,
  inicio: string,
  fimExcl: string,
  cada: (data: string, canal: CanalPortal, etapa: string, deal: DealCrm) => void,
): void {
  const chegada = marcosPorLead(eventos, cfg);
  const somar = (data: string, canal: CanalPortal, etapa: string, d: DealCrm) => {
    if (data >= inicio && data < fimExcl) cada(data, canal, etapa, d);
  };
  for (const d of deals) {
    const canal = canalPortal(d, cfg);
    if (!canal) continue;
    const etapas = ETAPAS_PORTAL[canal];

    // Lead falso (perdido com motivo de lead falso): sai do funil inteiro, inclusive de Leads (17/11/2026).
    if (ehLeadFalso(d, cfg)) continue;

    // Topo do funil: criação do lead (Inbound e Indicação). Alôs/Conexões do Outbound vêm do 3C.
    if (d.criado_em) {
      const dia = dataBR(d.criado_em);
      if (etapas.includes("leads")) somar(dia, canal, "leads", d);
      if (etapas.includes("mql") && ehMql(d, cfg)) somar(dia, canal, "mql", d);
      if (etapas.includes("leads_indicados")) somar(dia, canal, "leads_indicados", d);
    }

    const marcas = chegada.get(d.deal_id);
    if (!marcas) continue;
    for (const etapa of etapas) {
      const nivel = NIVEL_DA_ETAPA[etapa];
      if (!nivel) continue;
      // Venda desfeita (o lead foi ganho e depois perdido ou reaberto): não conta.
      if (nivel === NIVEL.venda && d.status !== "won") continue;
      const t = marcas[nivel];
      if (t) somar(dataBR(t), canal, etapa, d);
    }
  }
}

export function calcularRealizadoCrm(
  deals: DealCrm[],
  eventos: EventoCrm[],
  cfg: ConfigCrm,
  inicio: string,
  fimExcl: string,
): ContagemDia[] {
  const acc = new Map<string, ContagemDia>();
  percorrerRealizado(deals, eventos, cfg, inicio, fimExcl, (data, canal, etapa) => {
    const k = `${data}|${canal}|${etapa}`;
    const atual = acc.get(k);
    if (atual) atual.quantidade += 1;
    else acc.set(k, { data, canal, etapa, quantidade: 1 });
  });
  return Array.from(acc.values());
}

export type LeadDoRealizado = { canal: CanalPortal; etapa: string; data: string; deal: DealCrm };

/** Os leads por trás de cada número do realizado (para mostrar ao passar o mouse no dashboard). */
export function leadsDoRealizado(
  deals: DealCrm[],
  eventos: EventoCrm[],
  cfg: ConfigCrm,
  inicio: string,
  fimExcl: string,
  etapas?: string[],
): LeadDoRealizado[] {
  const out: LeadDoRealizado[] = [];
  percorrerRealizado(deals, eventos, cfg, inicio, fimExcl, (data, canal, etapa, deal) => {
    if (!etapas || etapas.includes(etapa)) out.push({ canal, etapa, data, deal });
  });
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

// ---------------------------------------------------------------- visões do funil
// "Leads do mês" (recorte "mes"): só leads criados no mesmo mês do evento. "Todos os leads" (padrão):
// qualquer lead. No Inbound, a qualificação separa MQL e não MQL (lead falso nunca é MQL). Cada visão é
// gravada em funil_realizado com a etapa prefixada (ex.: "mes:mql:conectados"); sem prefixo = padrão.

export type Recorte = "todos" | "mes";
export type Qualificacao = "completo" | "mql" | "nao_mql";

/** Etapa gravada para uma visão. A qualificação só existe no Inbound. Com `pessoa` (usuário do Pipefácil),
 *  a visão daquele pré-vendas: "pv:<id>:" na frente de tudo. */
export function chaveVisao(etapa: string, canal: string, recorte: Recorte, qualificacao: Qualificacao, pessoa?: string | null): string {
  const q = canal === "inbound" && qualificacao !== "completo" ? `${qualificacao}:` : "";
  return `${pessoa ? `pv:${pessoa}:` : ""}${recorte === "mes" ? "mes:" : ""}${q}${etapa}`;
}

/** Etapa sem o prefixo da visão. */
export function etapaBase(chave: string): string {
  return chave.slice(chave.lastIndexOf(":") + 1);
}

/** Cada contagem do realizado em todas as visões (a padrão e as prefixadas), com o lead. */
export function detalharVisoes(deals: DealCrm[], eventos: EventoCrm[], cfg: ConfigCrm, inicio: string, fimExcl: string): LeadDoRealizado[] {
  const out: LeadDoRealizado[] = [];
  percorrerRealizado(deals, eventos, cfg, inicio, fimExcl, (data, canal, etapa, deal) => {
    const doMes = !!deal.criado_em && dataBR(deal.criado_em).slice(0, 7) === data.slice(0, 7);
    const add = (e: string) => out.push({ canal, etapa: e, data, deal });
    add(etapa);
    if (doMes) add(`mes:${etapa}`);
    if (canal === "inbound" && etapa !== "mql") {
      const q: Qualificacao = !ehLeadFalso(deal, cfg) && ehMql(deal, cfg) ? "mql" : "nao_mql";
      add(`${q}:${etapa}`);
      if (doMes) add(`mes:${q}:${etapa}`);
    }
  });
  return out;
}

/** Soma por dia, canal e etapa (de detalharVisoes ou leadsDoRealizado). */
export function contarPorDia(itens: { data: string; canal: CanalPortal; etapa: string }[]): ContagemDia[] {
  const acc = new Map<string, ContagemDia>();
  for (const { data, canal, etapa } of itens) {
    const k = `${data}|${canal}|${etapa}`;
    const atual = acc.get(k);
    if (atual) atual.quantidade += 1;
    else acc.set(k, { data, canal, etapa, quantidade: 1 });
  }
  return Array.from(acc.values());
}

// ---------------------------------------------------------------- ranking de pré-vendas
/** Responsável num instante, pelo histórico [instante, responsável] do lead (`folgaMs` depois do instante). */
export function responsavelEm(hist: [string, string][] | undefined, iso: string, folgaMs = 1000): string | null {
  if (!hist) return null;
  let r: string | null = null;
  for (const [em, quem] of hist) if (Date.parse(em) <= Date.parse(iso) + folgaMs) r = quem;
  return r;
}

/** Quem agendou: o responsável quando o lead chegou em Reunião Agendada; sem histórico, o pré-vendas do
 *  lead, senão o responsável atual. */
export function responsavelNoAgendamento(d: DealCrm, marcos: Partial<Record<Nivel, string>> | undefined, hist: [string, string][] | undefined): string | null {
  const t = marcos?.[NIVEL.agendada];
  return (t ? responsavelEm(hist, t) : null) ?? d.sdr_user_id ?? d.responsavel_user_id;
}
export type PessoaRanking = { pessoa: string | null; leads: { nome: string; data: string; canal: CanalPortal; origem?: string | null }[] };

/**
 * Ranking de pré-vendas por etapa (agendadas, realizadas, vendas): cada contagem do mês vai para quem era o
 * responsável pelo lead no momento em que ele chegou em Reunião Agendada (quem agendou); a realizada e a
 * venda (venda originada) vão para o mesmo pré-vendas. `responsaveis`: por lead, [instante, responsável] de cada evento do histórico.
 * Sem histórico do momento: o campo pré-vendas do lead, senão o responsável atual. Do maior para o menor.
 */
export function rankingPreVendas(
  itens: LeadDoRealizado[],
  eventos: EventoCrm[],
  cfg: ConfigCrm,
  responsaveis: Map<string, [string, string][]>,
  etapas: string[] = ["reunioes_agendadas", "reunioes_realizadas", "vendas"],
): Record<string, PessoaRanking[]> {
  const marcos = marcosPorLead(eventos, cfg);
  const quemAgendou = (d: DealCrm) => responsavelNoAgendamento(d, marcos.get(d.deal_id), responsaveis.get(d.deal_id));
  const out: Record<string, PessoaRanking[]> = {};
  for (const etapa of etapas) {
    const porPessoa = new Map<string | null, PessoaRanking>();
    for (const it of itens) {
      if (it.etapa !== etapa) continue;
      const pessoa = quemAgendou(it.deal);
      const p = porPessoa.get(pessoa) ?? { pessoa, leads: [] };
      p.leads.push({ nome: it.deal.nome || it.deal.empresa || "(sem nome)", data: it.data, canal: it.canal, origem: it.deal.origem ?? null });
      porPessoa.set(pessoa, p);
    }
    out[etapa] = Array.from(porPessoa.values())
      .map((p) => ({ ...p, leads: p.leads.sort((a, b) => a.data.localeCompare(b.data)) }))
      .sort((a, b) => b.leads.length - a.leads.length);
  }
  return out;
}

/**
 * Funil próprio do negócio (etapas do funil do CRM, sem canais). Mesma regra de contagem: o lead conta
 * na etapa no dia em que chegou pela primeira vez nela ou numa etapa à frente; a etapa de entrada
 * (sem `stages`) conta pela criação do lead. Etapas fora do funil (perda) não contam. Canal gravado: outbound.
 */
export function calcularFunilUnico(deals: DealCrm[], eventos: EventoCrm[], funil: FunilUnico, inicio: string, fimExcl: string): ContagemDia[] {
  const posicao = new Map<string, number>();
  funil.etapas.forEach((e, i) => e.stages.forEach((s) => posicao.set(s, i)));
  const entradas = funil.etapas.map((e, i) => (e.stages.length === 0 ? i : -1)).filter((i) => i >= 0);

  // Primeiro instante em que cada lead chegou em cada etapa (ou além).
  const chegada = new Map<string, (string | undefined)[]>();
  for (const ev of eventos) {
    const pos = ev.stage_id ? posicao.get(ev.stage_id) : undefined;
    if (pos === undefined) continue;
    const marcas = chegada.get(ev.deal_id) ?? [];
    for (let i = 0; i <= pos; i++) {
      if (entradas.includes(i)) continue;
      const t = marcas[i];
      if (!t || Date.parse(ev.ocorrido_em) < Date.parse(t)) marcas[i] = ev.ocorrido_em;
    }
    chegada.set(ev.deal_id, marcas);
  }

  const acc = new Map<string, ContagemDia>();
  const somar = (instante: string, etapa: string) => {
    const data = dataBR(instante);
    if (data < inicio || data >= fimExcl) return;
    const k = `${data}|${etapa}`;
    const atual = acc.get(k);
    if (atual) atual.quantidade += 1;
    else acc.set(k, { data, canal: "outbound", etapa, quantidade: 1 });
  };
  for (const d of deals) {
    if (d.criado_em) for (const i of entradas) somar(d.criado_em, funil.etapas[i].chave);
    const marcas = chegada.get(d.deal_id);
    if (!marcas) continue;
    marcas.forEach((t, i) => {
      if (t) somar(t, funil.etapas[i].chave);
    });
  }
  return Array.from(acc.values());
}

export type VendaCrm = {
  deal_id: string;
  data: string;
  /** Canal do funil, ou "alternativo" (canal do CRM fora dos funis, em canal_origem). */
  canal: CanalPortal | "alternativo";
  canal_origem: string | null;
  valor: number;
  mrr: number | null;
  cliente: string | null;
  produto: string | null;
  closer_user_id: string | null;
  sdr_user_id: string | null;
};

/** Leads ganhos no funil de vendas → vendas do portal ("Valor" do CRM = valor antecipado = recebido). */
/**
 * Leads ganhos no funil de vendas → vendas do portal. A venda é de quem era o responsável pelo lead
 * no momento do Ganho (`responsavelNoGanho`, lido do histórico); sem histórico, o responsável atual.
 * O campo Closer registra quem fez a call e não decide o dono da venda (regra de 16/11/2026).
 */
export function vendasGanhas(deals: DealCrm[], eventos: EventoCrm[], cfg: ConfigCrm, responsavelNoGanho?: Map<string, string>): VendaCrm[] {
  const chegada = marcosPorLead(eventos, cfg);
  const out: VendaCrm[] = [];
  for (const d of deals) {
    if (d.status !== "won" || !d.stage_id || !cfg.stagesGanhoVenda.includes(d.stage_id)) continue;
    // Canal fora dos funis (Social Selling, Google, Parceiros…): venda de canal alternativo, conta no recebido.
    const canal = canalPortal(d, cfg) ?? (d.canal ? "alternativo" : null);
    if (!canal) continue;
    // Canal com closers definidos (ex.: Social Selling na Acrópole): só entra se quem fez a call for do time.
    const permitidos = canal === "alternativo" && d.canal ? cfg.closersPorCanal?.[d.canal] : undefined;
    if (permitidos) {
      const daCall = d.closer_user_id ?? responsavelNoGanho?.get(d.deal_id) ?? d.responsavel_user_id;
      if (!daCall || !permitidos.includes(daCall)) continue;
    }
    const quando = chegada.get(d.deal_id)?.[NIVEL.venda] ?? d.fechado_em;
    if (!quando) continue;
    out.push({
      deal_id: d.deal_id,
      data: dataBR(quando),
      canal,
      canal_origem: canal === "alternativo" ? d.canal : null,
      valor: Number(d.valor ?? 0),
      mrr: d.mrr != null && Number(d.mrr) > 0 ? Number(d.mrr) : null,
      cliente: d.empresa || d.nome,
      produto: d.produtos && d.produtos.length > 0 ? d.produtos.join(", ") : null,
      closer_user_id: responsavelNoGanho?.get(d.deal_id) ?? d.responsavel_user_id,
      sdr_user_id: d.sdr_user_id,
    });
  }
  return out;
}

// ---------------------------------------------------------------- funil por pré-vendas
const ETAPAS_DO_AGENDAMENTO = ["reunioes_agendadas", "reunioes_realizadas", "propostas", "vendas"];

/**
 * Quem leva cada contagem no funil por pré-vendas (as regras do Pace e do sistema antigo): da reunião
 * agendada em diante, quem era o responsável pelo lead no agendamento (a realizada, a proposta e a venda
 * vão para quem agendou); leads e MQL, o responsável na criação; conectados, o responsável na conexão.
 * Sem histórico do momento, o pré-vendas do lead, senão o responsável atual. Referidos não têm pré-vendas.
 */
export function pessoaDaContagem(
  it: LeadDoRealizado,
  marcos: Partial<Record<Nivel, string>> | undefined,
  hist: [string, string][] | undefined,
): string | null {
  if (it.canal === "indicacao") return null;
  const d = it.deal;
  const base = etapaBase(it.etapa);
  if (ETAPAS_DO_AGENDAMENTO.includes(base)) return responsavelNoAgendamento(d, marcos, hist);
  if (base === "conectados") {
    const t = marcos?.[NIVEL.conectado];
    return (t ? responsavelEm(hist, t) : null) ?? d.sdr_user_id ?? d.responsavel_user_id;
  }
  if (base === "leads" || base === "mql") return (d.criado_em ? responsavelEm(hist, d.criado_em) : null) ?? d.responsavel_user_id;
  return null;
}

/** As contagens de cada visão também na visão do pré-vendas que as leva ("pv:<id>:" na etapa). */
export function creditarPessoas(itens: LeadDoRealizado[], eventos: EventoCrm[], cfg: ConfigCrm, responsaveis: Map<string, [string, string][]>): LeadDoRealizado[] {
  const marcos = marcosPorLead(eventos, cfg);
  const out: LeadDoRealizado[] = [];
  for (const it of itens) {
    const quem = pessoaDaContagem(it, marcos.get(it.deal.deal_id), responsaveis.get(it.deal.deal_id));
    if (quem) out.push({ ...it, etapa: `pv:${quem}:${it.etapa}` });
  }
  return out;
}
