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
// Ainda NÃO modelado: BDR por SQL da Vorp (R$ 10 inbound / R$ 20 outbound; a
// validação fica para o fim do mês).
import type { SupabaseClient } from "@supabase/supabase-js";

export type Canal = "outbound" | "inbound" | "indicacao";
export type PapelComissao = "closer" | "sdr" | "bdr" | "head" | "diretor";

export type LinhaComissao = {
  beneficiarioId: string;
  papel: PapelComissao;
  pct: number;
  /** Base sobre a qual o % incide (valor recebido, ou o teto de 3 x MRR na Vorp). */
  base: number;
  valor: number;
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
};

/** Energy, recorrência: 30% executivo, 25% lideranças (Head e Diretor em partes iguais), 45% Vorp (sem linha). */
export const RECORRENCIA_ENERGY = { executivo: 30, liderancas: 25, vorp: 45 } as const;

export type ContextoNegocio = {
  /** Head do negócio, se houver. */
  headId: string | null;
  diretorId: string | null;
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
  add(venda.closerId, "closer", p.closer);
  if (venda.indicadorId) {
    add(venda.indicadorId, slug === "matchsales" ? "bdr" : "sdr", slug === "matchsales" ? p.bdr : p.sdr);
  }
  // Head: o líder do negócio. Se o próprio Head fechou, o % de Head não se soma ao dele.
  // Energy: o Head leva os 5% mesmo vendendo (35%); se o Diretor vendeu, ele fica também com o do Head (40%).
  if (energia) {
    add(diretorVendeu ? ctx.diretorId : ctx.headId, "head", p.head);
  } else {
    add(ctx.headId && ctx.headId !== venda.closerId ? ctx.headId : null, "head", p.head);
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

export type ComissaoPessoa = {
  id: string;
  nome: string;
  total: number;
  porPapel: Partial<Record<PapelComissao, number>>;
  itens: { vendaId: string; data: string; cliente: string | null; papel: PapelComissao; pct: number; base: number; valor: number }[];
};

export type ComissaoNegocio = {
  slug: string;
  nome: string;
  equipeNome: string | null;
  temRegra: boolean;
  recebido: number;
  totalComissao: number;
  pessoas: ComissaoPessoa[];
  pagamento: string;
};

export async function buscarComissoesNegocios(supabase: SupabaseClient, ano: number, mes: number, slugs?: string[]): Promise<ComissaoNegocio[]> {
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimExcl = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;

  let q = supabase.from("negocios").select("id, slug, nome, equipe_nome").eq("status", "ativo").order("ordem");
  if (slugs && slugs.length > 0) q = q.in("slug", slugs);
  const { data: negocios } = await q;
  const lista = negocios ?? [];
  if (lista.length === 0) return [];
  const ids = lista.map((n) => n.id);

  const [{ data: vendas }, { data: membros }, { data: diretor }, { data: perfis }] = await Promise.all([
    supabase
      .from("vendas")
      .select("id, negocio_id, profile_id, indicador_id, canal, valor, data, cliente, mrr, valor_antecipado, primeiro_contrato, recorrencia")
      .in("negocio_id", ids)
      .gte("data", inicio)
      .lt("data", fimExcl)
      .range(0, 19999),
    supabase.from("profile_negocios").select("negocio_id, profile_id, cargo").in("negocio_id", ids),
    supabase.from("profiles").select("id").eq("role", "diretor").eq("ativo", true).limit(1),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const nomePor = new Map((perfis ?? []).map((p) => [p.id as string, p.full_name as string]));
  const diretorId = (diretor ?? [])[0]?.id ?? null;

  return lista.map((n) => {
    const membrosN = (membros ?? []).filter((m) => m.negocio_id === n.id);
    const head = membrosN.find((m) => m.cargo === "head");
    // Vorp sem Head: o Diretor ocupa a Gestão (e o % de Head some).
    const ctx: ContextoNegocio = { headId: head && head.profile_id !== diretorId ? head.profile_id : null, diretorId };
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
      };
      for (const l of comissaoDaVenda(n.slug, venda, ctx)) {
        const pessoa = porPessoa.get(l.beneficiarioId) ?? {
          id: l.beneficiarioId,
          nome: nomePor.get(l.beneficiarioId) ?? "—",
          total: 0,
          porPapel: {},
          itens: [],
        };
        pessoa.total += l.valor;
        pessoa.porPapel[l.papel] = (pessoa.porPapel[l.papel] ?? 0) + l.valor;
        pessoa.itens.push({ vendaId: v.id, data: v.data, cliente: v.cliente ?? null, papel: l.papel, pct: l.pct, base: l.base, valor: l.valor });
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
      pessoas,
      pagamento: dataPagamento(inicio),
    };
  });
}
