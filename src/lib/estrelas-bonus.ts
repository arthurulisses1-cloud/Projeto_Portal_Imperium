import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeBR } from "@/lib/data-br";
import { buscarMetaIndividual } from "@/lib/metas";

// Bônus mensais de estrela (pedido do Diretor, 2026-10-15) — automático:
//   • bateu a meta individual do mês  → +1 (estrela cheia extra)
//   • melhor SDR do mês               → +1
//   • melhor Closer do mês            → +1
// "Melhor" = maior crédito PAGO no mês entre quem tem o papel (empate premia
// todos os empatados; crédito zero nunca premia). A meta individual é a mesma
// do Mural/Metas (Tribo ÷ membros, com overrides).

export type TipoBonus = "meta_individual" | "melhor_sdr" | "melhor_closer";
export type PessoaApuracao = { id: string; role: "sdr" | "closer"; credito: number; meta: number };
export type BonusCalculado = { profileId: string; tipo: TipoBonus; valor: number; detalhe: string };

// A regra vale a partir da competência de outubro/2026 (não retroage).
export const PRIMEIRA_COMPETENCIA_BONUS = "2026-10";
// Só apura a partir do dia 3 do mês seguinte, pra os pagamentos do fim do mês
// terem tempo de cair no sistema.
export const DIA_DE_APURAR = 3;

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function calcularBonusMensal(pessoas: PessoaApuracao[]): BonusCalculado[] {
  const bonus: BonusCalculado[] = [];

  for (const p of pessoas) {
    if (p.meta > 0 && p.credito >= p.meta) {
      bonus.push({ profileId: p.id, tipo: "meta_individual", valor: 1, detalhe: `Pago ${moeda(p.credito)} de meta ${moeda(p.meta)}` });
    }
  }

  const melhores = (role: "sdr" | "closer", tipo: TipoBonus) => {
    const doPapel = pessoas.filter((p) => p.role === role && p.credito > 0);
    if (doPapel.length === 0) return;
    const maior = Math.max(...doPapel.map((p) => p.credito));
    for (const p of doPapel.filter((x) => x.credito === maior)) {
      bonus.push({ profileId: p.id, tipo, valor: 1, detalhe: `Maior crédito pago do mês: ${moeda(p.credito)}` });
    }
  };
  melhores("sdr", "melhor_sdr");
  melhores("closer", "melhor_closer");

  return bonus;
}

// Mês anterior ao de `hoje` ("YYYY-MM-DD") → intervalo (fim inclusivo)
export function competenciaAnterior(hoje: string) {
  const [a, m] = hoje.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  const ano = d.getUTCFullYear();
  const mes = d.getUTCMonth() + 1;
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fim = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
  return { ano, mes, inicio, fim, chave: inicio.slice(0, 7) };
}

// Roda no fim do sync (a cada ~30 min). Idempotente: a unique
// (profile_id, competencia, tipo) garante que cada bônus é concedido uma vez só
// — só soma em stars_total quem de fato foi inserido agora.
export async function apurarBonusEstrelas(supabase: SupabaseClient, hoje = hojeBR()): Promise<{ concedidos: number }> {
  if (Number(hoje.slice(8, 10)) < DIA_DE_APURAR) return { concedidos: 0 };
  const comp = competenciaAnterior(hoje);
  if (comp.chave < PRIMEIRA_COMPETENCIA_BONUS) return { concedidos: 0 };

  // Já apurado esse mês (ou tabela ainda não criada: migration 0095 pendente) — não faz nada.
  const { count, error: erroTabela } = await supabase
    .from("estrelas_bonus")
    .select("id", { count: "exact", head: true })
    .eq("competencia", comp.inicio);
  if (erroTabela || (count ?? 0) > 0) return { concedidos: 0 };

  const { data: pessoasRaw } = await supabase.from("profiles").select("id, role").in("role", ["sdr", "closer"]).eq("ativo", true);
  const pessoasBase = (pessoasRaw ?? []) as { id: string; role: "sdr" | "closer" }[];
  if (pessoasBase.length === 0) return { concedidos: 0 };

  const { data: vendas } = await supabase
    .from("vendas")
    .select("profile_id, valor, papel")
    .in("profile_id", pessoasBase.map((p) => p.id))
    .gte("data", comp.inicio)
    .lte("data", comp.fim);
  const credito = new Map<string, number>();
  const papelDoRole = (role: "sdr" | "closer") => (role === "sdr" ? ["sdr", "ambos"] : ["closer", "ambos"]);
  for (const v of vendas ?? []) {
    const p = pessoasBase.find((x) => x.id === v.profile_id);
    if (!p || !papelDoRole(p.role).includes(v.papel)) continue;
    credito.set(v.profile_id, (credito.get(v.profile_id) ?? 0) + Number(v.valor));
  }

  const apuracao: PessoaApuracao[] = [];
  for (const p of pessoasBase) {
    const { metaCreditoIndividual } = await buscarMetaIndividual(supabase, p.id, { ano: comp.ano, mes: comp.mes });
    apuracao.push({ id: p.id, role: p.role, credito: credito.get(p.id) ?? 0, meta: Number(metaCreditoIndividual) || 0 });
  }

  const calculados = calcularBonusMensal(apuracao);
  if (calculados.length === 0) return { concedidos: 0 };

  const { data: inseridos, error } = await supabase
    .from("estrelas_bonus")
    .upsert(
      calculados.map((b) => ({ profile_id: b.profileId, competencia: comp.inicio, tipo: b.tipo, valor: b.valor, detalhe: b.detalhe })),
      { onConflict: "profile_id,competencia,tipo", ignoreDuplicates: true }
    )
    .select("profile_id, valor");
  if (error) throw new Error(error.message);

  const somaPorPessoa = new Map<string, number>();
  for (const i of inseridos ?? []) somaPorPessoa.set(i.profile_id, (somaPorPessoa.get(i.profile_id) ?? 0) + Number(i.valor));
  for (const [id, soma] of Array.from(somaPorPessoa)) {
    const { data: p } = await supabase.from("profiles").select("stars_total").eq("id", id).single();
    await supabase.from("profiles").update({ stars_total: Number(p?.stars_total ?? 0) + soma }).eq("id", id);
  }
  return { concedidos: (inseridos ?? []).length };
}
