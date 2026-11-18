// Base da Auditoria comercial (Dados → Auditoria): um registro por lead que chegou a Reunião Agendada
// (ou além), com os campos do CRM, os marcos (com a MESMA regra do Dashboard), a situação da reunião e a
// linha do tempo. Montada na sincronização e gravada em integracao_estado ("auditoria:<slug>").
import type { ConfigCrm } from "./config";
import { NIVEL } from "./config";
import { INICIO_HISTORICO } from "./config";
import { canalPortal, ehLeadFalso, ehMql, marcosPorLead, responsavelEm, responsavelNoAgendamento, type DealCrm, type EventoCrm } from "./realizado";

/** Situação da reunião: a acontecer, realizada, no-show (passou pelo No Show e não realizou) ou
 *  cancelada (perdida antes da reunião). */
export type SituacaoReuniao = "a_acontecer" | "realizada" | "no_show" | "cancelada";

export type PassoLead = { em: string; etapa: string; funil: string; quem: string | null; tipo: string };

export type LeadAuditoria = {
  id: string;
  seq: number | null;
  nome: string;
  empresa: string | null;
  canal: string;
  status: string;
  etapa: string;
  funil: string;
  responsavel: string | null;
  preVendas: string | null;
  closer: string | null;
  vendedor: string | null;
  faturamento: string | null;
  cargo: string | null;
  necessidade: string | null;
  timing: string | null;
  /** Texto do CRM de cada opção do BANT (ex.: "Proprietário", "Alta prioridade (agora ou até 15 dias)"). */
  faturamentoRotulo?: string | null;
  cargoRotulo?: string | null;
  timingRotulo?: string | null;
  rqa: string | null;
  /** Quando o closer não validou a RQA: os motivos (texto do CRM) e a justificativa. */
  rqaMotivos?: string[];
  rqaJustificativa?: string | null;
  temperatura: string | null;
  valor: number;
  mrr: number | null;
  produtos: string | null;
  previsao: string | null;
  motivoPerda: string | null;
  tags: string[];
  reuniaoMarcada: string | null;
  /** Quando o lead entrou (criação) e quando conectou (primeira vez em Conectado ou além). */
  criadoEm: string | null;
  conectadoEm: string | null;
  /** MQL pelas regras do negócio (só faz sentido no Inbound). */
  mql: boolean;
  agendadaEm: string | null;
  realizadaEm: string | null;
  propostaEm: string | null;
  vendaEm: string | null;
  noShowEm: string | null;
  perdidaEm: string | null;
  situacao: SituacaoReuniao;
  passos: PassoLead[];
};

export type AuditoriaGravada = { atualizado_em: string; leads: LeadAuditoria[] };

/** Deal do Pipefácil no que a auditoria lê além do espelho (campos personalizados, tags, previsão). */
export type ExtraDoDeal = {
  properties?: Record<string, unknown> | null;
  tags?: { name: string }[];
  expectedCloseAt?: string | null;
  lostReason?: string | null;
  closedAt?: string | null;
};

type Entrada = {
  deals: (DealCrm & { seq?: number })[];
  extras: Map<string, ExtraDoDeal>;
  eventos: EventoCrm[];
  cfg: ConfigCrm;
  /** Etapa (id) → nome e funil. */
  etapas: Map<string, { nome: string; funil: string }>;
  /** Lead → [instante, responsável] de cada evento do histórico. */
  responsaveis: Map<string, [string, string][]>;
  /** Lead → responsável no Ganho do funil de vendas (o dono da venda). */
  vendedores: Map<string, string>;
  /** Usuário do Pipefácil → nome. */
  nomes: Record<string, string>;
  /** Campo (slug) → valor → rótulo do CRM, para o texto das opções. */
  rotulos?: Record<string, Record<string, string>>;
};

const texto = (v: unknown): string | null => {
  if (Array.isArray(v)) return v.length ? v.map(String).join(", ") : null;
  return typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
};

/**
 * Monta a base (pura): os leads de canal do negócio que chegaram a Reunião Agendada ou além e, no Inbound,
 * também os que só entraram ou conectaram (desde o início do histórico), para a lista "Leads Inbound do
 * período". Lead falso fica fora (como no funil). A venda só conta com o lead ganho (venda desfeita não).
 */
export function montarAuditoria({ deals, extras, eventos, cfg, etapas, responsaveis, vendedores, nomes, rotulos = {} }: Entrada): LeadAuditoria[] {
  const rotulo = (campo: string | undefined, valor: string | null) => (campo && valor ? rotulos[campo]?.[valor] ?? null : null);
  const marcos = marcosPorLead(eventos, cfg);
  const porLead = new Map<string, EventoCrm[]>();
  for (const e of eventos) (porLead.get(e.deal_id) ?? porLead.set(e.deal_id, []).get(e.deal_id)!).push(e);
  const nome = (id: string | null | undefined) => (id ? nomes[id] ?? null : null);
  const ehNoShow = (stage: string | null) => !!stage && /no[\s-]?show/i.test(etapas.get(stage)?.nome ?? "");

  const out: LeadAuditoria[] = [];
  for (const d of deals) {
    const canal = canalPortal(d, cfg);
    const m = marcos.get(d.deal_id) ?? {};
    if (!canal || ehLeadFalso(d, cfg)) continue;
    const doInbound = canal === "inbound" && ((d.criado_em ?? "") >= INICIO_HISTORICO.slice(0, 10) || (m[NIVEL.conectado] ?? "") >= INICIO_HISTORICO.slice(0, 10));
    if (!m[NIVEL.agendada] && !doInbound) continue;
    const ex = extras.get(d.deal_id) ?? {};
    const p = ex.properties ?? {};
    const evs = (porLead.get(d.deal_id) ?? []).slice().sort((a, b) => Date.parse(a.ocorrido_em) - Date.parse(b.ocorrido_em));
    const hist = responsaveis.get(d.deal_id);

    // Passos: cada mudança de etapa (o Ganho/criação repetidos no mesmo instante saem).
    const passos: PassoLead[] = [];
    for (const e of evs) {
      if (!e.stage_id) continue;
      const anterior = passos[passos.length - 1];
      const info = etapas.get(e.stage_id) ?? { nome: "Etapa removida", funil: "" };
      if (anterior && anterior.etapa === info.nome && anterior.funil === info.funil && Math.abs(Date.parse(anterior.em) - Date.parse(e.ocorrido_em)) < 2000) continue;
      passos.push({ em: e.ocorrido_em, etapa: info.nome, funil: info.funil, quem: nome(responsavelEm(hist, e.ocorrido_em, 0)), tipo: e.tipo ?? "STAGE_CHANGED" });
    }
    const noShow = evs.find((e) => ehNoShow(e.stage_id))?.ocorrido_em ?? null;
    const realizada = m[NIVEL.realizada] ?? null;
    const perdida = d.status === "lost" ? ex.closedAt ?? d.fechado_em ?? null : null;
    const situacao: SituacaoReuniao = !m[NIVEL.agendada] ? "a_acontecer" : realizada ? "realizada" : noShow ? "no_show" : d.status === "lost" ? "cancelada" : "a_acontecer";
    const atual = d.stage_id ? etapas.get(d.stage_id) : undefined;

    out.push({
      id: d.deal_id,
      seq: d.seq ?? null,
      nome: d.nome || d.empresa || "(sem nome)",
      empresa: d.empresa,
      canal,
      status: d.status ?? "open",
      etapa: atual?.nome ?? "—",
      funil: atual?.funil ?? "—",
      responsavel: nome(d.responsavel_user_id),
      // Quem agendou; sem reunião, quem tinha o lead quando conectou (ou quando entrou).
      preVendas: nome(
        m[NIVEL.agendada]
          ? responsavelNoAgendamento(d, m, hist)
          : (m[NIVEL.conectado] ? responsavelEm(hist, m[NIVEL.conectado]!) : null) ?? (d.criado_em ? responsavelEm(hist, d.criado_em) : null) ?? d.sdr_user_id ?? d.responsavel_user_id,
      ),
      closer: nome(d.closer_user_id),
      vendedor: nome(vendedores.get(d.deal_id) ?? (m[NIVEL.venda] ? d.responsavel_user_id : null)),
      faturamento: d.faturamento,
      cargo: d.cargo,
      necessidade: texto(p.bant_necessidade),
      timing: texto(p.bant_timing),
      faturamentoRotulo: rotulo(cfg.campos.faturamento, d.faturamento),
      cargoRotulo: rotulo(cfg.campos.cargo, d.cargo),
      timingRotulo: rotulo("bant_timing", texto(p.bant_timing)),
      rqa: texto(p.rqa_validada),
      rqaMotivos: (Array.isArray(p.rqa_motivo_desqualificacao) ? p.rqa_motivo_desqualificacao : texto(p.rqa_motivo_desqualificacao)?.split(",") ?? [])
        .map((m) => String(m).trim())
        .filter(Boolean)
        .map((m) => rotulos.rqa_motivo_desqualificacao?.[m] ?? m),
      rqaJustificativa: texto(p.rqa_justificativa),
      temperatura: texto(p.temperatura),
      valor: Number(d.valor ?? 0),
      mrr: d.mrr != null && Number(d.mrr) > 0 ? Number(d.mrr) : null,
      produtos: texto(p.produtos),
      previsao: ex.expectedCloseAt ?? null,
      motivoPerda: ex.lostReason ?? null,
      tags: (ex.tags ?? []).map((t) => t.name),
      reuniaoMarcada: texto(p.reuniao_agendada),
      criadoEm: d.criado_em,
      conectadoEm: m[NIVEL.conectado] ?? null,
      mql: ehMql(d, cfg),
      agendadaEm: m[NIVEL.agendada] ?? null,
      realizadaEm: realizada,
      propostaEm: m[NIVEL.proposta] ?? null,
      vendaEm: d.status === "won" ? m[NIVEL.venda] ?? null : null,
      noShowEm: noShow,
      perdidaEm: perdida,
      situacao,
      passos: passos.slice(-40),
    });
  }
  return out.sort((a, b) => (b.agendadaEm ?? "").localeCompare(a.agendadaEm ?? ""));
}
