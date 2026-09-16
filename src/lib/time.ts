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

// Auditoria 2026-09-16 (achado no Comando Geral: 22 assinaturas/10 pagos
// mostrados quando o real era 12/6) — producao_funil tem uma linha por
// PAPEL pra entrevistas/assinaturas/pagos (SDR e Closer cada um credita a
// própria linha da MESMA operação), então somar toda linha do grupo conta
// a operação 2x sempre que os dois lados estão no mesmo escopo (Tribo/
// Exército/Firma). Tentativas/Alôs/Conexões não têm esse risco — só o SDR
// loga. Mesma raiz de bug já corrigida em buscarVisaoDiaria (2026-09-09,
// ver visao-diaria.ts) — replicado aqui, que alimenta Tribo/Exército/
// Comando Geral.
export async function buscarFunilColetivo(supabase: SupabaseClient, profileIds: string[]) {
  const totais = Object.fromEntries(
    FUNNEL_STAGES.map((e) => [e, { realizado: 0, meta: 0 }])
  ) as Record<FunilEtapa, { realizado: number; meta: number }>;
  if (profileIds.length === 0) return totais;

  const inicioMes = inicioMesBR();

  // Tentativas/Alôs/Conexões: soma direta (sem risco de duplicar).
  // Entrevistas: cada entrevista credita SDR e Closer separados — conta só
  // o lado SDR (papel != "closer"), mesmo padrão de buscarVisaoDiaria.
  const { data: funilRows } = await supabase
    .from("producao_funil")
    .select("etapa, realizado, meta, papel")
    .in("profile_id", profileIds)
    .in("etapa", ["tentativas", "alos", "conexoes", "entrevistas"])
    .gte("data", inicioMes);
  for (const row of funilRows ?? []) {
    const etapa = row.etapa as FunilEtapa;
    if (etapa === "entrevistas" && row.papel === "closer") continue;
    totais[etapa].realizado += row.realizado;
    totais[etapa].meta += row.meta;
  }

  // Assinaturas/Pagos: vêm de weekly_operacoes (1 linha por OPERAÇÃO, dono
  // = SDR+Closer) em vez de producao_funil — crédito 1x quando pelo menos
  // um dos dois lados está no escopo pedido, mesma convenção de "data" (não
  // pago_em) que o resto do sistema já usa pra crédito do mês (ver
  // comentário em campanhas.ts).
  const idsCsv = profileIds.join(",");
  const [{ data: opsAssinadas }, { data: opsPagas }] = await Promise.all([
    supabase
      .from("weekly_operacoes")
      .select("sdr_profile_id, closer_profile_id")
      .gte("data", inicioMes)
      .or(`sdr_profile_id.in.(${idsCsv}),closer_profile_id.in.(${idsCsv})`),
    supabase
      .from("weekly_operacoes")
      .select("sdr_profile_id, closer_profile_id")
      .eq("status", "PAGO")
      .gte("data", inicioMes)
      .or(`sdr_profile_id.in.(${idsCsv}),closer_profile_id.in.(${idsCsv})`),
  ]);
  totais.assinaturas.realizado = (opsAssinadas ?? []).length;
  totais.pagos.realizado = (opsPagas ?? []).length;

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
