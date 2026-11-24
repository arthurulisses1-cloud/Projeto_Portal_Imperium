// Pace de recebimento por negócio: onde a equipe deveria estar hoje, onde está
// e para onde caminha no fim do mês. Dias úteis = seg-sex menos os feriados
// nacionais (FERIADOS_NACIONAIS). Pura em calcularPace; o acesso ao banco fica em buscarPaceNegocio.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ehFimDeSemana, paraDataUTC } from "@/lib/data-br";
import { metaForecast } from "@/lib/forecast-negocios";
import { buscarGanhosCrm } from "@/lib/recebido-crm";
import { ehVendaExtra, vendasDoFundoMatri } from "@/lib/extra-finance";

export type StatusPace = "sem_meta" | "adiantado" | "no_ritmo" | "atrasado" | "critico";

export type PaceCalculado = {
  diasUteisTotal: number;
  diasUteisDecorridos: number;
  diasUteisRestantes: number;
  meta: number;
  recebido: number;
  esperadoAteHoje: number;
  /** recebido / esperado até hoje (1 = exatamente no ritmo). */
  indice: number | null;
  projecao: number;
  falta: number;
  necessarioPorDia: number | null;
  status: StatusPace;
};

function proximoDia(data: string): string {
  const d = paraDataUTC(data);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Feriados nacionais (lei federal; Carnaval e Corpus Christi são ponto facultativo e não entram).
 *  Acrescente os anos seguintes aqui. */
export const FERIADOS_NACIONAIS = new Set<string>([
  // 2026
  "2026-01-01", "2026-04-03", "2026-04-21", "2026-05-01", "2026-09-07",
  "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25",
  // 2027
  "2027-01-01", "2027-03-26", "2027-04-21", "2027-05-01", "2027-09-07",
  "2027-10-12", "2027-11-02", "2027-11-15", "2027-11-20", "2027-12-25",
]);

/** Dias úteis (seg-sex, sem feriado nacional) em [inicio, fim], inclusive. */
export function diasUteis(inicio: string, fim: string): number {
  let n = 0;
  for (let c = inicio; c <= fim; c = proximoDia(c)) if (!ehFimDeSemana(c) && !FERIADOS_NACIONAIS.has(c)) n++;
  return n;
}

export function limitesDoMes(ano: number, mes: number): { inicio: string; fim: string } {
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
  return { inicio, fim };
}

export function calcularPace(p: { meta: number; recebido: number; hoje: string; ano: number; mes: number }): PaceCalculado {
  const { inicio, fim } = limitesDoMes(p.ano, p.mes);
  const total = diasUteis(inicio, fim);
  const ate = p.hoje > fim ? fim : p.hoje;
  const decorridos = ate < inicio ? 0 : diasUteis(inicio, ate);
  const restantes = Math.max(0, total - decorridos);

  const esperado = total > 0 ? (p.meta * decorridos) / total : 0;
  const indice = esperado > 0 ? p.recebido / esperado : null;
  const projecao = decorridos > 0 ? (p.recebido / decorridos) * total : 0;
  const falta = Math.max(0, p.meta - p.recebido);
  const necessarioPorDia = restantes > 0 ? falta / restantes : null;

  let status: StatusPace;
  if (p.meta <= 0) status = "sem_meta";
  else if (p.recebido >= p.meta) status = "adiantado";
  else if (indice === null) status = "no_ritmo";
  else if (indice >= 1) status = "adiantado";
  else if (indice >= 0.85) status = "no_ritmo";
  else if (indice >= 0.6) status = "atrasado";
  else status = "critico";

  return {
    diasUteisTotal: total,
    diasUteisDecorridos: decorridos,
    diasUteisRestantes: restantes,
    meta: p.meta,
    recebido: p.recebido,
    esperadoAteHoje: esperado,
    indice,
    projecao,
    falta,
    necessarioPorDia,
    status,
  };
}

export type PessoaPace = {
  id: string;
  nome: string;
  cargo: string;
  recebido: number;
  /** Quantidade de vendas no mês. */
  vendas: number;
  /** Meta individual (divisão igual entre closers e executivos); null para Head (meta da unidade) e pré-vendas. */
  meta: number | null;
  /** Papel no portal (o Diretor aparece como Diretor Comercial). */
  role?: string | null;
};

export type PaceNegocio = {
  negocio: { id: string; slug: string; nome: string; equipe_nome: string | null; equipe_bandeira: string | null; status: string };
  pace: PaceCalculado;
  /** Acumulado por dia do mês até hoje (dias corridos), para o gráfico. */
  acumulado: { data: string; valor: number }[];
  pessoas: PessoaPace[];
  /** Vorp Finance: vendas feitas pelo Matri, sem ninguém do time do Finance. Ficam fora do recebido do time. */
  extra: { recebido: number; vendas: number } | null;
};

/** Cargos que vendem e dividem a meta em partes iguais (closers e executivos). O Head não entra: ele
 *  responde pela meta da unidade inteira, como líder. SDR, BDR e pré-vendas têm meta de esforço (17/11/2026). */
export const CARGOS_QUE_VENDEM = ["executivo", "closer"];

export async function buscarPaceNegocios(
  supabase: SupabaseClient,
  ano: number,
  mes: number,
  hoje: string,
  slugs?: string[],
): Promise<PaceNegocio[]> {
  const { inicio, fim } = limitesDoMes(ano, mes);
  const fimExcl = proximoDia(fim);

  let q = supabase
    .from("negocios")
    .select("id, slug, nome, equipe_nome, equipe_bandeira, status")
    .eq("status", "ativo")
    .order("ordem");
  if (slugs && slugs.length > 0) q = q.in("slug", slugs);
  const { data: negocios } = await q;
  const lista = negocios ?? [];
  if (lista.length === 0) return [];
  const ids = lista.map((n) => n.id);

  const [{ data: metas }, { data: vendas }, { data: membros }, ganhosCrm] = await Promise.all([
    supabase.from("metas_negocio").select("negocio_id, meta_recebimento").eq("ano", ano).eq("mes", mes).in("negocio_id", ids),
    supabase.from("vendas").select("id, negocio_id, profile_id, indicador_id, valor, data").in("negocio_id", ids).gte("data", inicio).lt("data", fimExcl).range(0, 19999),
    supabase.from("profile_negocios").select("negocio_id, cargo, profiles!inner(id, full_name, ativo, role)").in("negocio_id", ids),
    buscarGanhosCrm(lista, inicio, fimExcl),
  ]);

  const idFinance = lista.find((n) => n.slug === "vorp-finance")?.id;
  const fundoMatri = await vendasDoFundoMatri((vendas ?? []).filter((v) => v.negocio_id === idFinance).map((v) => v.id as string));
  const metaPor = new Map((metas ?? []).map((m) => [m.negocio_id as string, Number(m.meta_recebimento)]));

  type P = { id: string; full_name: string; ativo: boolean; role: string | null };
  type M = { negocio_id: string; cargo: string; profiles: P | P[] };
  const membrosPor = new Map<string, { id: string; nome: string; cargo: string; role: string | null }[]>();
  for (const m of (membros ?? []) as unknown as M[]) {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    if (!p || !p.ativo) continue;
    const arr = membrosPor.get(m.negocio_id) ?? [];
    arr.push({ id: p.id, nome: p.full_name, cargo: m.cargo, role: p.role ?? null });
    membrosPor.set(m.negocio_id, arr);
  }

  return lista.map((n) => {
    // A meta vem do forecast; a digitada à mão só vale onde não há forecast.
    const meta = Math.round(metaForecast(n.slug, ano, mes)) || (metaPor.get(n.id) ?? 0);
    // Negócio com recebidoPeloCrm (Energy): Ganhos do CRM, sem pessoa do portal; os demais, tabela vendas.
    const crm = ganhosCrm.get(n.id);
    const todas: { id?: string; profile_id: string | null; indicador_id?: string | null; valor: number; data: string }[] = crm
      ? crm.map((g) => ({ profile_id: null, valor: g.valor, data: g.data }))
      : (vendas ?? []).filter((v) => v.negocio_id === n.id);
    // Vorp Finance: venda do fundo do Matri sem o dono nem o participante no time do Finance vai para o "Extra".
    const timeFinance = new Set((membrosPor.get(n.id) ?? []).map((m) => m.id));
    const ehExtra = (v: { id?: string; profile_id: string | null; indicador_id?: string | null }) => ehVendaExtra({ id: v.id ?? "", profile_id: v.profile_id, indicador_id: v.indicador_id }, timeFinance, fundoMatri);
    const extraVendas = n.slug === "vorp-finance" && !crm ? todas.filter(ehExtra) : [];
    const doNegocio = extraVendas.length > 0 ? todas.filter((v) => !ehExtra(v)) : todas;
    const extra = n.slug === "vorp-finance" ? { recebido: extraVendas.reduce((s, v) => s + Number(v.valor), 0), vendas: extraVendas.length } : null;
    const recebido = doNegocio.reduce((s, v) => s + Number(v.valor), 0);

    const porDia = new Map<string, number>();
    const porPessoa = new Map<string, number>();
    const qtdPorPessoa = new Map<string, number>();
    for (const v of doNegocio) {
      porDia.set(v.data, (porDia.get(v.data) ?? 0) + Number(v.valor));
      if (v.profile_id) {
        porPessoa.set(v.profile_id, (porPessoa.get(v.profile_id) ?? 0) + Number(v.valor));
        qtdPorPessoa.set(v.profile_id, (qtdPorPessoa.get(v.profile_id) ?? 0) + 1);
      }
    }
    const acumulado: { data: string; valor: number }[] = [];
    let soma = 0;
    const ate = hoje > fim ? fim : hoje;
    for (let c = inicio; c <= ate; c = proximoDia(c)) {
      soma += porDia.get(c) ?? 0;
      acumulado.push({ data: c, valor: soma });
    }

    const equipe = membrosPor.get(n.id) ?? [];
    const vendedores = equipe.filter((m) => CARGOS_QUE_VENDEM.includes(m.cargo));
    const metaIndividual = vendedores.length > 0 ? meta / vendedores.length : null;
    const pessoas: PessoaPace[] = equipe
      .map((m) => ({
        id: m.id,
        nome: m.nome,
        cargo: m.cargo,
        role: m.role,
        recebido: porPessoa.get(m.id) ?? 0,
        vendas: qtdPorPessoa.get(m.id) ?? 0,
        meta: CARGOS_QUE_VENDEM.includes(m.cargo) ? metaIndividual : null,
      }))
      .sort((a, b) => b.recebido - a.recebido || a.nome.localeCompare(b.nome, "pt-BR"));

    return { negocio: n, pace: calcularPace({ meta, recebido, hoje, ano, mes }), acumulado, pessoas, extra };
  });
}
