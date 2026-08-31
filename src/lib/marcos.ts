import type { SupabaseClient } from "@supabase/supabase-js";

// Marcos são cadastrados com 1 threshold só, pensado pra produção de SDR —
// Closer e Líder naturalmente produzem/lideram produção muito maior, então
// multiplicamos a meta pelo papel em vez de manter tabelas de marco
// duplicadas (2026-08-21, a pedido do Diretor; multiplicador ajustado de
// x3/x6 pra x2/x3 no mesmo dia, por esticar demais).
export const MARCO_MULTIPLICADOR_POR_ROLE: Record<string, number> = {
  sdr: 1,
  closer: 2,
  lider: 3,
};

// Os 3 marcos mais caros (Notebook + as 2 viagens) ficaram altos demais só
// com o multiplicador linear — valor fixo por papel pra esses, pedido
// explicitamente pelo Diretor (2026-08-21). Os outros 3 marcos continuam
// no multiplicador padrão acima.
const MARCO_THRESHOLD_OVERRIDE: Record<string, Partial<Record<"closer" | "lider", number>>> = {
  "Notebook": { closer: 2_000_000, lider: 3_000_000 },
  "Viagem Ceará p/ 2": { closer: 2_500_000, lider: 4_000_000 },
  "Viagem Brasil p/ 2": { closer: 3_000_000, lider: 5_000_000 },
};

// Exportado pra CentralNotificacoes.tsx (widget "perto de marco") calcular
// a mesma meta por papel sem duplicar a regra do override.
export function calcularThreshold(nome: string, thresholdBase: number, role: string): number {
  const multiplicador = MARCO_MULTIPLICADOR_POR_ROLE[role] ?? 1;
  const override = MARCO_THRESHOLD_OVERRIDE[nome]?.[role as "closer" | "lider"];
  return override ?? thresholdBase * multiplicador;
}

// Regra pontual pedida pelo Diretor (2026-08-29): "esse mês em específico,
// vendas que não foram de crédito mas sim 'compra' contam metade do valor
// no sistema de marcos... APENAS nesse quesito... somente ESSE mês, nos
// próximos vai ser normal". Isso NÃO mexe em DRE/Comissão/Forecast — só
// nesse cálculo de produção-pra-marco. Chave é a competência "YYYY-MM";
// pra voltar ao normal em setembro basta não adicionar a competência nova
// aqui (não precisa remover nada, a lista só cresce com os meses de exceção).
const MARCO_COMPETENCIAS_COMPRA_METADE = new Set(["2026-08"]);

// Soma a produção (vendas) de uma ou mais pessoas no período, aplicando a
// regra de "Compra vale metade" quando a competência do mês corrente está
// na lista de exceção acima. Uma linha de `vendas` sem weekly_operacao_id
// (ou cujo produto não veio) conta valor cheio — não penaliza por falta de
// dado, só quando dá pra confirmar que é Compra de verdade.
export async function buscarProducaoMesParaMarcos(
  supabase: SupabaseClient,
  profileIds: string[],
  inicioMes: string
): Promise<Map<string, number>> {
  const producaoPorPessoa = new Map<string, number>();
  if (profileIds.length === 0) return producaoPorPessoa;

  const competencia = inicioMes.slice(0, 7);
  const aplicaRegraCompra = MARCO_COMPETENCIAS_COMPRA_METADE.has(competencia);

  if (aplicaRegraCompra) {
    const { data: vendasMes } = await supabase
      .from("vendas")
      .select("profile_id, valor, weekly_operacao:weekly_operacoes(produto)")
      .in("profile_id", profileIds)
      .gte("data", inicioMes);
    for (const v of vendasMes ?? []) {
      const produto = (v.weekly_operacao as unknown as { produto: string | null } | null)?.produto;
      const fator = produto === "compra" ? 0.5 : 1;
      producaoPorPessoa.set(v.profile_id, (producaoPorPessoa.get(v.profile_id) ?? 0) + Number(v.valor) * fator);
    }
    return producaoPorPessoa;
  }

  const { data: vendasMes } = await supabase.from("vendas").select("profile_id, valor").in("profile_id", profileIds).gte("data", inicioMes);
  for (const v of vendasMes ?? []) {
    producaoPorPessoa.set(v.profile_id, (producaoPorPessoa.get(v.profile_id) ?? 0) + Number(v.valor));
  }
  return producaoPorPessoa;
}

export type MarcoProgresso = {
  id: string;
  nome: string;
  threshold: number;
  icone: string;
  imagemUrl: string | null;
  // Já resgatado alguma vez (registro permanente em marcos_resgates) — o
  // troféu fica "aberto" pra sempre, independente do mês corrente.
  alcancado: boolean;
  resgatadoEm: string | null;
  // Bateu o threshold NESTE mês, ainda não foi resgatado, e a pessoa ainda
  // não usou o resgate do mês em outro marco (só 1 resgate/mês/pessoa).
  elegivel: boolean;
  falta: number;
};

// Produção do MÊS CORRENTE (não mais soma acumulada do ano — essa era a
// causa de gente aparecer "batendo marco" sem ter batido nada no mês, só
// por acúmulo ao longo do ano). Cada marco só pode ser resgatado uma vez na
// vida por pessoa, e no máximo um resgate por pessoa por mês (ver
// marcos_resgates, migration 0026) — quem confirma o resgate é o Diretor.
export async function buscarProgressoMarcos(
  supabase: SupabaseClient,
  profileId: string,
  role: string = "sdr"
): Promise<{ marcos: MarcoProgresso[]; producaoMes: number }> {
  const hoje = new Date().toISOString().slice(0, 10);
  const inicioMes = hoje.slice(0, 7) + "-01";
  const competenciaAtual = inicioMes;

  const [{ data: marcosRows }, producaoPorPessoa, { data: resgates }] = await Promise.all([
    supabase.from("marcos").select("id, nome, threshold, icone, imagem_url").order("ordem"),
    buscarProducaoMesParaMarcos(supabase, [profileId], inicioMes),
    supabase.from("marcos_resgates").select("marco_id, competencia, criado_em").eq("profile_id", profileId),
  ]);

  const producaoMes = producaoPorPessoa.get(profileId) ?? 0;

  const resgatePorMarco = new Map((resgates ?? []).map((r) => [r.marco_id, r]));
  // Já usou o resgate do mês corrente em algum outro marco?
  const jaResgatouEsteMes = (resgates ?? []).some((r) => r.competencia === competenciaAtual);

  const marcos = (marcosRows ?? []).map((m) => {
    const threshold = calcularThreshold(m.nome, m.threshold, role);
    const resgate = resgatePorMarco.get(m.id);
    const alcancado = !!resgate;
    const elegivel = !alcancado && !jaResgatouEsteMes && producaoMes >= threshold;
    return {
      id: m.id,
      nome: m.nome,
      threshold,
      icone: m.icone,
      imagemUrl: m.imagem_url,
      alcancado,
      resgatadoEm: resgate?.criado_em ?? null,
      elegivel,
      falta: Math.max(0, threshold - producaoMes),
    };
  });

  return { marcos, producaoMes };
}
