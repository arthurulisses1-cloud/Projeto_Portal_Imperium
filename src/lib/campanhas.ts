import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeBR } from "@/lib/data-br";

export type CampanhaAlvo = "geral" | "individual" | "tribo" | "exercito" | "grupo_rank";
export type PapelCredito = "sdr" | "closer" | "total";

export type CampanhaParticipanteProgresso = {
  refId: string;
  label: string;
  valor: number;
  // Só preenchido pra alvo="individual" (refId = profile_id) — usado pra
  // mostrar a foto de quem tá duelando no card (pedido do Diretor,
  // 2026-08-27: "ao invés de eu colocar fotos nos duelos, coloca a foto de
  // quem tá duelando"), em vez de uma imagem genérica de campanha. Vale
  // pra duelo de 2, 3 ou mais pessoas (pedido do Diretor, 2026-08-28).
  avatarUrl?: string | null;
  // Fundo do card do duelo, metade brasão da Tribo / metade brasão do
  // Exército de cada duelista (mesmo pedido, 2026-08-28) — null quando a
  // Tribo não tem logo cadastrada, ou a pessoa não tem Exército resolvido.
  triboCrestUrl?: string | null;
  exercitoCrestUrl?: string | null;
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
  papelCredito: PapelCredito;
  metaValor: number | null;
  dataInicio: string;
  dataFim: string;
  participantes: CampanhaParticipanteProgresso[];
  // Só preenchido quando metrica="pontuacao" (migration 0063, pedido do
  // Diretor, 2026-08-28: "entrevistas valerá uma pontuação e assinaturas
  // outra") — { etapa: peso }, chaves de FUNNEL_STAGES.
  pesos: Record<string, number> | null;
};

// Todas as campanhas cujo período cobre hoje, com o progresso de cada
// participante já calculado (geral = um único total; duelo = um valor
// por pessoa/Tribo/Exército participante).
//
// Métrica "credito": lê de weekly_operacoes (status PAGO, DATA DE
// ASSINATURA dentro do período — não pago_em) — NÃO da tabela `vendas`.
// Data de assinatura de propósito, pra bater com a mesma convenção que
// DRE/Comissão/Fechamento já usam pra "crédito do mês" em todo o resto do
// sistema (buscarFolha/buscarRemuneracaoMes filtram por `data`, não por
// `pago_em`) — usar pago_em aqui (tentativa anterior, 2026-08-24) deixava
// a campanha "geral" contando 3,47M quando o resto do sistema já mostrava
// 2,91M pro mesmo mês, porque um crédito assinado em julho e só marcado
// pago em agosto entrava na campanha de agosto mas na comissão de julho.
// `vendas` continua fora por outro motivo, que esse sim persiste: tem uma
// linha por PAPEL (SDR e Closer separados), então somar todo mundo de um
// time contava a mesma venda duas vezes sempre que SDR e Closer eram do
// mesmo Tribo/Exército. weekly_operacoes tem uma linha por OPERAÇÃO —
// dedupe natural.
export async function buscarCampanhasAtivas(supabase: SupabaseClient): Promise<CampanhaComProgresso[]> {
  const hoje = hojeBR();

  // requisitos_minimos/recompensa vêm da migration 0034, imagem_posicao da
  // 0046, papel_credito da 0047 — se alguma ainda não rodou nesse banco, o
  // select com essas colunas falha e cai no fallback sem elas, pra não
  // quebrar o Mural inteiro enquanto a migration pendente não roda (mesmo
  // padrão do Forecast com motivo_queda).
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
    papel_credito: string | null;
    meta_valor: number | null;
    data_inicio: string;
    data_fim: string;
    pesos: Record<string, number> | null;
  }[] | null;
  const comColunasNovas = await supabase
    .from("campanhas")
    .select(
      "id, titulo, descricao, requisitos_minimos, recompensa, imagem_url, imagem_posicao, alvo, metrica, papel_credito, meta_valor, data_inicio, data_fim, pesos"
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
    campanhas = (fallback.data ?? []).map((c) => ({
      ...c,
      requisitos_minimos: null,
      recompensa: null,
      imagem_posicao: null,
      papel_credito: null,
      pesos: null,
    }));
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
    .select("id, tribo_id, tribo:tribos!profiles_tribo_id_fkey(exercito_id, logo_url)")
    .in("role", ["sdr", "closer", "lider"]);
  // Legado do Exército não tem tribo_id (lidera o time inteiro, não uma
  // Tribo) — sem esse fallback, uma operação fechada por ele "perde" o
  // time (mesma regra usada em forecast/page.tsx e guerra.ts).
  const { data: exercitos } = await supabase.from("exercitos").select("id, nome, legado_id");
  const exercitoIdPorLegadoId = new Map((exercitos ?? []).map((e) => [e.legado_id, e.id]));
  const triboIdPorProfileId = new Map((pessoas ?? []).map((p) => [p.id, p.tribo_id]));
  const exercitoIdPorProfileId = new Map(
    (pessoas ?? []).map((p) => {
      const tribo = p.tribo as unknown as { exercito_id: string; logo_url: string | null } | null;
      return [p.id, tribo?.exercito_id ?? exercitoIdPorLegadoId.get(p.id) ?? null];
    })
  );
  const todosIds = (pessoas ?? []).map((p) => p.id);

  // Fundo dos cards de duelo (pedido do Diretor, 2026-08-28: "preencha o
  // fundo com metade bandeira da tribo, metade bandeira do exército") — a
  // Tribo tem logo própria (opcional, subida em /tribo); o Exército só tem
  // 2 hoje, sem coluna no banco pra isso, então o brasão é um arquivo fixo
  // (mesmo par já usado no confronto do Mural, ver src/app/(app)/page.tsx).
  const EXERCITO_CRESTS: Record<string, string> = {
    "Templários": "/crests/templarios.jpg",
    Maximus: "/crests/maximus.jpg",
  };
  const exercitoNomePorId = new Map((exercitos ?? []).map((e) => [e.id, e.nome]));
  const triboLogoPorProfileId = new Map(
    (pessoas ?? []).map((p) => {
      const tribo = p.tribo as unknown as { exercito_id: string; logo_url: string | null } | null;
      return [p.id, tribo?.logo_url ?? null];
    })
  );

  // Avatares dos duelos entre pessoas (pedido do Diretor: 2026-08-27 pra
  // duelo de 2, estendido 2026-08-28 pra 3+) — só busca pra participantes
  // de campanha alvo="individual" (refId = profile_id ali; em grupo_rank o
  // refId é um Cargo, não uma pessoa, não se aplica).
  const idsParticipantesIndividuais = Array.from(
    new Set(
      campanhas
        .filter((c) => c.alvo === "individual")
        .flatMap((c) => (participantesRows ?? []).filter((p) => p.campanha_id === c.id).map((p) => p.ref_id))
    )
  );
  const { data: avataresRaw } =
    idsParticipantesIndividuais.length > 0
      ? await supabase.from("profiles").select("id, avatar_url").in("id", idsParticipantesIndividuais)
      : { data: [] as { id: string; avatar_url: string | null }[] };
  const avatarPorProfileId = new Map((avataresRaw ?? []).map((a) => [a.id, a.avatar_url]));

  const menorData = campanhas.reduce((min, c) => (c.data_inicio < min ? c.data_inicio : min), campanhas[0].data_inicio);
  const maiorData = campanhas.reduce((max, c) => (c.data_fim > max ? c.data_fim : max), campanhas[0].data_fim);

  const [{ data: opsPagas }, { data: funilRows }] = await Promise.all([
    supabase
      .from("weekly_operacoes")
      .select("id, valor, sdr_profile_id, closer_profile_id, data")
      .eq("status", "PAGO")
      .gte("data", menorData)
      .lte("data", maiorData),
    todosIds.length > 0
      ? supabase
          .from("producao_funil")
          .select("profile_id, etapa, realizado, data")
          .in("profile_id", todosIds)
          .gte("data", menorData)
          .lte("data", maiorData)
      : Promise.resolve({ data: [] }),
  ]);

  function creditoNoPeriodo(dataInicio: string, dataFim: string) {
    return (opsPagas ?? []).filter((o) => o.data >= dataInicio && o.data <= dataFim);
  }

  // Time DONO da operação = time do Closer, com o SDR como fallback só
  // quando o Closer não resolve pra time nenhum — mesma convenção usada em
  // toda atribuição de time do sistema (Weekly, Guerra Civil, Forecast).
  // Evita contar a mesma venda duas vezes quando SDR e Closer são do
  // mesmo Tribo/Exército (quase sempre).
  function creditoPorTimeDono(dataInicio: string, dataFim: string, timePorProfileId: Map<string, string | null>) {
    const totais = new Map<string, number>();
    for (const o of creditoNoPeriodo(dataInicio, dataFim)) {
      const dono =
        (o.closer_profile_id && timePorProfileId.get(o.closer_profile_id)) ||
        (o.sdr_profile_id && timePorProfileId.get(o.sdr_profile_id)) ||
        null;
      if (!dono) continue;
      totais.set(dono, (totais.get(dono) ?? 0) + Number(o.valor));
    }
    return totais;
  }

  function creditoDaPessoa(dataInicio: string, dataFim: string, profileId: string, papel: PapelCredito) {
    return creditoNoPeriodo(dataInicio, dataFim)
      .filter((o) => {
        if (papel === "sdr") return o.sdr_profile_id === profileId;
        if (papel === "closer") return o.closer_profile_id === profileId;
        return o.sdr_profile_id === profileId || o.closer_profile_id === profileId;
      })
      .reduce((s, o) => s + Number(o.valor), 0);
  }

  function valorFunil(profileIds: string[], metrica: string, dataInicio: string, dataFim: string): number {
    const idsSet = new Set(profileIds);
    return (funilRows ?? [])
      .filter((f) => idsSet.has(f.profile_id) && f.etapa === metrica && f.data >= dataInicio && f.data <= dataFim)
      .reduce((s, f) => s + f.realizado, 0);
  }

  function membrosGeral(): string[] {
    return todosIds;
  }

  return campanhas.map((c) => {
    const alvo = c.alvo as CampanhaAlvo;
    const papelCredito = (c.papel_credito as PapelCredito | null) ?? "total";
    const participantesDaCampanha = (participantesRows ?? []).filter((p) => p.campanha_id === c.id);

    let participantes: CampanhaParticipanteProgresso[];

    // Reaproveitado tanto por métrica de funil única quanto por "pontuacao"
    // (soma ponderada de várias) — mesma regra de "de quem é a produção"
    // pras 4 formas de alvo.
    const membrosFunil = (refId: string): string[] => {
      if (alvo === "individual" || alvo === "grupo_rank") return [refId];
      if (alvo === "tribo") return (pessoas ?? []).filter((p) => p.tribo_id === refId).map((p) => p.id);
      if (alvo === "exercito") return (pessoas ?? []).filter((p) => exercitoIdPorProfileId.get(p.id) === refId).map((p) => p.id);
      return membrosGeral();
    };

    if (c.metrica === "pontuacao") {
      // "Entrevistas valerá uma pontuação e assinaturas outra, quem fizer
      // mais pontos ganha" (pedido do Diretor, 2026-08-28) — soma cada
      // etapa configurada em `pesos` já multiplicada pelo peso dela, num
      // placar só.
      const pesos = c.pesos ?? {};
      const pontuacaoDoGrupo = (profileIds: string[]) =>
        Object.entries(pesos).reduce((soma, [etapa, peso]) => soma + valorFunil(profileIds, etapa, c.data_inicio, c.data_fim) * Number(peso), 0);
      participantes =
        alvo === "geral"
          ? [{ refId: "geral", label: c.titulo, valor: pontuacaoDoGrupo(membrosGeral()) }]
          : participantesDaCampanha
              .map((p) => ({ refId: p.ref_id, label: p.label, valor: pontuacaoDoGrupo(membrosFunil(p.ref_id)) }))
              .sort((a, b) => b.valor - a.valor);
    } else if (c.metrica !== "credito") {
      // Métricas de funil (tentativas, alôs, conexões...) continuam por
      // pessoa, sem o problema de dedupe — cada pessoa credita sua própria
      // atividade, SDR e Closer não competem pelo mesmo número.
      participantes =
        alvo === "geral"
          ? [{ refId: "geral", label: c.titulo, valor: valorFunil(membrosGeral(), c.metrica, c.data_inicio, c.data_fim) }]
          : participantesDaCampanha
              .map((p) => ({ refId: p.ref_id, label: p.label, valor: valorFunil(membrosFunil(p.ref_id), c.metrica, c.data_inicio, c.data_fim) }))
              .sort((a, b) => b.valor - a.valor);
    } else if (alvo === "geral") {
      const total = creditoNoPeriodo(c.data_inicio, c.data_fim).reduce((s, o) => s + Number(o.valor), 0);
      participantes = [{ refId: "geral", label: c.titulo, valor: total }];
    } else if (alvo === "tribo") {
      const totais = creditoPorTimeDono(c.data_inicio, c.data_fim, triboIdPorProfileId);
      participantes = participantesDaCampanha
        .map((p) => ({ refId: p.ref_id, label: p.label, valor: totais.get(p.ref_id) ?? 0 }))
        .sort((a, b) => b.valor - a.valor);
    } else if (alvo === "exercito") {
      const totais = creditoPorTimeDono(c.data_inicio, c.data_fim, exercitoIdPorProfileId);
      participantes = participantesDaCampanha
        .map((p) => ({ refId: p.ref_id, label: p.label, valor: totais.get(p.ref_id) ?? 0 }))
        .sort((a, b) => b.valor - a.valor);
    } else {
      // individual / grupo_rank — duelo por pessoa, respeitando papelCredito
      // (produção como SDR e como Closer são coisas diferentes pro Tribuno
      // que às vezes ajuda como SDR também).
      participantes = participantesDaCampanha
        .map((p) => ({ refId: p.ref_id, label: p.label, valor: creditoDaPessoa(c.data_inicio, c.data_fim, p.ref_id, papelCredito) }))
        .sort((a, b) => b.valor - a.valor);
    }

    if (alvo === "individual") {
      participantes = participantes.map((p) => ({
        ...p,
        avatarUrl: avatarPorProfileId.get(p.refId) ?? null,
        triboCrestUrl: triboLogoPorProfileId.get(p.refId) ?? null,
        exercitoCrestUrl: EXERCITO_CRESTS[exercitoNomePorId.get(exercitoIdPorProfileId.get(p.refId) ?? "") ?? ""] ?? null,
      }));
    }

    return {
      id: c.id,
      titulo: c.titulo,
      descricao: c.descricao,
      requisitosMinimos: c.requisitos_minimos,
      recompensa: c.recompensa,
      imagemUrl: c.imagem_url,
      imagemPosicao: (c.imagem_posicao as ImagemPosicao | null) ?? "center",
      alvo,
      metrica: c.metrica,
      papelCredito,
      metaValor: c.meta_valor,
      dataInicio: c.data_inicio,
      dataFim: c.data_fim,
      participantes,
      pesos: c.pesos ?? null,
    };
  });
}
