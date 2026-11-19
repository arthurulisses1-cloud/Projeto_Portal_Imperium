// Maximus Energy: visão de cada executivo e do Head a partir da Sunne (cada vendedor é uma organização da rede).
// No Energy todo executivo faz o processo completo (sobe a conta, envia o contrato, acompanha a validação), então
// o funil e os paces são por vendedor, sem etapa de reunião. Pedido do Diretor, 18/11/2026.
//
//  - Funil: contas subidas no mês → contrato enviado → validação → ganhas ou perdidas (com o motivo da perda);
//  - kWh: consumo médio dos negócios fechados no mês (mesmo critério do Mural e do Pace);
//  - Faturamento gerado: 80% da primeira fatura de cada venda fechada (100% se o mês passar de 80 mil kWh).
import type { SupabaseClient } from "@supabase/supabase-js";
import { metaForecast, metaKwhForecast } from "@/lib/forecast-negocios";
import { calcularPace, type PaceCalculado } from "@/lib/pace-negocio";
import { percentuais } from "@/lib/comissao-negocio";
import { PCT_VORP_PRIMEIRA_FATURA, pctVorpPrimeiraFatura, primeiraFaturaSunne } from "@/lib/energy-canais";
import { PRODUTO_KWH, alcanceDoNegocio, assinaturasDoDiaEmCache, redeSunneEmCache, vendedoresSunne, type SunneDeal } from "@/lib/sunne";

export const SLUG_ENERGY = "vorp-energy";
/** Cargos que vendem no Energy: todos fazem o processo completo. */
export const CARGOS_VENDEM_ENERGY = ["pre_vendas", "closer", "executivo", "sdr", "bdr"];

export type MotivoPerda = { motivo: string; qtd: number };

export type FunilEnergia = {
  subidas: number;
  contrato: number;
  validacao: number;
  ganhas: number;
  /** Em validação ainda (com pendência, em análise ou aguardando retorno): nem ganha nem perdida. */
  emAndamento: number;
  /** kWh (consumo médio) e R$ (80% da primeira fatura) das contas ainda em validação. */
  emAndamentoKwh: number;
  emAndamentoValor: number;
  perdidas: number;
  /** Das perdidas, as que não chegaram à validação. */
  perdidasAntes: number;
  motivos: MotivoPerda[];
};

export type ProducaoEnergia = { kwh: number; faturamento: number; fechadas: number };

const MOTIVOS: Record<string, string> = {
  client_gave_up: "Cliente desistiu",
  no_contact: "Sem retorno do cliente",
  out_of_profile: "Fora de perfil",
  discarded_partner: "Descartado pelo parceiro",
  replaced: "Refeito (substituído)",
  duplicate: "Cadastro duplicado",
};

/** Motivo da perda em português: o da plataforma/API, ou o da validação da Sunne (antes de 09/11/2026). */
export function motivoDaPerda(d: Pick<SunneDeal, "lostReason" | "lostCategory" | "cancellationReason">): string {
  const bruto = (d.lostReason || d.lostCategory || d.cancellationReason || "").trim();
  if (!bruto) return "Sem motivo informado";
  return MOTIVOS[bruto] ?? MOTIVOS[bruto.toLowerCase()] ?? bruto;
}

function mesLocal(data: string | null): string | null {
  if (!data || !Number.isFinite(Date.parse(data))) return null;
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date(data));
  return `${p.find((x) => x.type === "year")?.value}-${p.find((x) => x.type === "month")?.value}`;
}

const doVendedor = (d: SunneDeal, orgIds: ReadonlySet<string> | null) => d.product === PRODUTO_KWH && (!orgIds || orgIds.has(d.organizationId));

/** Funil das contas que o vendedor subiu no mês (pura). `orgIds` = organizações dele; null = o time todo. */
export function funilEnergia(deals: SunneDeal[], ano: number, mes: number, orgIds: ReadonlySet<string> | null): FunilEnergia {
  const periodo = `${ano}-${String(mes).padStart(2, "0")}`;
  const f: FunilEnergia = { subidas: 0, contrato: 0, validacao: 0, ganhas: 0, emAndamento: 0, emAndamentoKwh: 0, emAndamentoValor: 0, perdidas: 0, perdidasAntes: 0, motivos: [] };
  const motivos = new Map<string, number>();
  for (const d of deals) {
    if (!doVendedor(d, orgIds) || mesLocal(d.createdAt) !== periodo) continue;
    const alcance = alcanceDoNegocio(d);
    f.subidas++;
    if (alcance >= 4) f.contrato++;
    if (alcance >= 5) {
      f.validacao++;
      if (d.isLost) {
        /* conta nas perdidas abaixo */
      } else if (d.isClosed) f.ganhas++;
      else {
        f.emAndamento++;
        f.emAndamentoKwh += d.averageConsumption ?? 0;
        f.emAndamentoValor += primeiraFaturaSunne(d) * PCT_VORP_PRIMEIRA_FATURA;
      }
    }
    if (d.isLost) {
      f.perdidas++;
      if (alcance < 5) f.perdidasAntes++;
      const m = motivoDaPerda(d);
      motivos.set(m, (motivos.get(m) ?? 0) + 1);
    }
  }
  f.motivos = Array.from(motivos, ([motivo, qtd]) => ({ motivo, qtd })).sort((a, b) => b.qtd - a.qtd || a.motivo.localeCompare(b.motivo, "pt-BR"));
  return f;
}

/** kWh dos fechados no mês que contam para o limite de 80 mil (compensáveis, ou o consumo médio). */
export function kwhParaLimite(deals: SunneDeal[], ano: number, mes: number): number {
  const periodo = `${ano}-${String(mes).padStart(2, "0")}`;
  return deals
    .filter((d) => d.product === PRODUTO_KWH && d.isClosed && !d.isLost && mesLocal(d.closedAt) === periodo)
    .reduce((s, d) => s + (d.compensableKwh ?? d.averageConsumption ?? 0), 0);
}

/** kWh (consumo médio) e faturamento gerado (fatia da Vorp na primeira fatura) das vendas fechadas no mês (pura). */
export function producaoEnergia(deals: SunneDeal[], ano: number, mes: number, orgIds: ReadonlySet<string> | null, kwhTimeNoMes: number): ProducaoEnergia {
  const periodo = `${ano}-${String(mes).padStart(2, "0")}`;
  const pct = pctVorpPrimeiraFatura(kwhTimeNoMes);
  const p: ProducaoEnergia = { kwh: 0, faturamento: 0, fechadas: 0 };
  for (const d of deals) {
    if (!doVendedor(d, orgIds) || !d.isClosed || d.isLost || mesLocal(d.closedAt) !== periodo) continue;
    p.fechadas++;
    p.kwh += d.averageConsumption ?? 0;
    p.faturamento += primeiraFaturaSunne(d) * pct;
  }
  return p;
}

export type PessoaEnergia = {
  id: string;
  nome: string;
  cargo: string;
  funil: FunilEnergia;
  producao: ProducaoEnergia;
  kwh: PaceCalculado;
  faturamento: PaceCalculado;
};

export type PainelEnergia = {
  pessoas: PessoaEnergia[];
  time: { funil: FunilEnergia; producao: ProducaoEnergia; kwh: PaceCalculado; faturamento: PaceCalculado };
  /** Quantos vendedores dividem a meta. */
  vendedores: number;
  lidoEm: string;
};

/** Lê a Sunne (cache) e monta o painel do Energy: o time e cada vendedor com funil, kWh e faturamento. */
export async function buscarPainelEnergia(supabase: SupabaseClient, ctx: { ano: number; mes: number; hoje: string }): Promise<PainelEnergia> {
  const { ano, mes, hoje } = ctx;
  const { data: negocio } = await supabase.from("negocios").select("id").eq("slug", SLUG_ENERGY).maybeSingle();
  if (!negocio) throw new Error("Negócio Energy não encontrado");
  const [rede, { data: membros }, { data: perfis }] = await Promise.all([
    redeSunneEmCache(),
    supabase.from("profile_negocios").select("cargo, profiles!inner(id, full_name, ativo)").eq("negocio_id", negocio.id),
    supabase.from("profiles").select("id, full_name, nomes_planilha").eq("ativo", true),
  ]);

  type M = { cargo: string; profiles: { id: string; full_name: string; ativo: boolean } | { id: string; full_name: string; ativo: boolean }[] };
  const vendem = ((membros ?? []) as unknown as M[])
    .map((m) => ({ cargo: m.cargo, p: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles }))
    .filter((m) => m.p?.ativo && CARGOS_VENDEM_ENERGY.includes(m.cargo));

  const vendedores = vendedoresSunne(rede.organizacoes, perfis ?? []);
  const orgsDe = new Map<string, Set<string>>();
  for (const [orgId, v] of Array.from(vendedores)) if (v.profileId) orgsDe.set(v.profileId, (orgsDe.get(v.profileId) ?? new Set()).add(orgId));

  const n = Math.max(1, vendem.length);
  const metaKwh = Math.round(metaKwhForecast(SLUG_ENERGY, ano, mes));
  const metaFat = Math.round(metaForecast(SLUG_ENERGY, ano, mes));
  const base = { hoje, ano, mes };
  const kwhTime = kwhParaLimite(rede.deals, ano, mes);

  const pessoas: PessoaEnergia[] = vendem.map(({ cargo, p }) => {
    const orgs = orgsDe.get(p.id) ?? new Set<string>();
    const producao = producaoEnergia(rede.deals, ano, mes, orgs, kwhTime);
    return {
      id: p.id,
      nome: p.full_name,
      cargo,
      funil: funilEnergia(rede.deals, ano, mes, orgs),
      producao,
      kwh: calcularPace({ meta: metaKwh / n, recebido: producao.kwh, ...base }),
      faturamento: calcularPace({ meta: metaFat / n, recebido: producao.faturamento, ...base }),
    };
  });

  const producaoTime = producaoEnergia(rede.deals, ano, mes, null, kwhTime);
  return {
    pessoas,
    time: {
      funil: funilEnergia(rede.deals, ano, mes, null),
      producao: producaoTime,
      kwh: calcularPace({ meta: metaKwh, recebido: producaoTime.kwh, ...base }),
      faturamento: calcularPace({ meta: metaFat, recebido: producaoTime.faturamento, ...base }),
    },
    vendedores: vendem.length,
    lidoEm: rede.lidoEm,
  };
}

/** Vínculo da pessoa com o Energy (cargo e negócio). null = não é do Energy. */
export async function vinculoEnergia(
  supabase: SupabaseClient,
  profileId: string,
): Promise<{ cargo: string; id: string; slug: string; nome: string; equipe_nome: string | null } | null> {
  const { data } = await supabase.from("profile_negocios").select("cargo, negocios(id, slug, nome, equipe_nome, status)").eq("profile_id", profileId);
  type N = { id: string; slug: string; nome: string; equipe_nome: string | null; status: string };
  for (const l of (data ?? []) as unknown as { cargo: string; negocios: N | N[] | null }[]) {
    const n = Array.isArray(l.negocios) ? l.negocios[0] : l.negocios;
    if (n && n.status === "ativo" && n.slug === SLUG_ENERGY) return { cargo: l.cargo, id: n.id, slug: n.slug, nome: n.nome, equipe_nome: n.equipe_nome };
  }
  return null;
}

// ------------------------------------------------------------------ comissão (primeira fatura)

export type LinhaComissaoEnergia = { id: string; data: string; kwh: number; primeiraFatura: number; recebido: number; comissao: number };

export type ComissaoPessoaEnergia = { id: string; nome: string; cargo: string; linhas: LinhaComissaoEnergia[]; total: number };

export type ComissaoEnergia = {
  pessoas: ComissaoPessoaEnergia[];
  pct: { executivo: number; head: number; diretor: number };
  /** Recebido da Vorp na primeira fatura de todas as vendas do mês; Head e Diretor levam % da primeira fatura. */
  recebidoTotal: number;
  /** Primeira fatura somada e número de contas ganhas do time no mês (base da comissão da gestão). */
  faturaTotal: number;
  contasTotal: number;
  headTotal: number;
  diretorTotal: number;
  lidoEm: string;
};

/**
 * Comissão da primeira fatura de cada venda fechada no mês (pura): a Vorp recebe 80% da primeira fatura (100% acima de 80 mil kWh
 * no mês) e o executivo (dono da conta na Sunne) leva `pctExecutivo`% da própria primeira fatura (30%, ou seja, 30 dos 80 que a Vorp
 * recebe: 40 Vorp, 10 lideranças, 30 executivo). A recorrência não entra aqui.
 */
export function comissaoDasVendas(deals: SunneDeal[], ano: number, mes: number, orgIds: ReadonlySet<string> | null, kwhTimeNoMes: number, pctExecutivo: number): LinhaComissaoEnergia[] {
  const periodo = `${ano}-${String(mes).padStart(2, "0")}`;
  const parteVorp = pctVorpPrimeiraFatura(kwhTimeNoMes);
  const out: LinhaComissaoEnergia[] = [];
  for (const d of deals) {
    if (!doVendedor(d, orgIds) || !d.isClosed || d.isLost || mesLocal(d.closedAt) !== periodo) continue;
    const primeiraFatura = primeiraFaturaSunne(d);
    const recebido = primeiraFatura * parteVorp;
    out.push({
      id: d.id,
      data: new Date(d.closedAt as string).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
      kwh: d.averageConsumption ?? 0,
      primeiraFatura,
      recebido,
      comissao: (primeiraFatura * pctExecutivo) / 100,
    });
  }
  return out.sort((a, b) => b.data.localeCompare(a.data));
}

export async function buscarComissaoEnergia(supabase: SupabaseClient, ctx: { ano: number; mes: number }): Promise<ComissaoEnergia> {
  const p = percentuais(SLUG_ENERGY, { id: "", valor: 0, canal: null, closerId: "", closerCargo: null, indicadorId: null });
  const pct = { executivo: p?.closer ?? 30, head: p?.head ?? 5, diretor: p?.diretor ?? 5 };
  const { data: negocio } = await supabase.from("negocios").select("id").eq("slug", SLUG_ENERGY).maybeSingle();
  if (!negocio) throw new Error("Negócio Energy não encontrado");
  const [rede, { data: membros }, { data: perfis }] = await Promise.all([
    redeSunneEmCache(),
    supabase.from("profile_negocios").select("cargo, profiles!inner(id, full_name, ativo)").eq("negocio_id", negocio.id),
    supabase.from("profiles").select("id, full_name, nomes_planilha").eq("ativo", true),
  ]);
  type M = { cargo: string; profiles: { id: string; full_name: string; ativo: boolean } | { id: string; full_name: string; ativo: boolean }[] };
  const vendedores = vendedoresSunne(rede.organizacoes, perfis ?? []);
  const orgsDe = new Map<string, Set<string>>();
  for (const [orgId, v] of Array.from(vendedores)) if (v.profileId) orgsDe.set(v.profileId, (orgsDe.get(v.profileId) ?? new Set()).add(orgId));
  // Vendem: os cargos de venda e o Head que também tem conta própria na Sunne (vende e leva o % de executivo).
  const vendem = ((membros ?? []) as unknown as M[])
    .map((m) => ({ cargo: m.cargo, p: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles }))
    .filter((m) => m.p?.ativo && (CARGOS_VENDEM_ENERGY.includes(m.cargo) || (m.cargo === "head" && orgsDe.has(m.p.id))));

  const kwhTime = kwhParaLimite(rede.deals, ctx.ano, ctx.mes);
  const pessoas: ComissaoPessoaEnergia[] = vendem.map(({ cargo, p: pe }) => {
    const linhas = comissaoDasVendas(rede.deals, ctx.ano, ctx.mes, orgsDe.get(pe.id) ?? new Set<string>(), kwhTime, pct.executivo);
    return { id: pe.id, nome: pe.full_name, cargo, linhas, total: linhas.reduce((s, l) => s + l.comissao, 0) };
  });
  const todas = comissaoDasVendas(rede.deals, ctx.ano, ctx.mes, null, kwhTime, pct.executivo);
  const recebidoTotal = todas.reduce((s, l) => s + l.recebido, 0);
  const faturaTotal = todas.reduce((s, l) => s + l.primeiraFatura, 0);
  return { pessoas, pct, recebidoTotal, faturaTotal, contasTotal: todas.length, headTotal: (faturaTotal * pct.head) / 100, diretorTotal: (faturaTotal * pct.diretor) / 100, lidoEm: rede.lidoEm };
}

// ------------------------------------------------------------------ compromisso do dia (automático)

/** Indicadores do compromisso do executivo do Energy. As indicações recebidas entram quando o processo de criar os leads no Pipefácil estiver definido. */
export const KPIS_ENERGIA = [
  { chave: "contas_subidas", label: "Contas subidas" },
  { chave: "assinaturas", label: "Assinaturas" },
  { chave: "kwh_gerado", label: "kWh gerado" },
] as const;

export type RealizadoDoDia = { contasSubidas: number; kwh: number };

const diaBR = (iso: string | null) => (iso && Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : null);

/** Contas subidas e kWh das contas ganhas hoje (pura). `orgIds` = organizações do vendedor. */
export function realizadoDoDia(deals: SunneDeal[], orgIds: ReadonlySet<string>, hoje: string): RealizadoDoDia {
  const r: RealizadoDoDia = { contasSubidas: 0, kwh: 0 };
  for (const d of deals) {
    if (!doVendedor(d, orgIds)) continue;
    if (diaBR(d.createdAt) === hoje) r.contasSubidas++;
    if (d.isClosed && !d.isLost && diaBR(d.closedAt) === hoje) r.kwh += d.averageConsumption ?? 0;
  }
  return r;
}

export type CompromissoEnergiaDia = RealizadoDoDia & {
  /** null = a leitura dos contratos da Sunne falhou; não mostra zero no lugar. */
  assinaturas: number | null;
};

/** Realizado de hoje de um vendedor do Energy: contas subidas, assinaturas e kWh gerado, direto da Sunne. */
export async function buscarCompromissoEnergia(supabase: SupabaseClient, profileId: string, hoje: string): Promise<CompromissoEnergiaDia> {
  const [rede, { data: perfis }] = await Promise.all([redeSunneEmCache(), supabase.from("profiles").select("id, full_name, nomes_planilha").eq("ativo", true)]);
  const vendedores = vendedoresSunne(rede.organizacoes, perfis ?? []);
  const orgs = new Set<string>();
  for (const [orgId, v] of Array.from(vendedores)) if (v.profileId === profileId) orgs.add(orgId);
  const base = realizadoDoDia(rede.deals, orgs, hoje);
  let assinaturas: number | null = null;
  try {
    const porOrg = new Map(await assinaturasDoDiaEmCache(hoje));
    assinaturas = Array.from(orgs).reduce((s, o) => s + (porOrg.get(o) ?? 0), 0);
  } catch (e) {
    console.error("assinaturas do dia indisponíveis:", e);
  }
  return { ...base, assinaturas };
}
