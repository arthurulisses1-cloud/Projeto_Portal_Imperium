// Funil de cada negócio (casca do dashboard): volumes e conversões planejados a
// partir do forecast. O realizado fica vazio até a integração com o Pipefácil.
// Mapeamento de etapas (premissa): Finance usa Entrevistas e Subidos no lugar de
// Reunião e Proposta; Energy usa Contas subidas no lugar de Proposta.
import { PARAMETROS, RAMP_UP, indiceMes, vendasDoMes, type CanalFunil } from "@/lib/forecast-negocios";

export type CanalDoFunil = "outbound" | "inbound" | "indicacao";

export type EtapaFunil = {
  label: string;
  /** Volume previsto no mês (com ramp-up). */
  meta: number;
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

function montar(labels: string[], c: CanalFunil, ramp: number): EtapaFunil[] {
  let v = c.volume * ramp;
  return labels.map((label, i) => {
    if (i > 0) v *= c.taxas[i - 1];
    return { label, meta: v, conversaoMeta: i === 0 ? null : c.taxas[i - 1], realizado: null };
  });
}

/** Funis planejados do mês, um por canal que o negócio tem. */
export function funisDoMes(slug: string, ano: number, mes: number): FunilDoCanal[] {
  const p = PARAMETROS[slug];
  const i = indiceMes(ano, mes);
  if (!p || i < 0) return [];
  const ramp = RAMP_UP[`${ano}-${String(mes).padStart(2, "0")}`] ?? 1;
  const funis: FunilDoCanal[] = [];
  if (p.outbound) funis.push({ canal: "outbound", titulo: TITULO.outbound, etapas: montar(etapasDe(slug, "outbound"), p.outbound, ramp) });
  if (p.inbound) funis.push({ canal: "inbound", titulo: TITULO.inbound, etapas: montar(etapasDe(slug, "inbound"), p.inbound, ramp) });
  if (p.referidos) {
    const diretas = vendasDoMes(p, i);
    const leads = (diretas.outbound + diretas.inbound) * p.referidos.leadsPorVenda;
    funis.push({
      canal: "indicacao",
      titulo: TITULO.indicacao,
      etapas: montar(["Leads indicados", "Reuniões realizadas", "Vendas"], { volume: leads / ramp, taxas: p.referidos.taxas }, ramp),
    });
  }
  return funis;
}
