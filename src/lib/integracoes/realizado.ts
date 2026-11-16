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
export function calcularRealizadoCrm(
  deals: DealCrm[],
  eventos: EventoCrm[],
  cfg: ConfigCrm,
  inicio: string,
  fimExcl: string,
): ContagemDia[] {
  const chegada = marcosPorLead(eventos, cfg);
  const acc = new Map<string, ContagemDia>();
  const somar = (data: string, canal: CanalPortal, etapa: string) => {
    if (data < inicio || data >= fimExcl) return;
    const k = `${data}|${canal}|${etapa}`;
    const atual = acc.get(k);
    if (atual) atual.quantidade += 1;
    else acc.set(k, { data, canal, etapa, quantidade: 1 });
  };

  for (const d of deals) {
    const canal = canalPortal(d, cfg);
    if (!canal) continue;
    const etapas = ETAPAS_PORTAL[canal];

    // Topo do funil: criação do lead (Inbound e Indicação). Alôs/Conexões do Outbound vêm do 3C.
    if (d.criado_em) {
      const dia = dataBR(d.criado_em);
      if (etapas.includes("leads")) somar(dia, canal, "leads");
      if (etapas.includes("mql") && ehMql(d, cfg)) somar(dia, canal, "mql");
      if (etapas.includes("leads_indicados")) somar(dia, canal, "leads_indicados");
    }

    const marcas = chegada.get(d.deal_id);
    if (!marcas) continue;
    for (const etapa of etapas) {
      const nivel = NIVEL_DA_ETAPA[etapa];
      if (!nivel) continue;
      const t = marcas[nivel];
      if (t) somar(dataBR(t), canal, etapa);
    }
  }
  return Array.from(acc.values());
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
  canal: CanalPortal;
  valor: number;
  mrr: number | null;
  cliente: string | null;
  produto: string | null;
  closer_user_id: string | null;
  sdr_user_id: string | null;
};

/** Leads ganhos no funil de vendas → vendas do portal ("Valor" do CRM = valor antecipado = recebido). */
export function vendasGanhas(deals: DealCrm[], eventos: EventoCrm[], cfg: ConfigCrm): VendaCrm[] {
  const chegada = marcosPorLead(eventos, cfg);
  const out: VendaCrm[] = [];
  for (const d of deals) {
    if (d.status !== "won" || !d.stage_id || !cfg.stagesGanhoVenda.includes(d.stage_id)) continue;
    const canal = canalPortal(d, cfg);
    if (!canal) continue;
    const quando = chegada.get(d.deal_id)?.[NIVEL.venda] ?? d.fechado_em;
    if (!quando) continue;
    out.push({
      deal_id: d.deal_id,
      data: dataBR(quando),
      canal,
      valor: Number(d.valor ?? 0),
      mrr: d.mrr != null && Number(d.mrr) > 0 ? Number(d.mrr) : null,
      cliente: d.empresa || d.nome,
      produto: d.produtos && d.produtos.length > 0 ? d.produtos.join(", ") : null,
      closer_user_id: d.closer_user_id ?? d.responsavel_user_id,
      sdr_user_id: d.sdr_user_id,
    });
  }
  return out;
}
