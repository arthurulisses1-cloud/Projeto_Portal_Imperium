// Funil de cada negócio (casca do dashboard): volumes e conversões planejados a
// partir do forecast. O realizado vem de funil_realizado (3C Plus + Pipefácil, ver
// src/lib/integracoes) nos negócios que já têm integração; nos demais fica vazio.
// Mapeamento de etapas (premissa): Finance usa Entrevistas e Subidos no lugar de
// Reunião e Proposta; Energy usa Contas subidas no lugar de Proposta.
import { PARAMETROS, RAMP_UP, indiceMes, vendasDoMes, type CanalFunil } from "@/lib/forecast-negocios";
import { CRM_POR_NEGOCIO, ETAPAS_PORTAL, TRESC_POR_NEGOCIO } from "@/lib/integracoes/config";

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
};

export type FunilDoCanal = { canal: CanalDoFunil; titulo: string; etapas: EtapaFunil[] };

const TITULO: Record<CanalDoFunil, string> = { outbound: "Outbound", inbound: "Inbound", indicacao: "Indicação" };

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
  if (p.outbound) funis.push({ canal: "outbound", titulo: TITULO.outbound, etapas: montar(etapasDe(slug, "outbound"), ETAPAS_PORTAL.outbound, p.outbound, ramp) });
  if (p.inbound) funis.push({ canal: "inbound", titulo: TITULO.inbound, etapas: montar(etapasDe(slug, "inbound"), ETAPAS_PORTAL.inbound, p.inbound, ramp) });
  if (p.referidos) {
    const diretas = vendasDoMes(p, i);
    const leads = (diretas.outbound + diretas.inbound) * p.referidos.leadsPorVenda;
    funis.push({
      canal: "indicacao",
      titulo: TITULO.indicacao,
      etapas: montar(["Leads indicados", "Reuniões realizadas", "Vendas"], ETAPAS_PORTAL.indicacao, { volume: leads / ramp, taxas: p.referidos.taxas }, ramp),
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
  if (TRESC_POR_NEGOCIO[slug]) ["outbound|alos", "outbound|conexoes"].forEach((k) => out.add(k));
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
