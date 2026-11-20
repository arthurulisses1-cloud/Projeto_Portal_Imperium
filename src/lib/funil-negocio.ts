// Funil de cada negócio (casca do dashboard): volumes e conversões planejados a
// partir do forecast. O realizado vem de funil_realizado (3C Plus + Pipefácil, ver
// src/lib/integracoes) nos negócios que já têm integração; nos demais fica vazio.
// Mapeamento de etapas (premissa): Finance usa Entrevistas e Subidos no lugar de
// Reunião e Proposta; Energy usa Contas subidas no lugar de Proposta.
import { PARAMETROS, RAMP_UP, indiceMes, vendasDoMes, type CanalFunil } from "@/lib/forecast-negocios";
import { CRM_POR_NEGOCIO, ETAPAS_PORTAL, TAXA_TENTATIVA_ALO, TRESC_POR_NEGOCIO } from "@/lib/integracoes/config";
import { chaveVisao, type Qualificacao, type Recorte } from "@/lib/integracoes/realizado";

export type CanalDoFunil = "outbound" | "inbound" | "indicacao";

export type EtapaFunil = {
  /** Chave estável da etapa (ver ETAPAS_PORTAL em integracoes/config.ts). */
  chave: string;
  label: string;
  /** Volume previsto no mês (com ramp-up); null = etapa sem meta (funil próprio do CRM). */
  meta: number | null;
  /** Conversão prevista desde a etapa anterior (null na 1ª etapa). */
  conversaoMeta: number | null;
  /** Preenchido pela integração; null = aguardando. */
  realizado: number | null;
  /** Os leads por trás do realizado (agendadas, realizadas, propostas e vendas do CRM). */
  leads?: LeadEtapa[];
  /** Etapas do 3C (tentativas, alôs, conexões) na visão do time: o realizado de cada pré-vendas (usuário do
   *  Pipefácil), do maior para o menor. */
  porPessoa?: { id: string; quantidade: number }[];
};

/** Lead que compõe o realizado de uma etapa: aparece ao passar o mouse no número. */
export type LeadEtapa = {
  /** Id do lead no CRM; ausente nas listas gravadas antes de 19/11/2026. */
  id?: string;
  nome: string;
  responsavel: string | null;
  preVendas: string | null;
  data: string;
  /** Origem do lead quando difere do canal (campo "Origem do lead" do CRM, ex.: "trafego"). */
  origem?: string | null;
  /** Faixa de faturamento do lead (valor do CRM); ausente nas listas gravadas antes de 18/11/2026. */
  faturamento?: string | null;
};

export type FunilDoCanal = { canal: CanalDoFunil; titulo: string; etapas: EtapaFunil[] };

const TITULO: Record<CanalDoFunil, string> = { outbound: "Outbound", inbound: "Tráfego Pago", indicacao: "Referidos" };

function etapasDe(slug: string, canal: "outbound" | "inbound"): string[] {
  const reuniao = slug === "vorp-finance" ? "Entrevistas" : "Reuniões";
  const proposta = slug === "vorp-finance" ? "Subidos" : slug === "vorp-energy" ? "Contas subidas" : "Propostas";
  const meio = [`${reuniao} agendadas`, `${reuniao} realizadas`, proposta, "Vendas"].map((l) => (l === "Entrevistas realizadas" ? "Entrevistas" : l));
  return canal === "outbound" ? ["Alôs", "Conexões", ...meio] : ["Leads", "MQL", "Conectados", ...meio];
}

function montar(labels: string[], chaves: string[], c: CanalFunil, ramp: number): EtapaFunil[] {
  let v = c.volume * ramp;
  return labels.map((label, i) => {
    if (i > 0) v *= c.taxas[i - 1];
    return { chave: chaves[i] ?? label, label, meta: v, conversaoMeta: i === 0 ? null : c.taxas[i - 1], realizado: null };
  });
}

/** Funis planejados do mês, um por canal que o negócio tem. */
export function funisDoMes(slug: string, ano: number, mes: number): FunilDoCanal[] {
  const p = PARAMETROS[slug];
  const i = indiceMes(ano, mes);
  if (!p || i < 0) return [];
  const ramp = RAMP_UP[`${ano}-${String(mes).padStart(2, "0")}`] ?? 1;
  const funis: FunilDoCanal[] = [];
  if (p.outbound) {
    let etapas = montar(etapasDe(slug, "outbound"), ETAPAS_PORTAL.outbound, p.outbound, ramp);
    // Finance (2026-11-17): sem Alôs, Conexões e Entrevistas agendadas — o funil começa em Entrevistas
    // (vindas da planilha do formulário). A meta de Entrevistas segue a do forecast (já passou pelas 3 etapas).
    if (slug === "vorp-finance") etapas = etapas.slice(3).map((e, idx) => (idx === 0 ? { ...e, conversaoMeta: null } : e));
    // Negócios com discador (3C): Tentativas antes de Alôs (20/11/2026). O forecast não tem tentativas: a meta
    // é a de alôs dividida pela conversão ideal de tentativa para alô (15%), que vira a meta da conversão.
    if (TRESC_POR_NEGOCIO[slug] && etapas[0]?.chave === "alos") {
      const alos = etapas[0];
      etapas = [
        { chave: "tentativas", label: "Tentativas", meta: alos.meta === null ? null : alos.meta / TAXA_TENTATIVA_ALO, conversaoMeta: null, realizado: null },
        { ...alos, conversaoMeta: TAXA_TENTATIVA_ALO },
        ...etapas.slice(1),
      ];
    }
    funis.push({ canal: "outbound", titulo: TITULO.outbound, etapas });
  }
  if (p.inbound) funis.push({ canal: "inbound", titulo: TITULO.inbound, etapas: montar(etapasDe(slug, "inbound"), ETAPAS_PORTAL.inbound, p.inbound, ramp) });
  if (p.referidos) {
    const diretas = vendasDoMes(p, i);
    const leads = (diretas.outbound + diretas.inbound) * p.referidos.leadsPorVenda;
    funis.push({
      canal: "indicacao",
      titulo: TITULO.indicacao,
      etapas: montar(["Leads referidos", "Reuniões realizadas", "Vendas"], ETAPAS_PORTAL.indicacao, { volume: leads / ramp, taxas: p.referidos.taxas }, ramp),
    });
  }
  return funis;
}

export type LinhaRealizado = { canal: string; etapa: string; quantidade: number };

/**
 * Funil próprio do negócio (ex.: Energy = etapas do Inside Sales no Pipefácil), no lugar dos funis por
 * canal do forecast. Sem meta: o forecast não tem essas etapas. null = o negócio usa os funis por canal.
 */
export function funilUnicoDoNegocio(slug: string): FunilDoCanal | null {
  const unico = CRM_POR_NEGOCIO[slug]?.funilUnico;
  if (!unico) return null;
  return {
    canal: "outbound",
    titulo: unico.titulo,
    etapas: unico.etapas.map((e) => ({ chave: e.chave, label: e.label, meta: null, conversaoMeta: null, realizado: null })),
  };
}

/** Etapas que a integração do negócio alimenta (as demais continuam sem realizado). */
export function etapasIntegradas(slug: string): Set<string> {
  const out = new Set<string>();
  if (TRESC_POR_NEGOCIO[slug]) ["outbound|tentativas", "outbound|alos", "outbound|conexoes"].forEach((k) => out.add(k));
  const unico = CRM_POR_NEGOCIO[slug]?.funilUnico;
  if (unico) {
    for (const e of unico.etapas) out.add(`outbound|${e.chave}`);
  } else if (CRM_POR_NEGOCIO[slug]) {
    for (const [canal, etapas] of Object.entries(ETAPAS_PORTAL)) {
      for (const e of etapas) if (!(canal === "outbound" && (e === "alos" || e === "conexoes"))) out.add(`${canal}|${e}`);
    }
  }
  return out;
}

/** Preenche o realizado dos funis com as linhas de funil_realizado do mês (pura). */
export function aplicarRealizado(funis: FunilDoCanal[], linhas: LinhaRealizado[], integradas: Set<string>): FunilDoCanal[] {
  const soma = new Map<string, number>();
  for (const l of linhas) soma.set(`${l.canal}|${l.etapa}`, (soma.get(`${l.canal}|${l.etapa}`) ?? 0) + Number(l.quantidade));
  return funis.map((f) => ({
    ...f,
    etapas: f.etapas.map((e) => {
      const k = `${f.canal}|${e.chave}`;
      return integradas.has(k) ? { ...e, realizado: soma.get(k) ?? 0 } : e;
    }),
  }));
}

/** Coloca em cada etapa a lista de leads do realizado (chave "canal|etapa"). */
export function aplicarLeads(funis: FunilDoCanal[], porEtapa: Map<string, LeadEtapa[]>): FunilDoCanal[] {
  if (porEtapa.size === 0) return funis;
  return funis.map((f) => ({
    ...f,
    etapas: f.etapas.map((e) => {
      const leads = porEtapa.get(`${f.canal}|${e.chave}`);
      return leads ? { ...e, leads } : e;
    }),
  }));
}

/** Etapas que vêm do 3C (contam ligações, não leads): iguais em todas as visões. */
const ETAPA_DO_DISCADOR = (canal: string, chave: string) => canal === "outbound" && (chave === "tentativas" || chave === "alos" || chave === "conexoes");

/**
 * Funis na visão escolhida (pura). Recorte: "todos" (qualquer lead) ou "mes" (só leads que entraram no
 * mês). Qualificação (só Inbound): "completo", "mql" (sem a etapa MQL; o funil começa nos leads MQL e a
 * meta segue o forecast a partir do MQL) ou "nao_mql" (sem meta: o forecast não prevê esse caminho).
 */
export function montarFunisDaVisao(
  funis: FunilDoCanal[],
  linhas: LinhaRealizado[],
  integradas: Set<string>,
  leads: Map<string, LeadEtapa[]>,
  recorte: Recorte,
  qualificacao: Qualificacao,
  /** Pré-vendas escolhido em cada funil: só os números dele, com a meta do canal dividida pelo time. */
  pessoas: Partial<Record<CanalDoFunil, { id: string; divisor: number }>> = {},
): FunilDoCanal[] {
  const soma = new Map<string, number>();
  for (const l of linhas) soma.set(`${l.canal}|${l.etapa}`, (soma.get(`${l.canal}|${l.etapa}`) ?? 0) + Number(l.quantidade));
  // Etapas do 3C por pré-vendas ("pv:<id>:tentativas"), para a lista ao passar o mouse na visão do time.
  const doDiscador = new Map<string, Map<string, number>>();
  for (const l of linhas) {
    const m = /^pv:([^:]+):([^:]+)$/.exec(l.etapa);
    if (!m || !ETAPA_DO_DISCADOR(l.canal, m[2])) continue;
    const k = `${l.canal}|${m[2]}`;
    const porId = doDiscador.get(k) ?? new Map<string, number>();
    porId.set(m[1], (porId.get(m[1]) ?? 0) + Number(l.quantidade));
    doDiscador.set(k, porId);
  }
  return funis.map((f) => {
    let etapas = f.etapas;
    const iMql = etapas.findIndex((e) => e.chave === "mql");
    if (f.canal === "inbound" && qualificacao !== "completo" && iMql > 0) {
      const mql = qualificacao === "mql";
      etapas = [
        { ...etapas[0], label: mql ? "Leads MQL" : "Leads não MQL", meta: mql ? etapas[iMql].meta : null, conversaoMeta: null },
        ...etapas.slice(iMql + 1).map((e) => (mql ? e : { ...e, meta: null, conversaoMeta: null })),
      ];
    }
    const pv = pessoas[f.canal];
    if (pv && pv.divisor > 1) etapas = etapas.map((e) => ({ ...e, meta: e.meta === null ? null : e.meta / pv.divisor }));
    return {
      ...f,
      etapas: etapas.map((e) => {
        if (!integradas.has(`${f.canal}|${e.chave}`)) return e;
        // Alôs e conexões vêm do 3C: iguais em todas as visões, só mudam com a pessoa.
        const chave = ETAPA_DO_DISCADOR(f.canal, e.chave) ? (pv ? `pv:${pv.id}:${e.chave}` : e.chave) : chaveVisao(e.chave, f.canal, recorte, qualificacao, pv?.id);
        const lista = leads.get(`${f.canal}|${chave}`);
        const pessoas = !pv && ETAPA_DO_DISCADOR(f.canal, e.chave) ? doDiscador.get(`${f.canal}|${e.chave}`) : undefined;
        const porPessoa = pessoas
          ? Array.from(pessoas, ([id, quantidade]) => ({ id, quantidade })).filter((x) => x.quantidade > 0).sort((a, b) => b.quantidade - a.quantidade)
          : undefined;
        return { ...e, realizado: soma.get(`${f.canal}|${chave}`) ?? 0, ...(lista ? { leads: lista } : {}), ...(porPessoa && porPessoa.length > 0 ? { porPessoa } : {}) };
      }),
    };
  });
}

/** Quantos leads do Inbound em cada qualificação (números dos botões), no recorte escolhido. */
export function leadsPorQualificacao(linhas: LinhaRealizado[], recorte: Recorte, pessoa?: string | null): Record<Qualificacao, number> {
  const total = (q: Qualificacao) =>
    linhas.filter((l) => l.canal === "inbound" && l.etapa === chaveVisao("leads", "inbound", recorte, q, pessoa)).reduce((s, l) => s + Number(l.quantidade), 0);
  return { completo: total("completo"), mql: total("mql"), nao_mql: total("nao_mql") };
}

/** Pré-vendas de cada canal com número no mês (pelas linhas "pv:<id>:…"), para o filtro do funil (pura). */
export function pessoasDoCanal(linhas: LinhaRealizado[], canal: CanalDoFunil): string[] {
  const ids = new Set<string>();
  for (const l of linhas) {
    if (l.canal !== canal || !l.etapa.startsWith("pv:") || !(Number(l.quantidade) > 0)) continue;
    ids.add(l.etapa.slice(3, l.etapa.indexOf(":", 3)));
  }
  return Array.from(ids);
}
