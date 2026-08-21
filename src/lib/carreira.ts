export const RANK_ORDER = ["legionario", "centuriao", "tribuno", "pretor", "legado"] as const;
export type Rank = (typeof RANK_ORDER)[number];

export const NEXT_RANK: Partial<Record<Rank, Rank>> = {
  legionario: "centuriao",
  centuriao: "tribuno",
  tribuno: "pretor",
  pretor: "legado",
};

export const NEXT_TRANSICAO: Partial<Record<Rank, string>> = {
  legionario: "legionario_centuriao",
  centuriao: "centuriao_tribuno",
  tribuno: "tribuno_pretor",
  pretor: "pretor_legado",
};

export const BLOCO_LABELS: Record<number, string> = {
  1: "Resultado",
  2: "HGV Atual",
  3: "Antecipação (Esse Quam Videri)",
  4: "Formação",
  5: "Cultura + Validação",
};

export const RANK_SUBTITLE: Record<Rank | "diretor", string> = {
  legionario: "SDR Jr",
  centuriao: "SDR Sr",
  tribuno: "Closer Jr",
  pretor: "Closer Sr",
  legado: "Líder",
  diretor: "Diretoria",
};

export const STAR_PACE: Record<Rank, { estrelas: number; cheia: number; meia: number }> = {
  legionario: { estrelas: 0, cheia: 0, meia: 0 },
  centuriao: { estrelas: 6, cheia: 3, meia: 2 },
  tribuno: { estrelas: 8, cheia: 5, meia: 3 },
  pretor: { estrelas: 10, cheia: 7, meia: 5 },
  legado: { estrelas: 12, cheia: 10, meia: 6 },
};

// Papel que define qual tier da tabela de comissão do cargo vale no mês —
// os outros papéis (ex: Tribuno fazendo prospecção como SDR) são remunerados
// pela % correspondente do MESMO tier, não por uma tabela de outro cargo.
export const PAPEL_PRINCIPAL: Record<Rank | "diretor", "sdr" | "closer" | "gestao"> = {
  legionario: "sdr",
  centuriao: "sdr",
  tribuno: "closer",
  pretor: "closer",
  legado: "gestao",
  diretor: "gestao",
};

export type CriterioPromocao = {
  id: string;
  bloco: number;
  texto: string;
  tipo: string;
  target_value: number | null;
  dias_strikes: number | null;
  ordem: number;
};

export type AvaliacaoCriterio = {
  automatico: boolean;
  cumprido: boolean;
  atual: number | null;
  meta: number | null;
  detalhe: string;
};

export type ContextoAvaliacaoCriterios = {
  starsTotal: number;
  entrevistasPorDia: number;
  mesesFechados: { mes: string; valor: number }[];
  vendaSozinho: boolean;
  livroApresentado: boolean | null; // null = nem escolheu livro ainda
  top1Tribo: Record<number, boolean>; // chave = janela em dias corridos, extraída do texto do critério
};

function moedaSimples(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

// Segunda-feira da semana de uma data, em yyyy-mm-dd — compartilhado entre
// /estrelas (extrato completo) e o mini-indicador da SidebarRight, pra nunca
// divergir em qual semana um pago cai.
export function inicioSemanaISO(dataISO: string): string {
  const d = new Date(dataISO + "T12:00:00");
  const diaSemana = (d.getDay() + 6) % 7; // 0 = segunda
  d.setDate(d.getDate() - diaSemana);
  return d.toISOString().slice(0, 10);
}

export function resultadoSemanaEstrela(
  qtd: number,
  pace: { cheia: number; meia: number }
): { label: string; cor: string; icone: string } {
  if (pace.cheia > 0 && qtd >= pace.cheia) return { label: "Estrela cheia", cor: "text-gold-bright", icone: "★" };
  if (pace.meia > 0 && qtd >= pace.meia) return { label: "Meia estrela", cor: "text-gold-dim", icone: "☆" };
  return { label: "Sem estrela", cor: "text-stone-600", icone: "—" };
}

// O que o sistema JÁ CONSEGUE verificar sozinho, sem precisar de input da
// gestão — casado com texto EXATO dos critérios cadastrados (ver
// supabase/migrations, promotion_criteria). Qualquer coisa fora desse
// reconhecimento (aulas da trilha — ainda sem dado —, Top 1 do banco, lives,
// avaliação do líder, match sales) cai no fluxo de solicitação de evidência
// (ver /carreira e promotion_evidence). Compartilhado entre /carreira (visão
// completa) e SidebarRight (resumo), pra nunca dar números diferentes.
export function avaliarCriterioAutomatico(
  criterio: CriterioPromocao,
  ctx: ContextoAvaliacaoCriterios
): AvaliacaoCriterio | null {
  const { texto, target_value } = criterio;

  if (/estrelas acumuladas/i.test(texto) && target_value) {
    return {
      automatico: true,
      cumprido: ctx.starsTotal >= target_value,
      atual: ctx.starsTotal,
      meta: target_value,
      detalhe: `${ctx.starsTotal}/${target_value} estrelas`,
    };
  }

  const matchEntrevistas = texto.match(/média de ([\d,.]+) entrevistas\/dia/i);
  if (matchEntrevistas) {
    const alvo = Number(matchEntrevistas[1].replace(",", "."));
    const atualArred = Math.round(ctx.entrevistasPorDia * 10) / 10;
    return {
      automatico: true,
      cumprido: ctx.entrevistasPorDia >= alvo,
      atual: atualArred,
      meta: alvo,
      detalhe: `${atualArred.toString().replace(".", ",")}/${alvo.toString().replace(".", ",")} entrevistas por dia, últimos 30 dias`,
    };
  }

  if (/sem mês zerado/i.test(texto)) {
    const zerados = ctx.mesesFechados.filter((m) => m.valor <= 0).length;
    return {
      automatico: true,
      cumprido: ctx.mesesFechados.length > 0 && zerados === 0,
      atual: ctx.mesesFechados.length - zerados,
      meta: ctx.mesesFechados.length,
      detalhe: `${ctx.mesesFechados.length - zerados}/${ctx.mesesFechados.length} últimos meses fechados com produção`,
    };
  }

  const matchPiso = texto.match(/sem mês abaixo de r\$?\s?([\d.,]+)k/i);
  if (matchPiso) {
    const piso = Number(matchPiso[1].replace(".", "").replace(",", ".")) * 1000;
    const abaixo = ctx.mesesFechados.filter((m) => m.valor < piso).length;
    return {
      automatico: true,
      cumprido: ctx.mesesFechados.length > 0 && abaixo === 0,
      atual: ctx.mesesFechados.length - abaixo,
      meta: ctx.mesesFechados.length,
      detalhe: `${ctx.mesesFechados.length - abaixo}/${ctx.mesesFechados.length} últimos meses acima de ${moedaSimples(piso)}`,
    };
  }

  if (/venda sozinho/i.test(texto)) {
    return {
      automatico: true,
      cumprido: ctx.vendaSozinho,
      atual: ctx.vendaSozinho ? 1 : 0,
      meta: 1,
      detalhe: ctx.vendaSozinho
        ? "Já fechou pelo menos 1 venda sozinho(a)"
        : "Ainda não fechou nenhuma venda sozinho(a) (SDR + Closer na mesma operação)",
    };
  }

  const matchTop1Tribo = texto.match(/top 1 da tribo.*?(\d+)\s*dias/i);
  if (matchTop1Tribo) {
    const dias = Number(matchTop1Tribo[1]);
    const cumprido = ctx.top1Tribo[dias] ?? false;
    return {
      automatico: true,
      cumprido,
      atual: cumprido ? 1 : 0,
      meta: 1,
      detalhe: cumprido
        ? `Maior crédito pago da Tribo nos últimos ${dias} dias`
        : `Ainda não é o maior crédito pago da Tribo nos últimos ${dias} dias`,
    };
  }

  if (/livro.*apresenta/i.test(texto)) {
    if (ctx.livroApresentado === null) return null; // ainda não escolheu livro — deixa cair no card de Biblioteca
    return {
      automatico: true,
      cumprido: ctx.livroApresentado,
      atual: ctx.livroApresentado ? 1 : 0,
      meta: 1,
      detalhe: ctx.livroApresentado ? "Apresentação pública concluída" : "Livro escolhido, apresentação pendente (ver card Biblioteca)",
    };
  }

  return null;
}

// "Top 1 da Tribo": maior crédito PAGO (weekly_operacoes.status='PAGO', não
// `vendas` — que não distingue pago de só-realizado) dentro da própria Tribo,
// numa janela de dias corridos terminando hoje. Cada operação credita o valor
// cheio tanto pro sdr_profile_id quanto pro closer_profile_id (mesma lógica
// de dupla-contagem intencional de guerra.ts:buscarTopCredito), porque aqui é
// ranking por PESSOA dentro do mesmo grupo, não soma do grupo inteiro.
async function calcularTop1Tribo(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  profileId: string,
  triboId: string | null,
  dias: number
): Promise<boolean> {
  if (!triboId) return false;

  const { data: membros } = await supabase
    .from("profiles")
    .select("id")
    .eq("tribo_id", triboId)
    .in("role", ["sdr", "closer"]);
  const idsTribo = new Set((membros ?? []).map((m: { id: string }) => m.id));
  if (!idsTribo.has(profileId)) return false;

  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  const { data: ops } = await supabase
    .from("weekly_operacoes")
    .select("sdr_profile_id, closer_profile_id, valor")
    .eq("status", "PAGO")
    .gte("data", desde.toISOString().slice(0, 10));

  const totais = new Map<string, number>();
  for (const o of ops ?? []) {
    if (o.sdr_profile_id && idsTribo.has(o.sdr_profile_id)) {
      totais.set(o.sdr_profile_id, (totais.get(o.sdr_profile_id) ?? 0) + Number(o.valor));
    }
    if (o.closer_profile_id && idsTribo.has(o.closer_profile_id)) {
      totais.set(o.closer_profile_id, (totais.get(o.closer_profile_id) ?? 0) + Number(o.valor));
    }
  }
  if (totais.size === 0) return false;

  const meuTotal = totais.get(profileId) ?? 0;
  if (meuTotal <= 0) return false;
  const maior = Math.max(...Array.from(totais.values()));
  return meuTotal >= maior;
}

// Busca tudo que avaliarCriterioAutomatico precisa pra UMA pessoa — usado
// tanto em /carreira quanto no resumo da SidebarRight. `criterios` é a lista
// de promotion_criteria da transição em avaliação — só serve pra descobrir
// quais janelas de "Top 1 da Tribo" (30/60 dias, embutido no texto de cada
// critério) precisam ser calculadas.
export async function buscarContextoAvaliacaoCriterios(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  profileId: string,
  starsTotal: number,
  livroApresentado: boolean | null,
  triboId: string | null,
  criterios: Pick<CriterioPromocao, "texto">[]
): Promise<ContextoAvaliacaoCriterios> {
  const hoje = new Date();
  const trintaDiasAtras = new Date();
  trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
  const inicioJanela = new Date(hoje.getFullYear(), hoje.getMonth() - 4, 1);

  const janelasTop1 = new Set<number>();
  for (const c of criterios) {
    const m = c.texto.match(/top 1 da tribo.*?(\d+)\s*dias/i);
    if (m) janelasTop1.add(Number(m[1]));
  }

  const [{ data: entrevistasRows }, { data: vendasHistorico }, top1Entries] = await Promise.all([
    supabase
      .from("producao_funil")
      .select("realizado")
      .eq("profile_id", profileId)
      .eq("etapa", "entrevistas")
      .gte("data", trintaDiasAtras.toISOString().slice(0, 10)),
    supabase.from("vendas").select("data, valor, papel").eq("profile_id", profileId).gte("data", inicioJanela.toISOString().slice(0, 10)),
    Promise.all(
      Array.from(janelasTop1).map(
        async (dias) => [dias, await calcularTop1Tribo(supabase, profileId, triboId, dias)] as const
      )
    ),
  ]);
  const top1Tribo = Object.fromEntries(top1Entries);

  const totalEntrevistas30d = (entrevistasRows ?? []).reduce((s: number, r: { realizado: number }) => s + r.realizado, 0);
  const entrevistasPorDia = totalEntrevistas30d / 30;

  const producaoPorMes = new Map<string, number>();
  let vendaSozinho = false;
  for (const v of vendasHistorico ?? []) {
    const mes = (v.data as string).slice(0, 7);
    producaoPorMes.set(mes, (producaoPorMes.get(mes) ?? 0) + Number(v.valor));
    if (v.papel === "ambos") vendaSozinho = true;
  }
  const mesAtualStr = hoje.toISOString().slice(0, 7);
  const mesesFechados = Array.from(producaoPorMes.entries())
    .filter(([mes]) => mes !== mesAtualStr)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-3)
    .map(([mes, valor]) => ({ mes, valor }));

  return { starsTotal, entrevistasPorDia, mesesFechados, vendaSozinho, livroApresentado, top1Tribo };
}

// Quantos critérios do próximo rank já batem (auto + evidência aprovada) —
// usado tanto no resumo da SidebarRight quanto no badge de pendência do menu,
// pra nunca dar número diferente entre os dois.
export async function avaliarProntidaoPromocao(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  role: string,
  rank: Rank,
  starsTotal: number,
  triboId: string | null
): Promise<{ proximoRank: Rank; ok: number; total: number } | null> {
  if (role !== "sdr" && role !== "closer") return null;
  const proximoRank = NEXT_RANK[rank];
  const transicao = NEXT_TRANSICAO[rank];
  if (!proximoRank || !transicao) return null;

  const [{ data: criterios }, { count: strikesTotal }, { data: escolhaLivro }] = await Promise.all([
    supabase.from("promotion_criteria").select("id, bloco, texto, tipo, target_value, dias_strikes, ordem").eq("transicao", transicao),
    supabase.from("strikes").select("id", { count: "exact", head: true }).eq("profile_id", userId),
    supabase.from("biblioteca_escolhas").select("apresentado").eq("profile_id", userId).limit(1).maybeSingle(),
  ]);
  if (!criterios || criterios.length === 0) return null;

  const ctx = await buscarContextoAvaliacaoCriterios(
    supabase,
    userId,
    starsTotal,
    escolhaLivro ? !!escolhaLivro.apresentado : null,
    triboId,
    criterios
  );
  const { data: evidenciasAprovadas } = await supabase
    .from("promotion_evidence")
    .select("criterio_id")
    .eq("profile_id", userId)
    .eq("status", "aprovado")
    .in("criterio_id", criterios.map((c) => c.id));
  const aprovadosSet = new Set((evidenciasAprovadas ?? []).map((e) => e.criterio_id));

  let ok = 0;
  for (const c of criterios) {
    if (c.tipo === "strikes") {
      if ((strikesTotal ?? 0) === 0) ok++;
      continue;
    }
    const auto = avaliarCriterioAutomatico(c, ctx);
    if (auto ? auto.cumprido : aprovadosSet.has(c.id)) ok++;
  }
  return { proximoRank, ok, total: criterios.length };
}
