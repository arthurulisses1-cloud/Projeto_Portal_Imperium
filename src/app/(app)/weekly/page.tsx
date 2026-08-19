import { createClient } from "@/lib/supabase/server";
import { RANK_LABELS } from "@/lib/labels";
import WeeklyDashboard from "@/components/weekly/WeeklyDashboard";
import type { WeeklyDataset, WeeklyOp, PersonInfo } from "@/lib/weekly-compute";

export default async function WeeklyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: meProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!meProfile || (meProfile.role !== "lider" && meProfile.role !== "diretor")) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-xl text-gold-bright">Acesso restrito</h1>
        <p className="mt-2 text-sm text-stone-400">
          A Weekly de Receita é uma visão exclusiva dos líderes e da Diretoria.
        </p>
      </main>
    );
  }

  const [{ data: exercitos }, { data: tribos }, { data: pessoas }] = await Promise.all([
    supabase.from("exercitos").select("id, nome, legado_id").order("nome"),
    supabase.from("tribos").select("id, exercito_id"),
    supabase
      .from("profiles")
      .select("id, full_name, role, rank, ativo, stars_total, tribo_id")
      .neq("role", "diretor")
      .order("full_name"),
  ]);

  const nomeExercitoPorId = new Map((exercitos ?? []).map((e) => [e.id, e.nome]));
  const exercitoIdPorTribo = new Map((tribos ?? []).map((t) => [t.id, t.exercito_id]));
  const nomeExercitoPorTriboId = new Map(
    (tribos ?? []).map((t) => [t.id, nomeExercitoPorId.get(t.exercito_id) ?? null])
  );

  const teams = (exercitos ?? []).map((e) => e.nome);
  const liderPorTime: Record<string, string> = {};
  for (const e of exercitos ?? []) {
    const lider = (pessoas ?? []).find((p) => p.id === e.legado_id);
    liderPorTime[e.nome] = lider?.full_name ?? "—";
  }

  // meta individual: meta do mês corrente dividida por Exército -> Tribo -> membros
  const hoje = new Date();
  const { data: metaMesAtual } = await supabase
    .from("metas_mensais")
    .select("meta_credito_total")
    .eq("ano", hoje.getFullYear())
    .eq("mes", hoje.getMonth() + 1)
    .maybeSingle();

  const tribosPorExercito = new Map<string, number>();
  for (const t of tribos ?? []) {
    tribosPorExercito.set(t.exercito_id, (tribosPorExercito.get(t.exercito_id) ?? 0) + 1);
  }
  const membrosPorTribo = new Map<string, number>();
  for (const p of pessoas ?? []) {
    if (!p.tribo_id || (p.role !== "sdr" && p.role !== "closer")) continue;
    membrosPorTribo.set(p.tribo_id, (membrosPorTribo.get(p.tribo_id) ?? 0) + 1);
  }
  function metaIndividual(p: { tribo_id: string | null; role: string }): number {
    if (!p.tribo_id || (p.role !== "sdr" && p.role !== "closer")) return 0;
    const metaTotal = metaMesAtual?.meta_credito_total ?? 0;
    if (!metaTotal) return 0;
    const exercitoId = exercitoIdPorTribo.get(p.tribo_id);
    if (!exercitoId) return 0;
    const numExercitos = (exercitos ?? []).length || 1;
    const numTribos = tribosPorExercito.get(exercitoId) || 1;
    const numMembros = membrosPorTribo.get(p.tribo_id) || 1;
    return metaTotal / numExercitos / numTribos / numMembros;
  }

  // últimas vendas pagas por pessoa ("dias sem pago")
  const idsPessoas = (pessoas ?? []).map((p) => p.id);
  const { data: ultimasVendas } =
    idsPessoas.length > 0
      ? await supabase.from("vendas").select("profile_id, data").in("profile_id", idsPessoas).order("data", { ascending: false })
      : { data: [] };
  const ultimoPagoPorPessoa = new Map<string, string>();
  for (const v of ultimasVendas ?? []) {
    if (!ultimoPagoPorPessoa.has(v.profile_id)) ultimoPagoPorPessoa.set(v.profile_id, v.data);
  }

  // funil do ano corrente, somado entre papéis (visão de atividade, não de comissão)
  const inicioAno = `${hoje.getFullYear()}-01-01`;
  const { data: funilRows } =
    idsPessoas.length > 0
      ? await supabase
          .from("producao_funil")
          .select("profile_id, data, etapa, realizado")
          .in("profile_id", idsPessoas)
          .in("etapa", ["tentativas", "alos", "conexoes", "entrevistas"])
          .gte("data", inicioAno)
      : { data: [] };

  const exercitoNomePorLegadoId = new Map((exercitos ?? []).map((e) => [e.legado_id, e.nome]));

  const people: Record<string, PersonInfo> = {};
  for (const p of pessoas ?? []) {
    const timeViaTribo = p.tribo_id ? nomeExercitoPorTriboId.get(p.tribo_id) ?? null : null;
    people[p.id] = {
      nome: p.full_name,
      time: timeViaTribo ?? exercitoNomePorLegadoId.get(p.id) ?? null,
      rank: RANK_LABELS[p.rank] ?? p.rank,
      role: p.role,
      ativo: p.ativo,
      estrelas: Number(p.stars_total) || 0,
      metaMensal: metaIndividual(p),
      ultimoPago: ultimoPagoPorPessoa.get(p.id) ?? null,
      d: {},
    };
  }
  const ETAPA_IDX: Record<string, 0 | 1 | 2 | 3> = { tentativas: 0, alos: 1, conexoes: 2, entrevistas: 3 };
  for (const row of funilRows ?? []) {
    const pessoa = people[row.profile_id];
    if (!pessoa) continue;
    if (!pessoa.d[row.data]) pessoa.d[row.data] = [0, 0, 0, 0];
    const idx = ETAPA_IDX[row.etapa];
    if (idx !== undefined) pessoa.d[row.data][idx] += row.realizado;
  }

  // operações (aba Assinado, 1:1) do ano corrente
  const { data: opRows } = await supabase
    .from("weekly_operacoes")
    .select("id, data, sdr_profile_id, closer_profile_id, cliente, valor, faturamento, produto, origem, status")
    .gte("data", inicioAno)
    .order("data");

  const nomePorId = new Map((pessoas ?? []).map((p) => [p.id, p.full_name]));
  const ops: WeeklyOp[] = (opRows ?? []).map((o) => {
    const sdrTime = o.sdr_profile_id ? people[o.sdr_profile_id]?.time ?? null : null;
    const closerTime = o.closer_profile_id ? people[o.closer_profile_id]?.time ?? null : null;
    return {
      id: o.id,
      data: o.data,
      sdrId: o.sdr_profile_id,
      sdrNome: o.sdr_profile_id ? nomePorId.get(o.sdr_profile_id) ?? null : null,
      closerId: o.closer_profile_id,
      closerNome: o.closer_profile_id ? nomePorId.get(o.closer_profile_id) ?? null : null,
      time: closerTime ?? sdrTime,
      valor: Number(o.valor),
      faturamento: Number(o.faturamento),
      origem: o.origem,
      produto: o.produto,
      status: o.status,
      cliente: o.cliente,
    };
  });

  const lastData = ops.length > 0 ? ops[ops.length - 1].data : hoje.toISOString().slice(0, 10);

  // metas por mês (Império e por Exército — divisão igual entre exércitos)
  const { data: metasAno } = await supabase
    .from("metas_mensais")
    .select("mes, meta_credito_total")
    .eq("ano", hoje.getFullYear());
  const metaImp: Record<number, number> = {};
  const metaTeam: Record<string, Record<number, number>> = {};
  for (const tm of teams) metaTeam[tm] = {};
  for (const m of metasAno ?? []) {
    metaImp[m.mes] = Number(m.meta_credito_total);
    for (const tm of teams) metaTeam[tm][m.mes] = Number(m.meta_credito_total) / (teams.length || 1);
  }

  const dataset: WeeklyDataset = {
    teams,
    liderPorTime,
    ops,
    people,
    metaTeam,
    metaImp,
    lastData,
    anoReferenciaMeta: hoje.getFullYear(),
    mesReferenciaMeta: hoje.getMonth() + 1,
  };

  return <WeeklyDashboard dataset={dataset} anoAtual={hoje.getFullYear()} />;
}
