import { FUNNEL_STAGES, type FunilEtapa } from "@/lib/funil";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeBR, inicioMesBR } from "@/lib/data-br";

export type Membro = { id: string; full_name: string; cargo?: string };

export async function buscarComprometimentoHoje(
  supabase: SupabaseClient,
  profileIds: string[]
) {
  if (profileIds.length === 0) return new Map<string, { status: string; falta: boolean }>();
  const hoje = hojeBR();
  const { data } = await supabase
    .from("compromissos")
    .select("profile_id, status, falta, lancado")
    .in("profile_id", profileIds)
    .eq("data", hoje);

  const map = new Map<string, { status: string; falta: boolean }>();
  for (const row of data ?? []) {
    map.set(row.profile_id, {
      status: row.falta ? "ausente" : row.lancado ? row.status : "não lançado",
      falta: row.falta,
    });
  }
  return map;
}

// Valor PAGO (R$) no mês por pessoa — não confundir com a contagem de
// operações "pagos" do funil (producao_funil.etapa='pagos', que é uma
// QUANTIDADE, não dinheiro; usar aquilo aqui formatado como moeda mostrava
// "R$ 3" quando eram 3 vendas, não R$ 3 de fato).
export async function buscarPagosMes(supabase: SupabaseClient, profileIds: string[]) {
  if (profileIds.length === 0) return new Map<string, number>();
  const inicioMes = inicioMesBR();
  const { data } = await supabase
    .from("vendas")
    .select("profile_id, valor")
    .in("profile_id", profileIds)
    .gte("data", inicioMes);

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    map.set(row.profile_id, (map.get(row.profile_id) ?? 0) + Number(row.valor));
  }
  return map;
}

export async function buscarFunilColetivo(supabase: SupabaseClient, profileIds: string[]) {
  const totais = Object.fromEntries(
    FUNNEL_STAGES.map((e) => [e, { realizado: 0, meta: 0 }])
  ) as Record<FunilEtapa, { realizado: number; meta: number }>;
  if (profileIds.length === 0) return totais;

  const inicioMes = inicioMesBR();
  const { data } = await supabase
    .from("producao_funil")
    .select("etapa, realizado, meta")
    .in("profile_id", profileIds)
    .gte("data", inicioMes);

  for (const row of data ?? []) {
    const etapa = row.etapa as FunilEtapa;
    totais[etapa].realizado += row.realizado;
    totais[etapa].meta += row.meta;
  }
  return totais;
}

export const STATUS_COR: Record<string, string> = {
  cumprido: "text-success-bright",
  andamento: "text-amber-400",
  nao_cumprido: "text-red-400",
  ausente: "text-stone-500",
  "não lançado": "text-stone-600",
};

export const STATUS_LABEL: Record<string, string> = {
  cumprido: "Cumprido",
  andamento: "Em andamento",
  nao_cumprido: "Não cumprido",
  ausente: "Ausente",
  "não lançado": "Não lançado",
};
