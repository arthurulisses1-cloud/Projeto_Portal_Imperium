// Pace de recebimento por negócio: onde a equipe deveria estar hoje, onde está
// e para onde caminha no fim do mês. Dias úteis = seg-sex (feriados ainda não
// entram). Pura em calcularPace; o acesso ao banco fica em buscarPaceNegocio.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ehFimDeSemana, paraDataUTC } from "@/lib/data-br";

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

/** Dias úteis (seg-sex) em [inicio, fim], inclusive. */
export function diasUteis(inicio: string, fim: string): number {
  let n = 0;
  for (let c = inicio; c <= fim; c = proximoDia(c)) if (!ehFimDeSemana(c)) n++;
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
  /** Meta individual (divisão igual entre quem vende); null para SDR/BDR/pré-vendas. */
  meta: number | null;
};

export type PaceNegocio = {
  negocio: { id: string; slug: string; nome: string; equipe_nome: string | null; equipe_bandeira: string | null; status: string };
  pace: PaceCalculado;
  /** Acumulado por dia do mês até hoje (dias corridos), para o gráfico. */
  acumulado: { data: string; valor: number }[];
  pessoas: PessoaPace[];
};

/** Cargos que vendem e dividem a meta em partes iguais. SDR e BDR ficam de fora
 *  (a meta deles é de esforço/canal, não de recebimento). */
const CARGOS_QUE_VENDEM = ["executivo", "closer", "head"];

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

  const [{ data: metas }, { data: vendas }, { data: membros }] = await Promise.all([
    supabase.from("metas_negocio").select("negocio_id, meta_recebimento").eq("ano", ano).eq("mes", mes).in("negocio_id", ids),
    supabase.from("vendas").select("negocio_id, profile_id, valor, data").in("negocio_id", ids).gte("data", inicio).lt("data", fimExcl).range(0, 19999),
    supabase.from("profile_negocios").select("negocio_id, cargo, profiles!inner(id, full_name, ativo)").in("negocio_id", ids),
  ]);

  const metaPor = new Map((metas ?? []).map((m) => [m.negocio_id as string, Number(m.meta_recebimento)]));

  type M = { negocio_id: string; cargo: string; profiles: { id: string; full_name: string; ativo: boolean } | { id: string; full_name: string; ativo: boolean }[] };
  const membrosPor = new Map<string, { id: string; nome: string; cargo: string }[]>();
  for (const m of (membros ?? []) as unknown as M[]) {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    if (!p || !p.ativo) continue;
    const arr = membrosPor.get(m.negocio_id) ?? [];
    arr.push({ id: p.id, nome: p.full_name, cargo: m.cargo });
    membrosPor.set(m.negocio_id, arr);
  }

  return lista.map((n) => {
    const meta = metaPor.get(n.id) ?? 0;
    const doNegocio = (vendas ?? []).filter((v) => v.negocio_id === n.id);
    const recebido = doNegocio.reduce((s, v) => s + Number(v.valor), 0);

    const porDia = new Map<string, number>();
    const porPessoa = new Map<string, number>();
    for (const v of doNegocio) {
      porDia.set(v.data, (porDia.get(v.data) ?? 0) + Number(v.valor));
      porPessoa.set(v.profile_id, (porPessoa.get(v.profile_id) ?? 0) + Number(v.valor));
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
        recebido: porPessoa.get(m.id) ?? 0,
        meta: CARGOS_QUE_VENDEM.includes(m.cargo) ? metaIndividual : null,
      }))
      .sort((a, b) => b.recebido - a.recebido || a.nome.localeCompare(b.nome, "pt-BR"));

    return { negocio: n, pace: calcularPace({ meta, recebido, hoje, ano, mes }), acumulado, pessoas };
  });
}
