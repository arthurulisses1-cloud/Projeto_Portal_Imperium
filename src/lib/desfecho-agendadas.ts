// Desfecho das reuniões agendadas no mês (Dashboard do negócio, 19/11/2026): das agendadas de cada funil,
// quantas já foram realizadas, quantas deram no-show, quantas foram canceladas e quantas seguem em aberto
// (a acontecer ou para reagendar), com a taxa de no-show. A lista de agendadas é a mesma do número do funil
// (com a visão e o filtro de pré-vendas); a situação de cada reunião vem da base da Auditoria.
import type { LeadEtapa } from "@/lib/funil-negocio";
import type { LeadAuditoria } from "@/lib/integracoes/auditoria";
import { lerDataReuniao } from "@/lib/sdr-negocio";

/** Lead de um desfecho (lista ao passar o mouse): quem agendou e a data da reunião, quando há. */
export type LeadDesfecho = { nome: string; preVendas: string | null; reuniao: string | null };
export type CategoriaDesfecho = "realizadas" | "noShow" | "canceladas" | "aAcontecer" | "reagendar" | "semInfo";

export type DesfechoAgendadas = {
  total: number;
  realizadas: number;
  noShow: number;
  canceladas: number;
  /** Em aberto com data de hoje em diante (ou sem data). */
  aAcontecer: number;
  /** Em aberto com a data da reunião já passada, sem desfecho no CRM. */
  reagendar: number;
  /** Agendadas que não acharam o lead na Auditoria. */
  semInfo: number;
  /** No-show ÷ (realizadas + no-show); null sem nenhuma reunião com desfecho. */
  pctNoShow: number | null;
  /** Os leads de cada desfecho, na ordem das agendadas. */
  leads: Record<CategoriaDesfecho, LeadDesfecho[]>;
};

const dataBR = (iso: string | null) => (!iso ? null : iso.length <= 10 ? iso : new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));

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

  const r: DesfechoAgendadas = {
    total: agendadas.length,
    realizadas: 0,
    noShow: 0,
    canceladas: 0,
    aAcontecer: 0,
    reagendar: 0,
    semInfo: 0,
    pctNoShow: null,
    leads: { realizadas: [], noShow: [], canceladas: [], aAcontecer: [], reagendar: [], semInfo: [] },
  };
  const contar = (c: CategoriaDesfecho, lead: LeadDesfecho) => {
    r[c]++;
    r.leads[c].push(lead);
  };
  for (const a of agendadas) {
    let l = a.id ? porId.get(a.id) : undefined;
    if (!l && !a.id) {
      const livres = (porNome.get(a.nome) ?? []).filter((x) => !usados.has(x.id));
      l = livres.find((x) => dataBR(x.agendadaEm) === a.data) ?? livres[0];
    }
    if (!l || usados.has(l.id)) {
      contar("semInfo", { nome: a.nome, preVendas: a.preVendas ?? a.responsavel, reuniao: null });
      continue;
    }
    usados.add(l.id);
    const quando = lerDataReuniao(l.reuniaoMarcada);
    const dia = dataBR(quando);
    const lead: LeadDesfecho = { nome: l.nome, preVendas: l.preVendas, reuniao: quando };
    if (l.situacao === "realizada") contar("realizadas", lead);
    else if (l.situacao === "no_show") contar("noShow", lead);
    else if (l.situacao === "cancelada") contar("canceladas", lead);
    else if (dia && dia < hoje) contar("reagendar", lead);
    else contar("aAcontecer", lead);
  }
  if (r.semInfo === r.total) return null;
  const comDesfecho = r.realizadas + r.noShow;
  r.pctNoShow = comDesfecho > 0 ? r.noShow / comDesfecho : null;
  return r;
}
