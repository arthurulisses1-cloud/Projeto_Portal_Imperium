// Cálculo puro do realizado dos funis a partir do espelho do CRM (sem banco, sem rede — testado).
//
// Regra de contagem: um lead conta numa etapa no dia em que, pela primeira vez, chegou
// nela OU numa etapa mais avançada (lead que pula etapa ou já nasce adiantado também conta).
// O canal é o campo Canal do lead: outbound, trafego (= Inbound) ou indicacao.
import { ETAPAS_PORTAL, NIVEL, NIVEL_DA_ETAPA, type CanalPortal, type ConfigCrm, type CriterioMql, type Nivel } from "./config";

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

export type EventoCrm = { deal_id: string; stage_id: string | null; ocorrido_em: string };

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

/** Primeiro instante em que cada lead atingiu cada nível (ou mais). */
export function primeiraChegada(eventos: EventoCrm[], cfg: ConfigCrm): Map<string, Partial<Record<Nivel, string>>> {
  const out = new Map<string, Partial<Record<Nivel, string>>>();
  for (const e of eventos) {
    const nivel = e.stage_id ? cfg.niveis[e.stage_id] : undefined;
    if (!nivel) continue;
    const atual = out.get(e.deal_id) ?? {};
    for (let n = 1 as Nivel; n <= nivel; n = (n + 1) as Nivel) {
      const t = atual[n];
      if (!t || Date.parse(e.ocorrido_em) < Date.parse(t)) atual[n] = e.ocorrido_em;
    }
    out.set(e.deal_id, atual);
  }
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
  const chegada = primeiraChegada(eventos, cfg);
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
  const chegada = primeiraChegada(eventos, cfg);
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
