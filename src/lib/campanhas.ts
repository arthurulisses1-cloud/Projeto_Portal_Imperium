import type { SupabaseClient } from "@supabase/supabase-js";

export type CampanhaAlvo = "geral" | "individual" | "tribo" | "exercito" | "grupo_rank";

export type CampanhaParticipanteProgresso = {
  refId: string;
  label: string;
  valor: number;
};

export type ImagemPosicao = "top" | "center" | "bottom";

export type CampanhaComProgresso = {
  id: string;
  titulo: string;
  descricao: string | null;
  requisitosMinimos: string | null;
  recompensa: string | null;
  imagemUrl: string | null;
  imagemPosicao: ImagemPosicao;
  alvo: CampanhaAlvo;
  metrica: string;
  metaValor: number | null;
  dataInicio: string;
  dataFim: string;
  participantes: CampanhaParticipanteProgresso[];
};

// Todas as campanhas cujo período cobre hoje, com o progresso de cada
// participante já calculado (geral = um único total; duelo = um valor
// por pessoa/Tribo/Exército participante).
export async function buscarCampanhasAtivas(supabase: SupabaseClient): Promise<CampanhaComProgresso[]> {
  const hoje = new Date().toISOString().slice(0, 10);

  // requisitos_minimos/recompensa vêm da migration 0034, imagem_posicao da
  // 0046 — se alguma ainda não rodou nesse banco, o select com essas
  // colunas falha e cai no fallback sem elas, pra não quebrar o Mural
  // inteiro enquanto a migration pendente não roda (mesmo padrão do
  // Forecast com motivo_queda).
  let campanhas: {
    id: string;
    titulo: string;
    descricao: string | null;
    requisitos_minimos: string | null;
    recompensa: string | null;
    imagem_url: string | null;
    imagem_posicao: string | null;
    alvo: string;
    metrica: string;
    meta_valor: number | null;
    data_inicio: string;
    data_fim: string;
  }[] | null;
  const comColunasNovas = await supabase
    .from("campanhas")
    .select(
      "id, titulo, descricao, requisitos_minimos, recompensa, imagem_url, imagem_posicao, alvo, metrica, meta_valor, data_inicio, data_fim"
    )
    .lte("data_inicio", hoje)
    .gte("data_fim", hoje)
    .order("created_at", { ascending: false });
  if (comColunasNovas.error) {
    const fallback = await supabase
      .from("campanhas")
      .select("id, titulo, descricao, imagem_url, alvo, metrica, meta_valor, data_inicio, data_fim")
      .lte("data_inicio", hoje)
      .gte("data_fim", hoje)
      .order("created_at", { ascending: false });
    campanhas = (fallback.data ?? []).map((c) => ({ ...c, requisitos_minimos: null, recompensa: null, imagem_posicao: null }));
  } else {
    campanhas = comColunasNovas.data;
  }

  if (!campanhas || campanhas.length === 0) return [];

  const campanhaIds = campanhas.map((c) => c.id);
  const { data: participantesRows } = await supabase
    .from("campanha_participantes")
    .select("campanha_id, ref_id, label")
    .in("campanha_id", campanhaIds);

  const { data: pessoas } = await supabase
    .from("profiles")
    .select("id, tribo_id")
    .in("role", ["sdr", "closer"]);
  const { data: tribos } = await supabase.from("tribos").select("id, exercito_id");

  const menorData = campanhas.reduce((min, c) => (c.data_inicio < min ? c.data_inicio : min), campanhas[0].data_inicio);
  const maiorData = campanhas.reduce((max, c) => (c.data_fim > max ? c.data_fim : max), campanhas[0].data_fim);
  const todosIds = (pessoas ?? []).map((p) => p.id);

  const [{ data: vendasRows }, { data: funilRows }] = await Promise.all([
    todosIds.length > 0
      ? supabase.from("vendas").select("profile_id, valor, data").in("profile_id", todosIds).gte("data", menorData).lte("data", maiorData)
      : Promise.resolve({ data: [] }),
    todosIds.length > 0
      ? supabase
          .from("producao_funil")
          .select("profile_id, etapa, realizado, data")
          .in("profile_id", todosIds)
          .gte("data", menorData)
          .lte("data", maiorData)
      : Promise.resolve({ data: [] }),
  ]);

  function membrosDe(alvo: CampanhaAlvo, refId: string): string[] {
    // "grupo_rank" foi auto-populado com um participante por PESSOA (o
    // cargo já foi resolvido na hora de criar a campanha, ver
    // criarCampanha) — daqui pra frente é ranking por pessoa, igual "individual".
    if (alvo === "individual" || alvo === "grupo_rank") return [refId];
    if (alvo === "tribo") return (pessoas ?? []).filter((p) => p.tribo_id === refId).map((p) => p.id);
    if (alvo === "exercito") {
      const tribosDoExercito = new Set((tribos ?? []).filter((t) => t.exercito_id === refId).map((t) => t.id));
      return (pessoas ?? []).filter((p) => p.tribo_id && tribosDoExercito.has(p.tribo_id)).map((p) => p.id);
    }
    return todosIds; // geral
  }

  function valorMetrica(profileIds: string[], metrica: string, dataInicio: string, dataFim: string): number {
    const idsSet = new Set(profileIds);
    if (metrica === "credito") {
      return (vendasRows ?? [])
        .filter((v) => idsSet.has(v.profile_id) && v.data >= dataInicio && v.data <= dataFim)
        .reduce((s, v) => s + Number(v.valor), 0);
    }
    return (funilRows ?? [])
      .filter((f) => idsSet.has(f.profile_id) && f.etapa === metrica && f.data >= dataInicio && f.data <= dataFim)
      .reduce((s, f) => s + f.realizado, 0);
  }

  return campanhas.map((c) => {
    const participantesDaCampanha = (participantesRows ?? []).filter((p) => p.campanha_id === c.id);

    const participantes: CampanhaParticipanteProgresso[] =
      c.alvo === "geral"
        ? [{ refId: "geral", label: c.titulo, valor: valorMetrica(membrosDe("geral", ""), c.metrica, c.data_inicio, c.data_fim) }]
        : participantesDaCampanha
            .map((p) => ({
              refId: p.ref_id,
              label: p.label,
              valor: valorMetrica(membrosDe(c.alvo as CampanhaAlvo, p.ref_id), c.metrica, c.data_inicio, c.data_fim),
            }))
            .sort((a, b) => b.valor - a.valor);

    return {
      id: c.id,
      titulo: c.titulo,
      descricao: c.descricao,
      requisitosMinimos: c.requisitos_minimos,
      recompensa: c.recompensa,
      imagemUrl: c.imagem_url,
      imagemPosicao: (c.imagem_posicao as ImagemPosicao | null) ?? "center",
      alvo: c.alvo as CampanhaAlvo,
      metrica: c.metrica,
      metaValor: c.meta_valor,
      dataInicio: c.data_inicio,
      dataFim: c.data_fim,
      participantes,
    };
  });
}
