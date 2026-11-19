// Desfecho das reuniões agendadas no mês (Dashboard do negócio; regras do gestor comercial, 19/11/2026).
//
// Distribuição (situação atual, cada lead em uma única categoria, a soma fecha com as agendadas):
//   1. realizadas: a reunião aconteceu (inclusive depois de um no-show);
//   2. noShow: parado no No Show, ou perdido depois de um no-show sem realizar (= No-Show Não Recuperado);
//   3. aAcontecer: em aberto em Reunião Agendada com data de hoje em diante ou sem data (inclui o reagendado após no-show);
//   4. vencidas: em aberto em Reunião Agendada com a data já passada, sem atualização;
//   5. canceladas: perdido sem nunca ter dado no-show nem realizado.
// Indicadores, os dois sobre o total de leads únicos agendados (inclui futuras e canceladas):
//   - No-Show Não Recuperado = a categoria noShow;
//   - No-Show Histórico = quem passou pelo No Show ao menos uma vez depois de agendar, qualquer que seja a situação
//     atual (o histórico vem dos eventos do CRM e não se apaga). Sempre >= Não Recuperado.
// A lista de agendadas é a mesma do número do funil (com a visão e o filtro de pré-vendas); a situação de cada
// lead vem da base da Auditoria. O agendamento conta uma vez por lead (o reagendamento não cria outro).
import type { LeadEtapa } from "@/lib/funil-negocio";
import type { LeadAuditoria } from "@/lib/integracoes/auditoria";
import { lerDataReuniao } from "@/lib/sdr-negocio";

/** Lead de uma lista do card (ao passar o mouse): quem agendou e a data da reunião, quando há. */
export type LeadDesfecho = {
  nome: string;
  preVendas: string | null;
  reuniao: string | null;
  /** Leads com no-show: a situação atual (parado no No Show, perdido, reagendado ou realizada depois). */
  depois?: string;
};
export type CategoriaDesfecho = "realizadas" | "noShow" | "aAcontecer" | "vencidas" | "canceladas" | "semInfo";

export type IndicadorNoShow = { qtd: number; pct: number; leads: LeadDesfecho[] };

export type DesfechoAgendadas = {
  total: number;
  /** Quantos leads em cada categoria da distribuição (semInfo: agendada que não achou o lead na Auditoria). */
  qtd: Record<CategoriaDesfecho, number>;
  leads: Record<CategoriaDesfecho, LeadDesfecho[]>;
  naoRecuperado: IndicadorNoShow;
  historico: IndicadorNoShow;
};

const dataBR = (iso: string | null) => (!iso ? null : iso.length <= 10 ? iso : new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));

/** Situação atual de um lead que teve no-show. */
function depoisDoNoShow(l: LeadAuditoria): string {
  if (l.realizadaEm) return "realizada depois";
  if (l.status === "lost") return "perdido";
  if (l.situacao === "no_show") return "parado no No Show";
  return "reagendado";
}

/**
 * Cruza as agendadas do funil com a Auditoria (pura): pelo id do lead quando a lista o tem; nas listas gravadas
 * antes do id, pelo nome (preferindo o lead agendado no mesmo dia). Cada lead da Auditoria casa uma vez só.
 * null quando não há agendadas ou nenhuma casou (Auditoria ainda não gravada).
 */
export function resumirDesfechoAgendadas(agendadas: LeadEtapa[] | undefined, auditoria: LeadAuditoria[], hoje: string): DesfechoAgendadas | null {
  if (!agendadas || agendadas.length === 0 || auditoria.length === 0) return null;
  const porId = new Map(auditoria.map((l) => [l.id, l]));
  const porNome = new Map<string, LeadAuditoria[]>();
  for (const l of auditoria) if (l.agendadaEm) (porNome.get(l.nome) ?? porNome.set(l.nome, []).get(l.nome)!).push(l);
  const usados = new Set<string>();

  const leads: Record<CategoriaDesfecho, LeadDesfecho[]> = { realizadas: [], noShow: [], aAcontecer: [], vencidas: [], canceladas: [], semInfo: [] };
  const historico: LeadDesfecho[] = [];
  for (const a of agendadas) {
    let l = a.id ? porId.get(a.id) : undefined;
    if (!l && !a.id) {
      const livres = (porNome.get(a.nome) ?? []).filter((x) => !usados.has(x.id));
      l = livres.find((x) => dataBR(x.agendadaEm) === a.data) ?? livres[0];
    }
    if (!l || usados.has(l.id)) {
      leads.semInfo.push({ nome: a.nome, preVendas: a.preVendas ?? a.responsavel, reuniao: null });
      continue;
    }
    usados.add(l.id);
    const quando = lerDataReuniao(l.reuniaoMarcada);
    const dia = dataBR(quando);
    // No-show deste agendamento: passou pelo No Show depois de agendar (um No Show de antes de uma regressão não conta).
    const teveNoShow = !!l.noShowEm && (!l.agendadaEm || l.noShowEm >= l.agendadaEm);
    const lead: LeadDesfecho = { nome: l.nome, preVendas: l.preVendas, reuniao: quando, ...(teveNoShow ? { depois: depoisDoNoShow(l) } : {}) };
    if (teveNoShow) historico.push(lead);

    if (l.realizadaEm || l.situacao === "realizada") leads.realizadas.push(lead);
    else if (teveNoShow && (l.status === "lost" || l.situacao === "no_show")) leads.noShow.push(lead);
    else if (l.status === "lost") leads.canceladas.push(lead);
    else if (dia && dia < hoje) leads.vencidas.push(lead);
    else leads.aAcontecer.push(lead);
  }
  if (leads.semInfo.length === agendadas.length) return null;
  const total = agendadas.length;
  const qtd = Object.fromEntries(Object.entries(leads).map(([k, v]) => [k, v.length])) as Record<CategoriaDesfecho, number>;
  const indicador = (lista: LeadDesfecho[]): IndicadorNoShow => ({ qtd: lista.length, pct: lista.length / total, leads: lista });
  return { total, qtd, leads, naoRecuperado: indicador(leads.noShow), historico: indicador(historico) };
}
