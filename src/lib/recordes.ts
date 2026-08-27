import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTudoPaginado } from "@/lib/supabase/paginate";
import { buscarOperacoesPagasPorGrupoHistorico, agregarPorGrupo } from "@/lib/guerra";
import { logErroSupabase } from "@/lib/log-erro-supabase";

export type RecordeAuto = {
  categoria: "empresa" | "time" | "individual";
  titulo: string;
  nome: string; // pessoa, time ou "—" pra recorde de empresa
  valor: number;
  formato: "moeda" | "num" | "dias";
  data?: string; // quando aconteceu, se souber (YYYY-MM-DD ou YYYY-MM)
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

// Maior sequência de dias corridos (calendário) dentro de uma lista de datas
// distintas "YYYY-MM-DD" — usado pro recorde de streak de vendas.
function maiorSequenciaDeDias(datas: string[]): number {
  const unicas = Array.from(new Set(datas)).sort();
  if (unicas.length === 0) return 0;
  let maior = 1;
  let atual = 1;
  for (let i = 1; i < unicas.length; i++) {
    const anterior = new Date(unicas[i - 1] + "T00:00:00Z");
    const hoje = new Date(unicas[i] + "T00:00:00Z");
    const diffDias = Math.round((hoje.getTime() - anterior.getTime()) / 86400000);
    atual = diffDias === 1 ? atual + 1 : 1;
    if (atual > maior) maior = atual;
  }
  return maior;
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
      const primeiro = ranking[0];
      if (primeiro && (!melhor || primeiro.valor > melhor.valor)) {
        melhor = { nome: primeiro.nome, valor: primeiro.valor, mes };
      }
    }
    if (melhor) {
      recordes.push({ categoria: "time", titulo, nome: melhor.nome, valor: melhor.valor, formato: "moeda", data: melhor.mes });
    }
  }

  return recordes;
}

async function recordesIndividuais(supabase: SupabaseClient): Promise<RecordeAuto[]> {
  const recordes: RecordeAuto[] = [];

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
    const { data: pessoas } = ids.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
    const nomePorId = new Map((pessoas ?? []).map((p) => [p.id, p.full_name]));
    const nomes = ids.map((id) => nomePorId.get(id)).filter(Boolean);
    recordes.push({
      categoria: "individual",
      titulo: "Maior venda já fechada",
      nome: nomes.length > 0 ? nomes.join(" + ") : "—",
      valor: Number(maiorOp.valor),
      formato: "moeda",
      data: maiorOp.data,
    });
  }

  // Melhor mês individual como SDR / como Closer (a partir de `vendas`,
  // mesma fonte e mesma convenção de `papel` que ranking/page.tsx usa —
  // "ambos" conta pros dois lados).
  const vendas = await buscarTudoPaginado<{ profile_id: string; valor: number; data: string; papel: string }>((from, to) =>
    supabase.from("vendas").select("profile_id, valor, data, papel").range(from, to)
  );
  const { data: pessoasVenda } = await supabase.from("profiles").select("id, full_name").in("role", ["sdr", "closer", "lider"]);
  const nomePorProfile = new Map((pessoasVenda ?? []).map((p) => [p.id, p.full_name]));

  for (const [papel, titulo] of [
    ["sdr", "Melhor mês individual como SDR"],
    ["closer", "Melhor mês individual como Closer"],
  ] as const) {
    const relevantes = vendas.filter((v) => v.papel === papel || v.papel === "ambos");
    const porPessoaMes = melhorPorChave(relevantes, (v) => `${v.profile_id}|${v.data.slice(0, 7)}`, (v) => Number(v.valor));
    const melhor = maiorEntrada(porPessoaMes);
    if (melhor) {
      const [profileId, mes] = melhor.chave.split("|");
      recordes.push({ categoria: "individual", titulo, nome: nomePorProfile.get(profileId) ?? "—", valor: melhor.valor, formato: "moeda", data: mes });
    }
  }

  // Maior sequência de dias corridos vendendo (SDR ou Closer, operação paga).
  const opsHistorico = await buscarTudoPaginado<{ data: string; sdr_profile_id: string | null; closer_profile_id: string | null }>((from, to) =>
    supabase.from("weekly_operacoes").select("data, sdr_profile_id, closer_profile_id").eq("status", "PAGO").range(from, to)
  );
  const datasPorPessoa = new Map<string, string[]>();
  for (const op of opsHistorico) {
    for (const id of [op.sdr_profile_id, op.closer_profile_id]) {
      if (!id) continue;
      if (!datasPorPessoa.has(id)) datasPorPessoa.set(id, []);
      datasPorPessoa.get(id)!.push(op.data);
    }
  }
  let melhorStreak: { profileId: string; dias: number } | null = null;
  for (const [profileId, datas] of Array.from(datasPorPessoa.entries())) {
    const dias = maiorSequenciaDeDias(datas);
    if (!melhorStreak || dias > melhorStreak.dias) melhorStreak = { profileId, dias };
  }
  if (melhorStreak && melhorStreak.dias > 1) {
    recordes.push({
      categoria: "individual",
      titulo: "Maior sequência de dias seguidos vendendo",
      nome: nomePorProfile.get(melhorStreak.profileId) ?? "—",
      valor: melhorStreak.dias,
      formato: "dias",
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

export type RecordeCurado = {
  id: string;
  titulo: string;
  descricao: string | null;
  valorTexto: string | null;
  dataReferencia: string | null;
  nomePessoa: string | null;
  ordem: number;
};

export async function buscarRecordesCurados(supabase: SupabaseClient): Promise<RecordeCurado[]> {
  const { data, error } = await supabase
    .from("recordes_curados")
    .select("id, titulo, descricao, valor_texto, data_referencia, ordem, pessoa:profiles(full_name)")
    .order("ordem", { ascending: true })
    .order("data_referencia", { ascending: false });
  logErroSupabase("recordes: buscarRecordesCurados", error);
  return (data ?? []).map((r) => ({
    id: r.id,
    titulo: r.titulo,
    descricao: r.descricao,
    valorTexto: r.valor_texto,
    dataReferencia: r.data_referencia,
    nomePessoa: (r.pessoa as unknown as { full_name: string } | null)?.full_name ?? null,
    ordem: r.ordem,
  }));
}
