import type { SupabaseClient } from "@supabase/supabase-js";

// Marcos são cadastrados com 1 threshold só, pensado pra produção de SDR —
// Closer e Líder naturalmente produzem/lideram produção muito maior, então
// multiplicamos a meta pelo papel em vez de manter tabelas de marco
// duplicadas (2026-08-21, a pedido do Diretor).
export const MARCO_MULTIPLICADOR_POR_ROLE: Record<string, number> = {
  sdr: 1,
  closer: 3,
  lider: 6,
};

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
  const multiplicador = MARCO_MULTIPLICADOR_POR_ROLE[role] ?? 1;
  const hoje = new Date().toISOString().slice(0, 10);
  const inicioMes = hoje.slice(0, 7) + "-01";
  const competenciaAtual = inicioMes;

  const [{ data: marcosRows }, { data: vendasMes }, { data: resgates }] = await Promise.all([
    supabase.from("marcos").select("id, nome, threshold, icone, imagem_url").order("ordem"),
    supabase.from("vendas").select("valor").eq("profile_id", profileId).gte("data", inicioMes),
    supabase.from("marcos_resgates").select("marco_id, competencia, criado_em").eq("profile_id", profileId),
  ]);

  const producaoMes = (vendasMes ?? []).reduce((s, v) => s + Number(v.valor), 0);

  const resgatePorMarco = new Map((resgates ?? []).map((r) => [r.marco_id, r]));
  // Já usou o resgate do mês corrente em algum outro marco?
  const jaResgatouEsteMes = (resgates ?? []).some((r) => r.competencia === competenciaAtual);

  const marcos = (marcosRows ?? []).map((m) => {
    const threshold = m.threshold * multiplicador;
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
