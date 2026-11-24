// Painel do Vorp Finance (Mural do executivo e do Head): pace de R$, de entrevistas e de subidos, e o funil de
// leads em R$ por etapa. Entrevistas e subidos vêm de `entrevistas_leads` (formulário/planilha e Meus Leads).
import type { SupabaseClient } from "@supabase/supabase-js";
import { calcularPace, diasUteis, limitesDoMes, type PaceCalculado, type PaceNegocio } from "@/lib/pace-negocio";
import { funisDoMes } from "@/lib/funil-negocio";
import { definirExecutivo } from "@/lib/leads-finance";

export const SLUG_FINANCE = "vorp-finance";

export type LeadFinance = {
  id: string;
  lead_nome: string;
  data: string;
  status_followup: string;
  sdr_profile_id: string | null;
  closer_profile_id: string | null;
  subido_em: string | null;
  subido_por: string | null;
  sub_comissao_prevista: number | null;
  venda_valor_recebido: number | null;
  recusada_em: string | null;
  ultimo_movimento_em: string | null;
};

/** Etapas abertas do funil, na ordem do kanban. */
export const ETAPAS_FUNIL_FINANCE: { chave: string; label: string; status: string[] }[] = [
  { chave: "entrevista", label: "Entrevista", status: ["validacao_entrevista"] },
  { chave: "subido", label: "Subido", status: ["subido"] },
  { chave: "pendencia", label: "Resolvendo pendência", status: ["resolvendo_pendencia"] },
  { chave: "venda", label: "Venda aguardando aprovação", status: ["venda_pendente"] },
];

export type LeadNoFunil = { id: string; nome: string; valor: number | null; quem: string; dias: number };
export type EtapaFunilFinance = { chave: string; label: string; leads: LeadNoFunil[]; total: number };

export type PessoaFinance = {
  id: string;
  nome: string;
  cargo: string;
  recebido: number;
  paceReais: PaceCalculado | null;
  entrevistas: number;
  paceEntrevistas: PaceCalculado | null;
  subidos: number;
  paceSubidos: PaceCalculado | null;
};

/** Um dia do pace diário: o que entrou no dia, o acumulado e onde deveria estar (meta dividida pelos dias úteis). */
export type DiaFinance = { data: string; entrevistas: number; subidos: number; entrevistasAcum: number; subidosAcum: number; entrevistasIdeal: number; subidosIdeal: number };

export type PainelFinance = {
  /** Pace diário do time (chave "time") e de cada executivo (id). */
  diaria: Record<string, DiaFinance[]>;
  pessoas: PessoaFinance[];
  equipe: { reais: PaceCalculado; entrevistas: PaceCalculado; subidos: PaceCalculado };
  /** Meta individual (dividida igualmente entre os executivos) e do time no mês. */
  metas: { entrevistasPessoa: number; subidosPessoa: number; entrevistasTime: number; subidosTime: number };
  /** Funil aberto de todo o time; o executivo filtra o dele. */
  funil: EtapaFunilFinance[];
  /** Vendas do Matri sem o time do Finance: fora do recebido e da meta. */
  extra: { recebido: number; vendas: number } | null;
  atualizadoEm: string;
};

const CARGOS_EXECUTIVO = ["executivo", "closer"];

/** Metas de entrevistas e subidos do mês, a partir do funil do forecast (soma dos canais). */
export function metasEsforcoFinance(ano: number, mes: number, nExecutivos: number): PainelFinance["metas"] {
  let entrevistas = 0;
  let subidos = 0;
  for (const f of funisDoMes(SLUG_FINANCE, ano, mes)) {
    for (const e of f.etapas) {
      if (e.label === "Entrevistas") entrevistas += e.meta ?? 0;
      if (e.label === "Subidos") subidos += e.meta ?? 0;
    }
  }
  const n = Math.max(1, nExecutivos);
  return { entrevistasTime: Math.round(entrevistas), subidosTime: Math.round(subidos), entrevistasPessoa: Math.round(entrevistas / n), subidosPessoa: Math.round(subidos / n) };
}

/** Executivo do lead: o do Finance entre SDR e closer do formulário (ver definirExecutivo). */
export function executivoDoLead(l: Pick<LeadFinance, "sdr_profile_id" | "closer_profile_id">, membros: ReadonlySet<string>): string | null {
  return definirExecutivo(l.sdr_profile_id, l.closer_profile_id, membros).executivoId;
}

const diasEntre = (de: string, ate: string) => Math.max(0, Math.round((Date.parse(ate.slice(0, 10)) - Date.parse(de.slice(0, 10))) / 86400000));

/** Funil aberto com o R$ por etapa (comissão prevista; na venda aguardando aprovação, a comissão pedida) (pura). */
export function montarFunilFinance(leads: LeadFinance[], membros: ReadonlySet<string>, nomes: ReadonlyMap<string, string>, hoje: string): EtapaFunilFinance[] {
  return ETAPAS_FUNIL_FINANCE.map((et) => {
    const doas = leads
      .filter((l) => et.status.includes(l.status_followup))
      .map((l): LeadNoFunil => {
        const exec = executivoDoLead(l, membros);
        const valor = l.status_followup === "venda_pendente" ? l.venda_valor_recebido : l.sub_comissao_prevista;
        return { id: l.id, nome: l.lead_nome, valor: valor === null || valor === undefined ? null : Number(valor), quem: (exec && nomes.get(exec)) || "Sem executivo", dias: diasEntre(l.ultimo_movimento_em ?? l.data, hoje) };
      })
      .sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1) || a.nome.localeCompare(b.nome, "pt-BR"));
    return { chave: et.chave, label: et.label, leads: doas, total: doas.reduce((s, x) => s + (x.valor ?? 0), 0) };
  });
}

/** Contagens do mês por executivo: entrevistas (leads da data no mês, fora as recusadas) e subidos (subido_em no mês) (pura). */
export function contarEsforcoFinance(leads: LeadFinance[], membros: ReadonlySet<string>, inicio: string, fimExcl: string): { entrevistas: Map<string, number>; subidos: Map<string, number> } {
  const entrevistas = new Map<string, number>();
  const subidos = new Map<string, number>();
  for (const l of leads) {
    const exec = executivoDoLead(l, membros);
    if (l.data >= inicio && l.data < fimExcl && !l.recusada_em && exec) entrevistas.set(exec, (entrevistas.get(exec) ?? 0) + 1);
    if (l.subido_em && l.subido_em >= inicio && l.subido_em < fimExcl) {
      const quem = l.subido_por ?? exec;
      if (quem) subidos.set(quem, (subidos.get(quem) ?? 0) + 1);
    }
  }
  return { entrevistas, subidos };
}

/** Série dia a dia do mês até hoje de um conjunto de executivos (null = todos), com o ideal acumulado pela meta (pura). */
export function serieDiariaFinance(
  leads: LeadFinance[],
  membros: ReadonlySet<string>,
  filtro: string | null,
  ctx: { ano: number; mes: number; hoje: string },
  metas: { entrevistas: number; subidos: number },
): DiaFinance[] {
  const { inicio, fim } = limitesDoMes(ctx.ano, ctx.mes);
  const ate = ctx.hoje > fim ? fim : ctx.hoje;
  const ent = new Map<string, number>();
  const sub = new Map<string, number>();
  for (const l of leads) {
    const exec = executivoDoLead(l, membros);
    if (!l.recusada_em && exec && (!filtro || exec === filtro) && l.data >= inicio && l.data <= fim) ent.set(l.data, (ent.get(l.data) ?? 0) + 1);
    const quem = l.subido_por ?? exec;
    if (l.subido_em && quem && (!filtro || quem === filtro) && l.subido_em >= inicio && l.subido_em <= fim) sub.set(l.subido_em, (sub.get(l.subido_em) ?? 0) + 1);
  }
  const total = diasUteis(inicio, fim) || 1;
  const dias: DiaFinance[] = [];
  let ea = 0;
  let sa = 0;
  for (let c = inicio; c <= ate; c = new Date(Date.parse(c + "T12:00:00Z") + 86400000).toISOString().slice(0, 10)) {
    const e = ent.get(c) ?? 0;
    const s = sub.get(c) ?? 0;
    ea += e;
    sa += s;
    const decorridos = diasUteis(inicio, c);
    dias.push({ data: c, entrevistas: e, subidos: s, entrevistasAcum: ea, subidosAcum: sa, entrevistasIdeal: (metas.entrevistas * decorridos) / total, subidosIdeal: (metas.subidos * decorridos) / total });
  }
  return dias;
}

export async function buscarPainelFinance(
  admin: SupabaseClient,
  pace: PaceNegocio,
  ctx: { ano: number; mes: number; hoje: string },
): Promise<PainelFinance> {
  const { ano, mes, hoje } = ctx;
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimExcl = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
  const colunas = "id, lead_nome, data, status_followup, sdr_profile_id, closer_profile_id, subido_em, subido_por, sub_comissao_prevista, venda_valor_recebido, recusada_em, ultimo_movimento_em";
  const [{ data: doMes }, { data: abertos }] = await Promise.all([
    admin.from("entrevistas_leads").select(colunas).eq("negocio_id", pace.negocio.id).or(`and(data.gte.${inicio},data.lt.${fimExcl}),and(subido_em.gte.${inicio},subido_em.lt.${fimExcl})`).limit(5000),
    admin.from("entrevistas_leads").select(colunas).eq("negocio_id", pace.negocio.id).in("status_followup", ETAPAS_FUNIL_FINANCE.flatMap((e) => e.status)).limit(5000),
  ]);
  const membros = new Set(pace.pessoas.map((p) => p.id));
  const nomes = new Map(pace.pessoas.map((p) => [p.id, p.nome] as const));
  const executivos = pace.pessoas.filter((p) => CARGOS_EXECUTIVO.includes(p.cargo));
  const metas = metasEsforcoFinance(ano, mes, executivos.length);
  const cont = contarEsforcoFinance((doMes ?? []) as unknown as LeadFinance[], membros, inicio, fimExcl);

  const pessoas: PessoaFinance[] = executivos.map((p) => {
    const entrevistas = cont.entrevistas.get(p.id) ?? 0;
    const subidos = cont.subidos.get(p.id) ?? 0;
    return {
      id: p.id,
      nome: p.nome,
      cargo: p.cargo,
      recebido: p.recebido,
      paceReais: p.meta !== null ? calcularPace({ meta: p.meta, recebido: p.recebido, hoje, ano, mes }) : null,
      entrevistas,
      paceEntrevistas: calcularPace({ meta: metas.entrevistasPessoa, recebido: entrevistas, hoje, ano, mes }),
      subidos,
      paceSubidos: calcularPace({ meta: metas.subidosPessoa, recebido: subidos, hoje, ano, mes }),
    };
  });
  const totalEntrevistas = Array.from(cont.entrevistas.values()).reduce((s, n) => s + n, 0);
  const totalSubidos = Array.from(cont.subidos.values()).reduce((s, n) => s + n, 0);
  const doMesLista = (doMes ?? []) as unknown as LeadFinance[];
  const diaria: Record<string, DiaFinance[]> = { time: serieDiariaFinance(doMesLista, membros, null, ctx, { entrevistas: metas.entrevistasTime, subidos: metas.subidosTime }) };
  for (const p of executivos) diaria[p.id] = serieDiariaFinance(doMesLista, membros, p.id, ctx, { entrevistas: metas.entrevistasPessoa, subidos: metas.subidosPessoa });
  return {
    diaria,
    pessoas,
    equipe: {
      reais: pace.pace,
      entrevistas: calcularPace({ meta: metas.entrevistasTime, recebido: totalEntrevistas, hoje, ano, mes }),
      subidos: calcularPace({ meta: metas.subidosTime, recebido: totalSubidos, hoje, ano, mes }),
    },
    metas,
    funil: montarFunilFinance((abertos ?? []) as unknown as LeadFinance[], membros, nomes, hoje),
    extra: pace.extra,
    atualizadoEm: new Date().toISOString(),
  };
}
