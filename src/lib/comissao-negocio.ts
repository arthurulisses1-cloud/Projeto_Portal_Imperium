// Motor de remuneração do modelo multinegócio (vigência 09/11/2026).
// Cada negócio paga um % do valor RECEBIDO de cada venda, dividido entre papéis.
// Regras e premissas ficam em REGRAS (dados, não código espalhado).
//
// Quem é quem numa venda (tabela vendas):
//   profile_id   = quem fechou (closer / executivo / head vendendo)
//   indicador_id = quem prospectou ou indicou (SDR; BDR na MatchSales)
//   canal        = outbound | inbound | indicacao (indicação paga como inbound)
// Gestão = Head do negócio; sem Head (Vorp), o Diretor ocupa o lugar.
//
// Vorp: lança-se MRR, valor total do contrato e valor antecipado. A base da comissão
// de uma venda com antecipado é limitada a 3 x MRR (teto de 3 meses), e só o 1º
// contrato do cliente paga comissão. A recorrência segue a cada MRR recebido e
// termina quando o contrato deixa de ser lançado (churn/encerramento).
//
// Finance (precatórios): a venda registra a comissão recebida (valor) e o valor pago ao
// cliente. Margem base = 6% do pago ao cliente; 25% dela é comissão (executivo 10 / líder
// 10 / diretor 5; líder vendendo 15 / 10). O que a comissão exceder a margem é deságio
// (executivo 20 / líder 15 / diretor 15; líder vendendo 20 / 20).
//
// Ainda NÃO modelado: BDR por SQL da Vorp (R$ 10 inbound / R$ 20 outbound; a
// validação fica para o fim do mês).
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type Canal = "outbound" | "inbound" | "indicacao";
export type PapelComissao = "closer" | "sdr" | "bdr" | "head" | "diretor";

export type LinhaComissao = {
  beneficiarioId: string;
  papel: PapelComissao;
  pct: number;
  /** Base sobre a qual o % incide (valor recebido, ou o teto de 3 x MRR na Vorp). */
  base: number;
  valor: number;
  /** Finance: "base" (margem de 6%) ou "desagio" (excedente da comissão sobre a margem). */
  tipo?: "base" | "desagio";
};

export type VendaParaComissao = {
  id: string;
  valor: number;
  canal: Canal | null;
  /** Quem fechou. */
  closerId: string;
  closerCargo: string | null;
  /** SDR/BDR/indicador, quando houver. */
  indicadorId: string | null;
  /** Contrato (Vorp). */
  mrr?: number | null;
  valorAntecipado?: number | null;
  /** Só o 1º contrato do cliente paga comissão; padrão true. */
  primeiroContrato?: boolean;
  /** Energy: recebimento de recorrência (não é a 1ª fatura). */
  recorrencia?: boolean;
  /** Finance: valor pago ao cliente; a margem base é 6% dele e o que a comissão (valor) exceder é deságio. */
  valorCliente?: number | null;
  /**
   * Finance, venda no fundo do Matri (o Head do Finance não tem comissão): SDR e closer do formulário, com a regra
   * própria (10% SDR, 10% closer, 5% Diretor). null/ausente = regra normal do Finance.
   */
  fundoMatri?: { sdrId: string | null; closerId: string | null } | null;
  /** Match Sales: segundo vendedor da dupla (co-responsável do lead); divide a comissão do fechamento. */
  coCloserId?: string | null;
};

/** Match Sales: quem recebe sempre 10% no fechamento, mesmo no inbound (combinado com o time, 2026-11-18). */
export const MATCH_COMISSAO_10_SEMPRE = ["Arthur Soares"];

/** Match Sales: % de cada vendedor do fechamento (cada um pela própria taxa; em dupla, metade para cada). */
export function taxasFechamentoMatch(venda: VendaParaComissao, ctx: ContextoNegocio, taxaPadrao: number): { id: string; pct: number }[] {
  // Com BDR a regra é a mesma para todos (5%).
  const taxa = (id: string) => (!venda.indicadorId && ctx.comissao10Sempre?.has(id) ? 10 : taxaPadrao);
  const dupla = venda.coCloserId && venda.coCloserId !== venda.closerId ? [venda.closerId, venda.coCloserId] : [venda.closerId];
  return dupla.map((id) => ({ id, pct: taxa(id) / dupla.length }));
}

/** Fundo do Matri no Finance (decisão do Diretor, 2026-11-18): sem comissão para o Head; SDR 10, closer 10, Diretor 5. */
export const FINANCE_FUNDO_MATRI = { sdr: 10, closer: 10, diretor: 5 } as const;

/** O fundo da venda é o do Matri? Vale o fundo novo do Subido, quando o lead mudou de fundo. */
export function ehFundoMatri(fundoDestino: string | null, mesmoFundo: boolean | null, fundoNovo: string | null): boolean {
  const efetivo = mesmoFundo === false && fundoNovo ? fundoNovo : fundoDestino;
  return /matri/i.test(efetivo ?? "");
}

/** Finance: margem base de 6% sobre o pago ao cliente; 25% dela vira comissão; o deságio tem tabela própria. */
export const FINANCE = {
  margemBase: 6,
  base: {
    comExecutivo: { executivo: 10, lider: 10, diretor: 5 },
    liderVendendo: { lider: 15, diretor: 10 },
  },
  desagio: {
    comExecutivo: { executivo: 20, lider: 15, diretor: 15 },
    liderVendendo: { lider: 20, diretor: 20 },
  },
} as const;

/** Energy, recorrência: 30% executivo, 25% lideranças (Head e Diretor em partes iguais), 45% Vorp (sem linha). */
export const RECORRENCIA_ENERGY = { executivo: 30, liderancas: 25, vorp: 45 } as const;

export type ContextoNegocio = {
  /** Head do negócio, se houver. */
  headId: string | null;
  diretorId: string | null;
  /** Quem é do negócio (para saber se o participante de uma venda é de outra BU). Ausente = ninguém é do negócio. */
  membrosIds?: ReadonlySet<string>;
  /** Match Sales: ids de quem recebe 10% no fechamento em qualquer canal. */
  comissao10Sempre?: ReadonlySet<string>;
};

type Pcts = { closer: number; sdr: number; gestao: number };

const comCanal = (canal: Canal | null): "outbound" | "inbound" => (canal === "outbound" ? "outbound" : "inbound");

/** Percentuais de cada negócio. Retorna null onde a regra ainda não existe. */
export function percentuais(slug: string, venda: VendaParaComissao): { closer: number; sdr: number; bdr: number; head: number; diretor: number } | null {
  const via = comCanal(venda.canal);
  const temIndicador = !!venda.indicadorId;
  const headVendendo = venda.closerCargo === "head";

  if (slug === "vorp") {
    const t: Record<"outbound" | "inbound", Pcts> = {
      outbound: { sdr: 3, closer: 4, gestao: 3 },
      inbound: { sdr: 2, closer: 3, gestao: 3 },
    };
    const p = t[via];
    // Sem Head, o Diretor recebe a Gestão (3%). Com Head: 1% dele e 2% do Diretor.
    return { closer: p.closer, sdr: temIndicador ? p.sdr : 0, bdr: 0, head: 0, diretor: p.gestao };
  }
  if (slug === "vorp-finance") {
    // Executivo 10 + Head 10 + Diretor 5. Head vendendo: 15 para ele e 10 para o Diretor.
    return headVendendo
      ? { closer: 15, sdr: 0, bdr: 0, head: 0, diretor: 10 }
      : { closer: 10, sdr: 0, bdr: 0, head: 10, diretor: 5 };
  }
  if (slug === "matchsales") {
    // Outbound: executivo 10 / líder 2. Inbound: executivo 8 / líder 2.
    // Com BDR: BDR 5 / executivo 5 / líder 2 (sem teto de 3 meses).
    if (temIndicador) return { closer: 5, sdr: 0, bdr: 5, head: 2, diretor: 0 };
    return { closer: via === "outbound" ? 10 : 8, sdr: 0, bdr: 0, head: 2, diretor: 0 };
  }
  if (slug === "vorp-energy") {
    // Executivo 30 + Head 5 + Diretor 5. Head vendendo: 35. Diretor vendendo: 40.
    return { closer: 30, sdr: 0, bdr: 0, head: 5, diretor: 5 };
  }
  return null;
}

/** Linhas de comissão de uma venda (vazio quando o negócio ainda não tem regra). */
export function comissaoDaVenda(slug: string, venda: VendaParaComissao, ctx: ContextoNegocio): LinhaComissao[] {
  const p = percentuais(slug, venda);
  if (!p) return [];
  const linhas: LinhaComissao[] = [];
  if (slug === "vorp-energy" && venda.recorrencia) return comissaoRecorrenciaEnergy(venda, ctx);
  if (slug === "vorp-finance") return comissaoFinance(venda, ctx);
  if (slug === "vorp" && venda.primeiroContrato === false) return [];
  // Teto da Vorp: com valor antecipado e MRR, a base é no máximo 3 x MRR.
  const base =
    slug === "vorp" && (venda.valorAntecipado ?? 0) > 0 && (venda.mrr ?? 0) > 0
      ? Math.min(venda.valorAntecipado as number, 3 * (venda.mrr as number))
      : venda.valor;
  const add = (beneficiarioId: string | null, papel: PapelComissao, pct: number) => {
    if (!beneficiarioId || pct <= 0) return;
    linhas.push({ beneficiarioId, papel, pct, base, valor: (base * pct) / 100 });
  };
  const energia = slug === "vorp-energy";
  const diretorVendeu = !!ctx.diretorId && venda.closerId === ctx.diretorId;
  if (slug === "matchsales") {
    for (const t of taxasFechamentoMatch(venda, ctx, p.closer)) add(t.id, "closer", t.pct);
  } else {
    add(venda.closerId, "closer", p.closer);
  }
  if (venda.indicadorId) {
    add(venda.indicadorId, slug === "matchsales" ? "bdr" : "sdr", slug === "matchsales" ? p.bdr : p.sdr);
  }
  // Head: o líder do negócio. Se o próprio Head fechou, o % de Head não se soma ao dele.
  // Energy: o Head leva os 5% mesmo vendendo (35%); se o Diretor vendeu, ele fica também com o do Head (40%).
  if (energia) {
    add(diretorVendeu ? ctx.diretorId : ctx.headId, "head", p.head);
  } else {
    add(ctx.headId && ctx.headId !== venda.closerId && ctx.headId !== venda.coCloserId ? ctx.headId : null, "head", p.head);
  }
  // Vorp com Head: 1% dele e 2% do Diretor (em vez dos 3% só do Diretor).
  if (slug === "vorp" && ctx.headId) {
    add(ctx.headId, "head", 1);
    add(ctx.diretorId, "diretor", p.diretor - 1);
  } else {
    add(ctx.diretorId, "diretor", p.diretor);
  }
  return linhas;
}

/** Finance: comissão base sobre a margem (6% do pago ao cliente) + deságio (excedente da comissão recebida). */
function comissaoFinance(venda: VendaParaComissao, ctx: ContextoNegocio): LinhaComissao[] {
  const linhas: LinhaComissao[] = [];
  const temCliente = (venda.valorCliente ?? 0) > 0;
  // Sem o valor pago ao cliente (vendas antigas), a margem é o próprio valor recebido e não há deságio.
  const margem = temCliente ? ((venda.valorCliente as number) * FINANCE.margemBase) / 100 : venda.valor;
  const desagio = temCliente ? Math.max(0, venda.valor - margem) : 0;
  const liderVendendo = venda.closerCargo === "head";
  const add = (id: string | null, papel: PapelComissao, pct: number, base: number, tipo: "base" | "desagio") => {
    if (!id || pct <= 0 || base <= 0) return;
    linhas.push({ beneficiarioId: id, papel, pct, base, valor: (base * pct) / 100, tipo });
  };
  if (venda.fundoMatri) {
    const m = venda.fundoMatri;
    for (const [base, tipo] of [[margem, "base"], [desagio, "desagio"]] as const) {
      add(m.sdrId, "sdr", FINANCE_FUNDO_MATRI.sdr, base, tipo);
      add(m.closerId, "closer", FINANCE_FUNDO_MATRI.closer, base, tipo);
      add(ctx.diretorId, "diretor", FINANCE_FUNDO_MATRI.diretor, base, tipo);
    }
    return linhas;
  }
  const aplicar = (base: number, tipo: "base" | "desagio") => {
    const t = FINANCE[tipo];
    if (liderVendendo) {
      add(venda.closerId, "closer", t.liderVendendo.lider, base, tipo);
      add(ctx.diretorId, "diretor", t.liderVendendo.diretor, base, tipo);
    } else {
      add(venda.closerId, "closer", t.comExecutivo.executivo, base, tipo);
      // Venda com um participante de outra BU (o outro nome do formulário): a parte da liderança
      // (líder + diretor) é dividida em 3 — Diretor, Head e o participante (decisão do Diretor, 2026-11-17).
      const participante = venda.indicadorId && venda.indicadorId !== venda.closerId && !ctx.membrosIds?.has(venda.indicadorId) ? venda.indicadorId : null;
      if (participante) {
        const parte = (t.comExecutivo.lider + t.comExecutivo.diretor) / 3;
        add(participante, "closer", parte, base, tipo);
        add(ctx.headId ?? ctx.diretorId, ctx.headId ? "head" : "diretor", parte, base, tipo);
        add(ctx.diretorId, "diretor", parte, base, tipo);
      } else {
        add(ctx.headId && ctx.headId !== venda.closerId ? ctx.headId : null, "head", t.comExecutivo.lider, base, tipo);
        add(ctx.diretorId, "diretor", t.comExecutivo.diretor, base, tipo);
      }
    }
  };
  aplicar(margem, "base");
  aplicar(desagio, "desagio");
  return linhas;
}

function comissaoRecorrenciaEnergy(venda: VendaParaComissao, ctx: ContextoNegocio): LinhaComissao[] {
  const linhas: LinhaComissao[] = [];
  const base = venda.valor;
  const add = (id: string | null, papel: PapelComissao, pct: number) => {
    if (!id || pct <= 0) return;
    linhas.push({ beneficiarioId: id, papel, pct, base, valor: (base * pct) / 100 });
  };
  const lider = RECORRENCIA_ENERGY.liderancas;
  const diretorVendeu = !!ctx.diretorId && venda.closerId === ctx.diretorId;
  add(venda.closerId, "closer", RECORRENCIA_ENERGY.executivo);
  if (!ctx.headId) {
    add(ctx.diretorId, "diretor", lider);
  } else {
    add(diretorVendeu ? ctx.diretorId : ctx.headId, "head", lider / 2);
    add(ctx.diretorId, "diretor", lider / 2);
  }
  return linhas;
}

/** Dia de pagamento: dia 15 do mês seguinte ao do recebimento. */
export function dataPagamento(dataVenda: string): string {
  const [a, m] = dataVenda.split("-").map(Number);
  const ano = m === 12 ? a + 1 : a;
  const mes = m === 12 ? 1 : m + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-15`;
}

/** Uma linha de comissão de uma venda, com o que a explica (valor recebido, MRR, plano). */
export type ItemComissao = {
  vendaId: string;
  data: string;
  cliente: string | null;
  papel: PapelComissao;
  pct: number;
  base: number;
  valor: number;
  tipo?: "base" | "desagio";
  /** Valor recebido da venda (a base pode ser menor, como o teto de 3 x MRR da Vorp). */
  recebido: number;
  mrr: number | null;
  tipoContrato: string | null;
  implantacao: number | null;
  primeiroContrato: boolean;
  /** Valor fixado pelo Diretor (comissao_ajustes) em vez do cálculo automático. */
  ajustado?: boolean;
  /** Data (YYYY-MM-DD) em que esta comissão foi marcada como paga. */
  pagoEm?: string | null;
};

export type ComissaoPessoa = {
  id: string;
  nome: string;
  total: number;
  /** Parte do total já marcada como paga. */
  pago: number;
  porPapel: Partial<Record<PapelComissao, number>>;
  itens: ItemComissao[];
};

export type ComissaoNegocio = {
  slug: string;
  nome: string;
  equipeNome: string | null;
  temRegra: boolean;
  recebido: number;
  totalComissao: number;
  /** Parte do total já marcada como paga (não entra no "a pagar"). */
  totalPago?: number;
  pessoas: ComissaoPessoa[];
  pagamento: string;
};

type AjusteRow = { venda_id: string; profile_id: string; papel: string | null; valor: number | null; pago_em: string | null };

export async function buscarComissoesNegocios(supabase: SupabaseClient, ano: number, mes: number, slugs?: string[]): Promise<ComissaoNegocio[]> {
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimExcl = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;

  let q = supabase.from("negocios").select("id, slug, nome, equipe_nome").eq("status", "ativo").order("ordem");
  if (slugs && slugs.length > 0) q = q.in("slug", slugs);
  const { data: negocios } = await q;
  const lista = negocios ?? [];
  if (lista.length === 0) return [];
  const ids = lista.map((n) => n.id);

  const colunasVenda = "id, negocio_id, profile_id, indicador_id, canal, valor, data, cliente, mrr, valor_antecipado, primeiro_contrato, recorrencia, valor_cliente, tipo_contrato, valor_implantacao";
  const lerVendas = (colunas: string) => supabase.from("vendas").select(colunas).in("negocio_id", ids).gte("data", inicio).lt("data", fimExcl).range(0, 19999);
  const [vendasBruto, { data: membros }, { data: diretor }, { data: perfis }] = await Promise.all([
    lerVendas(colunasVenda + ", co_closer_id").then(async (r) => (r.error ? await lerVendas(colunasVenda) : r)),
    supabase.from("profile_negocios").select("negocio_id, profile_id, cargo").in("negocio_id", ids),
    supabase.from("profiles").select("id").eq("role", "diretor").eq("ativo", true).limit(1),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const vendas = (vendasBruto.data ?? []) as unknown as Record<string, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any

  // Finance: vendas do fundo do Matri (lidas à parte, pelo lead de origem; a RLS não pode esconder o fundo de ninguém).
  const fundoMatriPorVenda = new Map<string, { sdrId: string | null; closerId: string | null }>();
  const idsFinance = (vendas ?? []).filter((v) => lista.some((n) => n.id === v.negocio_id && n.slug === "vorp-finance")).map((v) => v.id as string);
  if (idsFinance.length > 0) {
    try {
      const { data: leadsFundo, error: erroFundo } = await createAdminClient()
        .from("entrevistas_leads")
        .select("venda_id, sdr_profile_id, closer_profile_id, fundo_destino, sub_mesmo_fundo, sub_fundo_novo")
        .in("venda_id", idsFinance);
      if (!erroFundo) {
        for (const l of leadsFundo ?? []) {
          if (ehFundoMatri(l.fundo_destino as string | null, l.sub_mesmo_fundo as boolean | null, l.sub_fundo_novo as string | null)) {
            fundoMatriPorVenda.set(l.venda_id as string, { sdrId: (l.sdr_profile_id as string | null) ?? null, closerId: (l.closer_profile_id as string | null) ?? null });
          }
        }
      }
    } catch (e) {
      console.error("buscarComissoesNegocios: fundo do Matri indisponível:", e);
    }
  }

  // Ajustes do Diretor (valor fixado e/ou pagamento). Sem a tabela (migration 0119 ainda não rodada), segue só o cálculo.
  const ajustesPor = new Map<string, AjusteRow[]>();
  if ((vendas ?? []).length > 0) {
    const { data: ajustes, error: erroAjuste } = await supabase
      .from("comissao_ajustes")
      .select("venda_id, profile_id, papel, valor, pago_em")
      .in("venda_id", (vendas ?? []).map((v) => v.id as string));
    if (!erroAjuste) {
      for (const a of (ajustes ?? []) as AjusteRow[]) ajustesPor.set(a.venda_id, [...(ajustesPor.get(a.venda_id) ?? []), a]);
    }
  }

  const nomePor = new Map((perfis ?? []).map((p) => [p.id as string, p.full_name as string]));
  const diretorId = (diretor ?? [])[0]?.id ?? null;

  return lista.map((n) => {
    const membrosN = (membros ?? []).filter((m) => m.negocio_id === n.id);
    const head = membrosN.find((m) => m.cargo === "head");
    // Vorp sem Head: o Diretor ocupa a Gestão (e o % de Head some).
    const ctx: ContextoNegocio = {
      headId: head && head.profile_id !== diretorId ? head.profile_id : null,
      diretorId,
      membrosIds: new Set(membrosN.map((m) => m.profile_id as string)),
      comissao10Sempre: new Set((perfis ?? []).filter((p) => MATCH_COMISSAO_10_SEMPRE.includes(p.full_name as string)).map((p) => p.id as string)),
    };
    const cargoDe = new Map(membrosN.map((m) => [m.profile_id as string, m.cargo as string]));

    const doNegocio = (vendas ?? []).filter((v) => v.negocio_id === n.id);
    const recebido = doNegocio.reduce((s, v) => s + Number(v.valor), 0);
    const porPessoa = new Map<string, ComissaoPessoa>();
    const temRegra = percentuais(n.slug, { id: "", valor: 0, canal: null, closerId: "", closerCargo: null, indicadorId: null }) !== null;

    for (const v of doNegocio) {
      const venda: VendaParaComissao = {
        id: v.id,
        valor: Number(v.valor),
        canal: (v.canal as Canal | null) ?? null,
        closerId: v.profile_id,
        closerCargo: cargoDe.get(v.profile_id) ?? null,
        indicadorId: v.indicador_id ?? null,
        mrr: v.mrr === null || v.mrr === undefined ? null : Number(v.mrr),
        valorAntecipado: v.valor_antecipado === null || v.valor_antecipado === undefined ? null : Number(v.valor_antecipado),
        primeiroContrato: v.primeiro_contrato ?? true,
        recorrencia: v.recorrencia ?? false,
        valorCliente: v.valor_cliente === null || v.valor_cliente === undefined ? null : Number(v.valor_cliente),
        fundoMatri: fundoMatriPorVenda.get(v.id as string) ?? null,
        coCloserId: (v.co_closer_id as string | null | undefined) ?? null,
      };
      let linhasVenda = comissaoDaVenda(n.slug, venda, ctx);
      const ajustesVenda = ajustesPor.get(v.id as string) ?? [];
      // Valor fixado pelo Diretor substitui o cálculo daquela pessoa nesta venda.
      for (const a of ajustesVenda) {
        if (a.valor === null || a.valor === undefined) continue;
        const dela = linhasVenda.filter((l) => l.beneficiarioId === a.profile_id);
        const papel = (a.papel as PapelComissao | null) ?? dela[0]?.papel ?? "closer";
        linhasVenda = [
          ...linhasVenda.filter((l) => l.beneficiarioId !== a.profile_id),
          { beneficiarioId: a.profile_id, papel, pct: 0, base: Number(v.valor), valor: Number(a.valor), tipo: "base" as const },
        ];
      }
      for (const l of linhasVenda) {
        if (!l.beneficiarioId) continue; // venda sem dono (vendedor sem login): sem comissão de closer
        const ajuste = ajustesVenda.find((a) => a.profile_id === l.beneficiarioId);
        const pessoa = porPessoa.get(l.beneficiarioId) ?? {
          id: l.beneficiarioId,
          nome: nomePor.get(l.beneficiarioId) ?? "—",
          total: 0,
          pago: 0,
          porPapel: {},
          itens: [],
        };
        pessoa.total += l.valor;
        if (ajuste?.pago_em) pessoa.pago += l.valor;
        pessoa.porPapel[l.papel] = (pessoa.porPapel[l.papel] ?? 0) + l.valor;
        pessoa.itens.push({
          vendaId: v.id,
          data: v.data,
          cliente: v.cliente ?? null,
          papel: l.papel,
          pct: l.pct,
          base: l.base,
          valor: l.valor,
          tipo: l.tipo,
          recebido: Number(v.valor),
          mrr: venda.mrr ?? null,
          tipoContrato: (v.tipo_contrato as string | null) ?? null,
          implantacao: v.valor_implantacao === null || v.valor_implantacao === undefined ? null : Number(v.valor_implantacao),
          primeiroContrato: v.primeiro_contrato ?? true,
          ajustado: !!ajuste && ajuste.valor !== null && ajuste.valor !== undefined,
          pagoEm: ajuste?.pago_em ?? null,
        });
        porPessoa.set(l.beneficiarioId, pessoa);
      }
    }

    const pessoas = Array.from(porPessoa.values()).sort((a, b) => b.total - a.total);
    return {
      slug: n.slug,
      nome: n.nome,
      equipeNome: n.equipe_nome ?? null,
      temRegra,
      recebido,
      totalComissao: pessoas.reduce((s, p) => s + p.total, 0),
      totalPago: pessoas.reduce((s, p) => s + p.pago, 0),
      pessoas,
      pagamento: dataPagamento(inicio),
    };
  });
}
