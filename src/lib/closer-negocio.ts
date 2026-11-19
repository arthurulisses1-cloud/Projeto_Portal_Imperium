// Visão do Closer da Acrópole (Vorp): pace de recebido e de MRR, reuniões previstas, reuniões do dia e pace de
// reuniões realizadas. Pedido do Diretor, 17/11/2026 (Bruno Brito).
//
// De onde vem cada número:
//  - reuniões: a base da Auditoria comercial (Pipefácil). As do closer são as que têm o nome dele em "closer"
//    (mesmo vínculo usuário do Pipefácil → perfil do portal que o SDR usa);
//  - recebido e MRR: tabela vendas, onde a pessoa é quem fechou (profile_id). A meta de recebido é a da pessoa no
//    Pace do negócio; a de MRR é a meta de MRR do forecast dividida entre quem vende, na mesma proporção;
//  - meta de reuniões realizadas: a do forecast (todos os canais) dividida em partes iguais entre os closers.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditoriaGravada, LeadAuditoria } from "@/lib/integracoes/auditoria";
import { metaMrrForecast, metaSetupForecast } from "@/lib/forecast-negocios";
import { calcularPace, limitesDoMes, buscarPaceNegocios, type PaceCalculado } from "@/lib/pace-negocio";
import { TIMES_POR_CANAL, metasPorCanal } from "@/lib/pace-esforco";
import { lerDataReuniao, separarReunioes, statusRqa, usuarioCrmDoPerfil, type ReuniaoFutura, type StatusRqa } from "@/lib/sdr-negocio";

/** Cargos de closer no negócio (quem faz a reunião e fecha). */
export const CARGOS_CLOSER = ["closer", "executivo"];
export const SLUG_VORP = "vorp";
/** Negócios com a visão de closer (Mural, Comissão, Compromisso). No Match Sales o executivo agenda a própria reunião. */
export const SLUGS_PAINEL_CLOSER = ["vorp", "matchsales"];
export const ehPainelCloser = (slug: string) => SLUGS_PAINEL_CLOSER.includes(slug);

const dataBR = (iso: string | null) =>
  !iso ? null : iso.length <= 10 ? iso : new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const noMes = (iso: string | null, inicio: string, fimExcl: string) => !!iso && iso.slice(0, 10) >= inicio && iso.slice(0, 10) < fimExcl;

/** Reunião de hoje: horário, lead, SDR que agendou e como está. */
export type ReuniaoDoDia = {
  id: string;
  nome: string;
  empresa: string | null;
  canal: string;
  quando: string | null;
  quandoTexto: string | null;
  sdr: string | null;
  /** Com quem é a reunião, quando o lead foi repassado (visão do BDR/SDR). */
  com?: string | null;
  situacao: "a_acontecer" | "realizada" | "no_show";
  rqa: StatusRqa;
};

export type ResumoReunioesCloser = {
  /** Reuniões dele ainda por acontecer (de hoje em diante, ou sem data), da mais próxima para a mais distante. */
  previstas: ReuniaoFutura[];
  /** Reuniões para reagendar: a data já passou sem desfecho no CRM, ou o lead está em No Show. */
  reagendar: ReuniaoFutura[];
  /** Reuniões marcadas para hoje (qualquer situação, menos cancelada), por horário. */
  doDia: ReuniaoDoDia[];
  /** Reuniões que ele realizou no mês (pela data em que foram realizadas). */
  realizadasNoMes: number;
  /** Realizadas hoje. */
  realizadasHoje: number;
};

/** Resume as reuniões de um closer (pura). `hoje` = AAAA-MM-DD (Brasil). */
export function resumirReunioesCloser(leads: LeadAuditoria[], nomeCrm: string, ano: number, mes: number, hoje: string, donoDaReuniao = false): ResumoReunioesCloser {
  const { inicio, fim } = limitesDoMes(ano, mes);
  const fimExcl = new Date(Date.parse(fim + "T00:00:00Z") + 86400_000).toISOString().slice(0, 10);
  // Match Sales: o executivo é dono das reuniões que ele agendou (tocando ele ou levando para outro); o campo closer quase não é preenchido.
  const meus = leads.filter((l) => l.closer === nomeCrm || (donoDaReuniao && l.preVendas === nomeCrm));

  const { aAcontecer: previstas, reagendar } = separarReunioes(meus, hoje, (l, quando) => ({
    id: l.id,
    nome: l.nome,
    empresa: l.empresa,
    canal: l.canal,
    agendadaEm: dataBR(l.agendadaEm),
    quando,
    quandoTexto: quando ? null : l.reuniaoMarcada,
    sdr: l.preVendas,
  }));

  const doDia: ReuniaoDoDia[] = meus
    .filter((l) => (l.situacao === "a_acontecer" || l.situacao === "realizada" || l.situacao === "no_show") && dataBR(lerDataReuniao(l.reuniaoMarcada)) === hoje)
    .map((l) => {
      const quando = lerDataReuniao(l.reuniaoMarcada);
      return {
        id: l.id,
        nome: l.nome,
        empresa: l.empresa,
        canal: l.canal,
        quando,
        quandoTexto: quando ? null : l.reuniaoMarcada,
        sdr: l.preVendas,
        com: l.closer ?? (l.responsavel && l.responsavel !== l.preVendas ? l.responsavel : null),
        situacao: l.situacao as ReuniaoDoDia["situacao"],
        rqa: statusRqa(l.rqa),
      };
    })
    .sort((a, b) => (a.quando ?? "9999").localeCompare(b.quando ?? "9999"));

  return {
    previstas,
    reagendar,
    doDia,
    realizadasNoMes: meus.filter((l) => noMes(dataBR(l.realizadaEm), inicio, fimExcl)).length,
    realizadasHoje: meus.filter((l) => dataBR(l.realizadaEm) === hoje).length,
  };
}

/** Setup/implantação de uma venda: o "Valor da implantação" cadastrado no CRM (vendas.valor_implantacao); sem ele, 0 (pura). */
export function setupDaVenda(v: { valor_implantacao?: number | null }): number {
  return Math.max(0, Number(v.valor_implantacao ?? 0));
}

export type PainelCloser = {
  slug: string;
  /** Setup/implantação (Match Sales): parte da meta de recebido, com o realizado. null = negócio sem setup. */
  setup: PaceCalculado | null;
  nomeCrm: string | null;
  recebido: PaceCalculado;
  mrr: PaceCalculado;
  /** Pace de reuniões realizadas (meta do forecast dividida entre os closers). */
  realizadas: PaceCalculado;
  reunioes: ResumoReunioesCloser | null;
  atualizadoEm: string | null;
  vendasNoMes: number;
  /** Vendas, recebido e MRR de hoje. */
  hoje: { vendas: number; recebido: number; mrr: number };
};

/** Meta de MRR da pessoa: a do forecast na proporção da meta de recebido dela (pura). */
export function metaMrrDaPessoa(metaMrrNegocio: number, metaRecebidoPessoa: number | null, metaRecebidoNegocio: number): number {
  if (!(metaMrrNegocio > 0) || !(metaRecebidoPessoa && metaRecebidoPessoa > 0) || !(metaRecebidoNegocio > 0)) return 0;
  return (metaMrrNegocio * metaRecebidoPessoa) / metaRecebidoNegocio;
}

/** Lê tudo o que a visão do closer precisa. `admin`: só depois de conferir que a pessoa vista é do negócio. */
export async function buscarPainelCloser(
  admin: SupabaseClient,
  negocio: { id: string; slug: string },
  pessoa: { id: string; nome: string },
  ctx: { ano: number; mes: number; hoje: string },
): Promise<PainelCloser> {
  const { inicio, fim } = limitesDoMes(ctx.ano, ctx.mes);
  const fimExcl = new Date(Date.parse(fim + "T00:00:00Z") + 86400_000).toISOString().slice(0, 10);
  const [{ data: mb }, { data: pf }, { data: au }, { data: vendas }, { data: closers }, [pn]] = await Promise.all([
    admin.from("integracao_estado").select("valor").eq("chave", `pipefacil:${negocio.slug}:membros`).maybeSingle(),
    admin.from("integracao_estado").select("valor").eq("chave", `pipefacil:${negocio.slug}:perfis`).maybeSingle(),
    admin.from("integracao_estado").select("valor").eq("chave", `auditoria:${negocio.slug}`).maybeSingle(),
    admin.from("vendas").select("valor, mrr, data").eq("negocio_id", negocio.id).eq("profile_id", pessoa.id).gte("data", inicio).lt("data", fimExcl),
    admin.from("profile_negocios").select("profile_id").eq("negocio_id", negocio.id).in("cargo", CARGOS_CLOSER),
    buscarPaceNegocios(admin, ctx.ano, ctx.mes, ctx.hoje, [negocio.slug]),
  ]);

  const nomes = (mb?.valor as Record<string, string> | null) ?? {};
  const usuarioCrm = usuarioCrmDoPerfil((pf?.valor as Record<string, string> | null) ?? null, nomes, pessoa.id, pessoa.nome);
  const nomeCrm = usuarioCrm ? nomes[usuarioCrm] ?? null : null;
  const auditoria = (au?.valor as AuditoriaGravada | null) ?? null;

  const eu = pn?.pessoas.find((p) => p.id === pessoa.id);
  const recebidoMes = (vendas ?? []).reduce((s, v) => s + Number(v.valor ?? 0), 0);
  const mrrMes = (vendas ?? []).reduce((s, v) => s + Number(v.mrr ?? 0), 0);
  const base = { hoje: ctx.hoje, ano: ctx.ano, mes: ctx.mes };

  const metasRealizadas = Object.values(metasPorCanal(negocio.slug, ctx.ano, ctx.mes).reunioes_realizadas).reduce((s, v) => s + (v ?? 0), 0);
  // Vorp: a meta de reuniões realizadas se divide entre os closers; Match: entre quem agenda (time do negócio).
  const idsTime = new Set(Object.values(TIMES_POR_CANAL[negocio.slug] ?? {}).flat());
  const nClosers = negocio.slug !== SLUG_VORP && idsTime.size > 0 ? idsTime.size : Math.max(1, (closers ?? []).length);
  const reunioes = nomeCrm && auditoria ? resumirReunioesCloser(auditoria.leads ?? [], nomeCrm, ctx.ano, ctx.mes, ctx.hoje, negocio.slug !== SLUG_VORP) : null;

  const deHoje = (vendas ?? []).filter((v) => v.data === ctx.hoje);
  const metaSetupNegocio = metaSetupForecast(negocio.slug, ctx.ano, ctx.mes);
  // Lido à parte: antes da migration 0116 a coluna não existe e a leitura falha sem derrubar o resto do painel.
  const { data: implantacoes, error: erroImpl } = metaSetupNegocio > 0
    ? await admin.from("vendas").select("valor_implantacao").eq("negocio_id", negocio.id).eq("profile_id", pessoa.id).gte("data", inicio).lt("data", fimExcl)
    : { data: [], error: null };
  const setupMes = erroImpl ? 0 : (implantacoes ?? []).reduce((s, v) => s + setupDaVenda(v as { valor_implantacao?: number | null }), 0);
  return {
    slug: negocio.slug,
    setup: metaSetupNegocio > 0 ? calcularPace({ meta: metaMrrDaPessoa(metaSetupNegocio, eu?.meta ?? null, pn?.pace.meta ?? 0), recebido: setupMes, ...base }) : null,
    nomeCrm,
    recebido: calcularPace({ meta: eu?.meta ?? 0, recebido: recebidoMes, ...base }),
    mrr: calcularPace({ meta: metaMrrDaPessoa(metaMrrForecast(negocio.slug, ctx.ano, ctx.mes), eu?.meta ?? null, pn?.pace.meta ?? 0), recebido: mrrMes, ...base }),
    realizadas: calcularPace({ meta: metasRealizadas / nClosers, recebido: reunioes?.realizadasNoMes ?? 0, ...base }),
    reunioes,
    atualizadoEm: auditoria?.atualizado_em ?? null,
    vendasNoMes: (vendas ?? []).length,
    hoje: {
      vendas: deHoje.length,
      recebido: deHoje.reduce((s, v) => s + Number(v.valor ?? 0), 0),
      mrr: deHoje.reduce((s, v) => s + Number(v.mrr ?? 0), 0),
    },
  };
}

/** Setup/implantação do negócio inteiro no mês (meta do forecast e realizado), para o Mural do Head. null = negócio sem setup. */
export async function setupDoNegocio(
  admin: SupabaseClient,
  negocio: { id: string; slug: string },
  ctx: { ano: number; mes: number; hoje: string },
): Promise<PaceCalculado | null> {
  const meta = metaSetupForecast(negocio.slug, ctx.ano, ctx.mes);
  if (!(meta > 0)) return null;
  const { inicio, fim } = limitesDoMes(ctx.ano, ctx.mes);
  const fimExcl = new Date(Date.parse(fim + "T00:00:00Z") + 86400_000).toISOString().slice(0, 10);
  const { data, error } = await admin.from("vendas").select("valor_implantacao").eq("negocio_id", negocio.id).gte("data", inicio).lt("data", fimExcl).range(0, 19999);
  const realizado = error ? 0 : (data ?? []).reduce((s, v) => s + setupDaVenda(v as { valor_implantacao?: number | null }), 0);
  return calcularPace({ meta, recebido: realizado, hoje: ctx.hoje, ano: ctx.ano, mes: ctx.mes });
}

/** Vínculo de closer/executivo da pessoa num negócio com visão de closer (Acrópole, Match Sales). null = não tem. */
export async function vinculoCloser(
  supabase: SupabaseClient,
  profileId: string,
): Promise<{ id: string; slug: string; nome: string; equipe_nome: string | null } | null> {
  const { data } = await supabase
    .from("profile_negocios")
    .select("cargo, negocios(id, slug, nome, equipe_nome, status)")
    .eq("profile_id", profileId)
    .in("cargo", CARGOS_CLOSER);
  type N = { id: string; slug: string; nome: string; equipe_nome: string | null; status: string };
  const achado = ((data ?? []) as unknown as { negocios: N | N[] | null }[])
    .map((l) => (Array.isArray(l.negocios) ? l.negocios[0] : l.negocios))
    .find((n) => n && n.status === "ativo" && ehPainelCloser(n.slug));
  return achado ? { id: achado.id, slug: achado.slug, nome: achado.nome, equipe_nome: achado.equipe_nome } : null;
}
