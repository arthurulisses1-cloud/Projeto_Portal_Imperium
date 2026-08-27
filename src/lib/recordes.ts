import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTudoPaginado } from "@/lib/supabase/paginate";
import { buscarOperacoesPagasPorGrupoHistorico, agregarPorGrupo, buscarCrestsTribos } from "@/lib/guerra";
import { EXERCITO_CREST } from "@/lib/exercito-crests";
import { logErroSupabase } from "@/lib/log-erro-supabase";

export type RecordeAuto = {
  categoria: "empresa" | "time" | "individual";
  titulo: string;
  nome: string; // pessoa, time ou "—" pra recorde de empresa
  valor: number;
  formato: "moeda" | "num" | "dias";
  data?: string; // quando aconteceu, se souber (YYYY-MM-DD ou YYYY-MM)
  avatarUrls?: (string | null)[]; // foto de quem venceu, se for pessoa(s)
  crestUrl?: string | null; // brasão do Exército/Tribo, se for recorde de time
};

function melhorPorChave<T>(itens: T[], chaveDe: (item: T) => string, valorDe: (item: T) => number): Map<string, number> {
  const totais = new Map<string, number>();
  for (const item of itens) {
    const chave = chaveDe(item);
    totais.set(chave, (totais.get(chave) ?? 0) + valorDe(item));
  }
  return totais;
}

function maiorEntrada(totais: Map<string, number>): { chave: string; valor: number } | null {
  let melhor: { chave: string; valor: number } | null = null;
  for (const [chave, valor] of Array.from(totais.entries())) {
    if (!melhor || valor > melhor.valor) melhor = { chave, valor };
  }
  return melhor;
}

async function recordesEmpresa(supabase: SupabaseClient): Promise<RecordeAuto[]> {
  const ops = await buscarTudoPaginado<{ valor: number; data: string }>((from, to) =>
    supabase.from("weekly_operacoes").select("valor, data").eq("status", "PAGO").range(from, to)
  );
  if (ops.length === 0) return [];

  const porMes = melhorPorChave(ops, (o) => o.data.slice(0, 7), (o) => Number(o.valor));
  const melhorMes = maiorEntrada(porMes);

  const porDia = melhorPorChave(ops, (o) => o.data, (o) => Number(o.valor));
  const melhorDia = maiorEntrada(porDia);

  const recordes: RecordeAuto[] = [];
  if (melhorMes) {
    recordes.push({ categoria: "empresa", titulo: "Melhor mês de faturamento pago", nome: "—", valor: melhorMes.valor, formato: "moeda", data: melhorMes.chave });
  }
  if (melhorDia) {
    recordes.push({ categoria: "empresa", titulo: "Maior faturamento pago num único dia", nome: "—", valor: melhorDia.valor, formato: "moeda", data: melhorDia.chave });
  }
  return recordes;
}

async function recordesTime(supabase: SupabaseClient): Promise<RecordeAuto[]> {
  const recordes: RecordeAuto[] = [];
  const crestsTribos = await buscarCrestsTribos(supabase);

  for (const [agrupar, titulo] of [
    ["exercito", "Melhor mês de um Exército"],
    ["tribo", "Melhor mês de uma Tribo"],
  ] as const) {
    const operacoes = await buscarOperacoesPagasPorGrupoHistorico(supabase, agrupar);
    if (operacoes.length === 0) continue;

    const porMes = new Map<string, typeof operacoes>();
    for (const op of operacoes) {
      const mes = op.data.slice(0, 7);
      if (!porMes.has(mes)) porMes.set(mes, []);
      porMes.get(mes)!.push(op);
    }

    let melhor: { nome: string; valor: number; mes: string } | null = null;
    for (const [mes, opsDoMes] of Array.from(porMes.entries())) {
      const ranking = agregarPorGrupo(opsDoMes);
      // "Fora dos Exércitos"/"Fora das Tribos" é acerto de contas, não um
      // time de verdade — não pode ganhar o recorde de "melhor mês de time"
      // mesmo que seja a única entrada do mês (achado 2026-08-27: em meses
      // sem nenhuma venda "mesma Tribo", a Tribo virava "Fora das Tribos"
      // por ser a única linha do ranking daquele mês).
      const primeiro = ranking.find((r) => !r.nome.startsWith("Fora"));
      if (primeiro && (!melhor || primeiro.valor > melhor.valor)) {
        melhor = { nome: primeiro.nome, valor: primeiro.valor, mes };
      }
    }
    if (melhor) {
      const crestUrl = agrupar === "exercito" ? EXERCITO_CREST[melhor.nome] ?? null : crestsTribos[melhor.nome] ?? null;
      recordes.push({ categoria: "time", titulo, nome: melhor.nome, valor: melhor.valor, formato: "moeda", data: melhor.mes, crestUrl });
    }
  }

  return recordes;
}

// Contagem de quantos meses cada Exército levou o crédito mensal (maior
// faturamento pago) — os dois únicos Exércitos reais do sistema (ver
// memória "Tribos reais"). Meses sem operação resolvível pra nenhum dos
// dois (ex.: só "Fora dos Exércitos") não contam pra ninguém.
export type ContadorGuerraCivil = {
  nomeA: string;
  nomeB: string;
  vitoriasA: number;
  vitoriasB: number;
  creditoA: number;
  creditoB: number;
  crestA: string | null;
  crestB: string | null;
};

export async function buscarContadorGuerraCivil(supabase: SupabaseClient): Promise<ContadorGuerraCivil | null> {
  const operacoes = await buscarOperacoesPagasPorGrupoHistorico(supabase, "exercito");
  if (operacoes.length === 0) return null;

  const porMes = new Map<string, typeof operacoes>();
  for (const op of operacoes) {
    const mes = op.data.slice(0, 7);
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes)!.push(op);
  }

  let vitoriasMaximus = 0;
  let vitoriasTemplarios = 0;
  for (const [, opsDoMes] of Array.from(porMes.entries())) {
    const ranking = agregarPorGrupo(opsDoMes);
    const maximus = ranking.find((r) => r.nome === "Maximus")?.valor ?? 0;
    const templarios = ranking.find((r) => r.nome === "Templários")?.valor ?? 0;
    if (maximus === 0 && templarios === 0) continue;
    if (maximus > templarios) vitoriasMaximus++;
    else if (templarios > maximus) vitoriasTemplarios++;
  }

  // Crédito pago histórico (soma de tudo, sem quebrar por mês) — mesma
  // agregação, só que sobre a lista inteira em vez de bucket por mês.
  const rankingTotal = agregarPorGrupo(operacoes);
  const creditoMaximus = rankingTotal.find((r) => r.nome === "Maximus")?.valor ?? 0;
  const creditoTemplarios = rankingTotal.find((r) => r.nome === "Templários")?.valor ?? 0;

  return {
    nomeA: "Maximus",
    nomeB: "Templários",
    vitoriasA: vitoriasMaximus,
    vitoriasB: vitoriasTemplarios,
    creditoA: creditoMaximus,
    creditoB: creditoTemplarios,
    crestA: EXERCITO_CREST["Maximus"] ?? null,
    crestB: EXERCITO_CREST["Templários"] ?? null,
  };
}

// Guerra de Tribos histórica: diferente da Guerra Civil (só 2 Exércitos),
// tem várias Tribos — não dá pra fazer "A × B", então vira um ranking de
// quantos meses cada Tribo levou a coroa (maior crédito pago "mesma
// Tribo" do mês). "Fora das Tribos" nunca entra (acerto de contas, não
// concorrente — mesma regra do recorde "melhor mês de Tribo").
export type VitoriaTribo = { nome: string; vitorias: number; credito: number; crestUrl: string | null };

export async function buscarGuerraTribosHistorico(supabase: SupabaseClient): Promise<VitoriaTribo[]> {
  const operacoes = await buscarOperacoesPagasPorGrupoHistorico(supabase, "tribo");
  if (operacoes.length === 0) return [];

  const porMes = new Map<string, typeof operacoes>();
  for (const op of operacoes) {
    const mes = op.data.slice(0, 7);
    if (!porMes.has(mes)) porMes.set(mes, []);
    porMes.get(mes)!.push(op);
  }

  const vitoriasPorTribo = new Map<string, number>();
  for (const [, opsDoMes] of Array.from(porMes.entries())) {
    const ranking = agregarPorGrupo(opsDoMes);
    const vencedor = ranking.find((r) => !r.nome.startsWith("Fora"));
    if (vencedor) vitoriasPorTribo.set(vencedor.nome, (vitoriasPorTribo.get(vencedor.nome) ?? 0) + 1);
  }

  const rankingTotal = agregarPorGrupo(operacoes).filter((r) => !r.nome.startsWith("Fora"));
  const crestsTribos = await buscarCrestsTribos(supabase);

  return rankingTotal
    .map((r) => ({
      nome: r.nome,
      vitorias: vitoriasPorTribo.get(r.nome) ?? 0,
      credito: r.valor,
      crestUrl: crestsTribos[r.nome] ?? null,
    }))
    .sort((a, b) => b.vitorias - a.vitorias || b.credito - a.credito);
}

async function recordesIndividuais(supabase: SupabaseClient): Promise<RecordeAuto[]> {
  const recordes: RecordeAuto[] = [];

  // Pessoas com foto — carregado antes pra ficar disponível pra todos os
  // recordes individuais abaixo (maior venda, melhor mês, assinaturas/dia).
  const { data: todasPessoas } = await supabase.from("profiles").select("id, full_name, avatar_url");
  const nomePorProfile = new Map((todasPessoas ?? []).map((p) => [p.id, p.full_name]));
  const avatarPorProfile = new Map((todasPessoas ?? []).map((p) => [p.id, p.avatar_url as string | null]));

  // Maior venda única já fechada.
  const { data: maiorOp, error: maiorOpError } = await supabase
    .from("weekly_operacoes")
    .select("valor, data, sdr_profile_id, closer_profile_id")
    .eq("status", "PAGO")
    .order("valor", { ascending: false })
    .limit(1)
    .maybeSingle();
  logErroSupabase("recordes: maior venda única", maiorOpError);
  if (maiorOp) {
    const ids = [maiorOp.sdr_profile_id, maiorOp.closer_profile_id].filter((x): x is string => !!x);
    const nomes = ids.map((id) => nomePorProfile.get(id)).filter(Boolean);
    recordes.push({
      categoria: "individual",
      titulo: "Maior venda já fechada",
      nome: nomes.length > 0 ? nomes.join(" + ") : "—",
      valor: Number(maiorOp.valor),
      formato: "moeda",
      data: maiorOp.data,
      avatarUrls: ids.map((id) => avatarPorProfile.get(id) ?? null),
    });
  }

  // Melhor mês individual como SDR / como Closer (a partir de `vendas`,
  // mesma fonte e mesma convenção de `papel` que ranking/page.tsx usa —
  // "ambos" conta pros dois lados).
  const vendas = await buscarTudoPaginado<{ profile_id: string; valor: number; data: string; papel: string }>((from, to) =>
    supabase.from("vendas").select("profile_id, valor, data, papel").range(from, to)
  );

  for (const [papel, titulo] of [
    ["sdr", "Melhor mês individual como SDR"],
    ["closer", "Melhor mês individual como Closer"],
  ] as const) {
    const relevantes = vendas.filter((v) => v.papel === papel || v.papel === "ambos");
    const porPessoaMes = melhorPorChave(relevantes, (v) => `${v.profile_id}|${v.data.slice(0, 7)}`, (v) => Number(v.valor));
    const melhor = maiorEntrada(porPessoaMes);
    if (melhor) {
      const [profileId, mes] = melhor.chave.split("|");
      recordes.push({
        categoria: "individual",
        titulo,
        nome: nomePorProfile.get(profileId) ?? "—",
        valor: melhor.valor,
        formato: "moeda",
        data: mes,
        avatarUrls: [avatarPorProfile.get(profileId) ?? null],
      });
    }
  }

  // Assinaturas/Entrevistas de SDR/Closer (producao_funil) — uma leitura só
  // das duas etapas, reaproveitada pros 4 recordes abaixo (dia+mês, SDR e
  // Closer). "ambos" conta pro lado SDR e pro lado Closer, mesma convenção
  // do resto do arquivo/ranking.
  const funilRows = await buscarTudoPaginado<{ profile_id: string; data: string; etapa: string; realizado: number; papel: string }>((from, to) =>
    supabase.from("producao_funil").select("profile_id, data, etapa, realizado, papel").in("etapa", ["assinaturas", "entrevistas"]).range(from, to)
  );

  function melhorFunil(etapa: string, papel: "sdr" | "closer", granularidade: "data" | "mes") {
    const relevantes = funilRows.filter((r) => r.etapa === etapa && (r.papel === papel || r.papel === "ambos"));
    const chaveDe = (r: (typeof funilRows)[number]) => `${r.profile_id}|${granularidade === "mes" ? r.data.slice(0, 7) : r.data}`;
    const porPessoaPeriodo = melhorPorChave(relevantes, chaveDe, (r) => r.realizado);
    return maiorEntrada(porPessoaPeriodo);
  }

  const recordesFunil: { titulo: string; etapa: string; papel: "sdr" | "closer"; granularidade: "data" | "mes" }[] = [
    { titulo: "Maior número de assinaturas de um SDR no dia", etapa: "assinaturas", papel: "sdr", granularidade: "data" },
    { titulo: "SDR com mais assinaturas no mês", etapa: "assinaturas", papel: "sdr", granularidade: "mes" },
    { titulo: "SDR com mais entrevistas no mês", etapa: "entrevistas", papel: "sdr", granularidade: "mes" },
    { titulo: "Closer com mais assinaturas no mês", etapa: "assinaturas", papel: "closer", granularidade: "mes" },
  ];

  for (const { titulo, etapa, papel, granularidade } of recordesFunil) {
    const melhor = melhorFunil(etapa, papel, granularidade);
    if (!melhor) continue;
    const [profileId, data] = melhor.chave.split("|");
    recordes.push({
      categoria: "individual",
      titulo,
      nome: nomePorProfile.get(profileId) ?? "—",
      valor: melhor.valor,
      formato: "num",
      data,
      avatarUrls: [avatarPorProfile.get(profileId) ?? null],
    });
  }

  return recordes;
}

export async function buscarRecordesAuto(supabase: SupabaseClient): Promise<RecordeAuto[]> {
  const [empresa, time, individuais] = await Promise.all([
    recordesEmpresa(supabase),
    recordesTime(supabase),
    recordesIndividuais(supabase),
  ]);
  return [...empresa, ...time, ...individuais];
}

export type RankingHistorico = { posicao: number; nome: string; valor: number; avatarUrl: string | null };

// Total pago (histórico inteiro) por pessoa num papel — "ambos" conta pro
// lado SDR e pro lado Closer, mesma convenção do resto do arquivo/ranking.
// `elegivel` filtra quem pode aparecer no ranking (ex.: só quem ainda é SDR
// hoje, pra "Top 5 SDRs Ativos" não trazer quem já virou Líder/Closer).
async function top5PorPapel(
  supabase: SupabaseClient,
  papel: "sdr" | "closer",
  elegivel?: (p: { role: string; ativo: boolean }) => boolean
): Promise<RankingHistorico[]> {
  const vendas = await buscarTudoPaginado<{ profile_id: string; valor: number; papel: string }>((from, to) =>
    supabase.from("vendas").select("profile_id, valor, papel").range(from, to)
  );
  const relevantes = vendas.filter((v) => v.papel === papel || v.papel === "ambos");
  const totais = new Map<string, number>();
  for (const v of relevantes) totais.set(v.profile_id, (totais.get(v.profile_id) ?? 0) + Number(v.valor));

  const ids = Array.from(totais.keys());
  if (ids.length === 0) return [];
  const { data: pessoas } = await supabase.from("profiles").select("id, full_name, avatar_url, role, ativo").in("id", ids);
  const nomePorId = new Map((pessoas ?? []).map((p) => [p.id, p.full_name]));
  const avatarPorId = new Map((pessoas ?? []).map((p) => [p.id, p.avatar_url as string | null]));
  const elegiveis = elegivel ? new Set((pessoas ?? []).filter(elegivel).map((p) => p.id)) : null;

  return Array.from(totais.entries())
    .filter(([id]) => !elegiveis || elegiveis.has(id))
    .map(([id, valor]) => ({ nome: nomePorId.get(id) ?? "—", valor, avatarUrl: avatarPorId.get(id) ?? null }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5)
    .map((r, i) => ({ posicao: i + 1, ...r }));
}

export function buscarTopClosersHistorico(supabase: SupabaseClient) {
  return top5PorPapel(supabase, "closer");
}
export function buscarTopSdrsHistorico(supabase: SupabaseClient) {
  return top5PorPapel(supabase, "sdr");
}
// Só quem hoje ainda É SDR ativo — exclui quem foi promovido a Líder/Closer
// (mesmo que tenha vendido muito como SDR no passado) e quem saiu da firma.
export function buscarTopSdrsAtivosHistorico(supabase: SupabaseClient) {
  return top5PorPapel(supabase, "sdr", (p) => p.role === "sdr" && p.ativo);
}
// Espelha buscarTopSdrsAtivosHistorico pro lado Closer — só quem hoje
// ainda É Closer ativo (exclui quem virou Líder ou saiu da firma).
export function buscarTopClosersAtivosHistorico(supabase: SupabaseClient) {
  return top5PorPapel(supabase, "closer", (p) => p.role === "closer" && p.ativo);
}

// Top 5 de entrevistas (producao_funil, não vendas) — igual ao Top 5 de
// vendas, mas com contagem em vez de valor pago.
export async function buscarTopSdrsEntrevistasHistorico(supabase: SupabaseClient): Promise<RankingHistorico[]> {
  const rows = await buscarTudoPaginado<{ profile_id: string; realizado: number; papel: string }>((from, to) =>
    supabase.from("producao_funil").select("profile_id, realizado, papel").eq("etapa", "entrevistas").in("papel", ["sdr", "ambos"]).range(from, to)
  );
  const totais = new Map<string, number>();
  for (const r of rows) totais.set(r.profile_id, (totais.get(r.profile_id) ?? 0) + r.realizado);

  const ids = Array.from(totais.keys());
  if (ids.length === 0) return [];
  const { data: pessoas } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", ids);
  const nomePorId = new Map((pessoas ?? []).map((p) => [p.id, p.full_name]));
  const avatarPorId = new Map((pessoas ?? []).map((p) => [p.id, p.avatar_url as string | null]));

  return Array.from(totais.entries())
    .map(([id, valor]) => ({ nome: nomePorId.get(id) ?? "—", valor, avatarUrl: avatarPorId.get(id) ?? null }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5)
    .map((r, i) => ({ posicao: i + 1, ...r }));
}

export type RecordeCurado = {
  id: string;
  titulo: string;
  descricao: string | null;
  valorTexto: string | null;
  dataReferencia: string | null;
  nomePessoa: string | null;
  avatarUrl: string | null;
  imagemUrl: string | null;
  categoria: string | null;
  ordem: number;
};

export async function buscarRecordesCurados(supabase: SupabaseClient): Promise<RecordeCurado[]> {
  const { data, error } = await supabase
    .from("recordes_curados")
    .select(
      "id, titulo, descricao, valor_texto, data_referencia, imagem_url, categoria, ordem, pessoa:profiles!recordes_curados_profile_id_fkey(full_name, avatar_url)"
    )
    .order("ordem", { ascending: true })
    .order("data_referencia", { ascending: false });
  logErroSupabase("recordes: buscarRecordesCurados", error);
  return (data ?? []).map((r) => {
    const pessoa = r.pessoa as unknown as { full_name: string; avatar_url: string | null } | null;
    return {
      id: r.id,
      titulo: r.titulo,
      descricao: r.descricao,
      valorTexto: r.valor_texto,
      dataReferencia: r.data_referencia,
      imagemUrl: r.imagem_url,
      categoria: r.categoria,
      nomePessoa: pessoa?.full_name ?? null,
      avatarUrl: pessoa?.avatar_url ?? null,
      ordem: r.ordem,
    };
  });
}
