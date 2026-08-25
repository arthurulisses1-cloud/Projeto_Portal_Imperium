import { createClient } from "@/lib/supabase/server";
import { RANK_LABELS } from "@/lib/labels";
import WeeklyDashboard from "@/components/weekly/WeeklyDashboard";
import { getViewerContext } from "@/lib/preview";
import { FORA_DA_TRIBO, type WeeklyDataset, type WeeklyOp, type PersonInfo, type EntrevistaEvento } from "@/lib/weekly-compute";
import { buscarTudoPaginado } from "@/lib/supabase/paginate";
import { mapaMetaCreditoPorTribo } from "@/lib/metas";

export default async function MinhaProducaoLiderPage() {
  const supabase = await createClient();
  const viewer = await getViewerContext(supabase);
  if (!viewer) return null;
  const meId = viewer.effectiveId;

  if (viewer.effectiveRole !== "lider") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-xl text-gold-bright">Acesso restrito</h1>
        <p className="mt-2 text-sm text-stone-400">Esta é a visão de produção dos líderes de Exército.</p>
      </main>
    );
  }

  const { data: meuExercito } = await supabase
    .from("exercitos")
    .select("id, nome")
    .eq("legado_id", meId)
    .maybeSingle();

  if (!meuExercito) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-xl text-gold-bright">Sem Exército vinculado</h1>
        <p className="mt-2 text-sm text-stone-400">
          Peça ao Diretor pra te vincular como Legado de um Exército em Gestão de Pessoas.
        </p>
      </main>
    );
  }

  const { data: tribos } = await supabase
    .from("tribos")
    .select("id, nome, closer_id")
    .eq("exercito_id", meuExercito.id)
    .order("nome");
  const triboIds = (tribos ?? []).map((t) => t.id);

  const { data: pessoas } =
    triboIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name, role, rank, ativo, stars_total, tribo_id")
          .neq("role", "diretor")
          .in("tribo_id", triboIds)
      : { data: [] };

  const nomeTriboPorId = new Map((tribos ?? []).map((t) => [t.id, t.nome]));
  const nomePorProfileId = new Map((pessoas ?? []).map((p) => [p.id, p.full_name]));

  const liderPorTime: Record<string, string> = { [FORA_DA_TRIBO]: "—" };
  for (const t of tribos ?? []) {
    liderPorTime[t.nome] = t.closer_id ? nomePorProfileId.get(t.closer_id) ?? "—" : "—";
  }

  // tribo_id de QUALQUER pessoa da firma (não só desse Exército) — precisa
  // pra saber se o outro lado de uma operação/entrevista é de uma Tribo
  // diferente, mesmo fora daqui.
  const { data: todosPerfis } = await supabase.from("profiles").select("id, tribo_id");
  const triboIdPorProfileId = new Map((todosPerfis ?? []).map((p) => [p.id, p.tribo_id]));
  const meusTriboIds = new Set(triboIds);

  // Regra do Diretor (2026-08-25): entrevista/assinatura/pago só conta pra
  // uma Tribo quando SDR e Closer são da MESMA Tribo (inclusive quando é a
  // mesma pessoa nos dois papéis — mesma Tribo trivialmente). Caso
  // contrário — inclusive quando o Closer da Tribo agiu como SDR de uma
  // operação fechada pelo Líder — vai pro balde "Fora da Tribo", desde que
  // pelo menos um dos dois lados seja alguém desse Exército (senão a
  // operação nem aparece aqui, é assunto de outro Exército).
  function resolverTimeTribo(sdrProfileId: string | null, closerProfileId: string | null): string | null {
    const sdrTriboId = sdrProfileId ? triboIdPorProfileId.get(sdrProfileId) ?? null : null;
    const closerTriboId = closerProfileId ? triboIdPorProfileId.get(closerProfileId) ?? null : null;
    if (sdrTriboId && closerTriboId && sdrTriboId === closerTriboId) {
      return meusTriboIds.has(sdrTriboId) ? nomeTriboPorId.get(sdrTriboId) ?? null : null;
    }
    const envolveMeuExercito =
      (!!sdrTriboId && meusTriboIds.has(sdrTriboId)) || (!!closerTriboId && meusTriboIds.has(closerTriboId));
    return envolveMeuExercito ? FORA_DA_TRIBO : null;
  }

  const hoje = new Date();
  const { data: metaMesAtual } = await supabase
    .from("metas_mensais")
    .select("id, meta_credito_total")
    .eq("ano", hoje.getFullYear())
    .eq("mes", hoje.getMonth() + 1)
    .maybeSingle();
  const { count: numExercitos } = await supabase.from("exercitos").select("id", { count: "exact", head: true });

  const { data: conversoesMes } = metaMesAtual
    ? await supabase.from("metas_conversao").select("etapa_de, etapa_para, taxa_esperada").eq("meta_mensal_id", metaMesAtual.id)
    : { data: [] };
  const metaConversao: Record<string, number> = {};
  for (const c of conversoesMes ?? []) metaConversao[`${c.etapa_de}_${c.etapa_para}`] = Number(c.taxa_esperada);

  const membrosPorTribo = new Map<string, number>();
  for (const p of pessoas ?? []) {
    if (!p.tribo_id || (p.role !== "sdr" && p.role !== "closer")) continue;
    membrosPorTribo.set(p.tribo_id, (membrosPorTribo.get(p.tribo_id) ?? 0) + 1);
  }
  // Mesma fonte usada em Mural/Tribo/Exército e no card por Tribo desta
  // página (mapaMetaCreditoPorTribo) — achado numa auditoria 2026-08-25:
  // essa função tinha sua PRÓPRIA divisão (metaTotal/exércitos/tribos/
  // membros) que nunca tratava Inbound como meia fatia, reproduzindo o bug
  // antigo da Cristina na aba Individual desta página.
  const metaPorTriboIdMesAtual = await mapaMetaCreditoPorTribo(supabase, metaMesAtual?.meta_credito_total ?? 0);
  function metaIndividual(p: { tribo_id: string | null; role: string }): number {
    if (!p.tribo_id || (p.role !== "sdr" && p.role !== "closer")) return 0;
    const metaTribo = metaPorTriboIdMesAtual.get(p.tribo_id) ?? 0;
    if (!metaTribo) return 0;
    const numMembros = membrosPorTribo.get(p.tribo_id) || 1;
    return metaTribo / numMembros;
  }

  const idsPessoas = (pessoas ?? []).map((p) => p.id);
  const { data: ultimasVendas } =
    idsPessoas.length > 0
      ? await supabase.from("vendas").select("profile_id, data").in("profile_id", idsPessoas).order("data", { ascending: false })
      : { data: [] };
  const ultimoPagoPorPessoa = new Map<string, string>();
  for (const v of ultimasVendas ?? []) {
    if (!ultimoPagoPorPessoa.has(v.profile_id)) ultimoPagoPorPessoa.set(v.profile_id, v.data);
  }

  // Paginado — mesmo bug do Weekly de Receita: sem isso o Supabase corta em
  // 1000 linhas por padrão e some gente aparece com funil zerado.
  const inicioAno = `${hoje.getFullYear()}-01-01`;
  const funilRows =
    idsPessoas.length > 0
      ? await buscarTudoPaginado<{ profile_id: string; data: string; etapa: string; realizado: number }>(
          (from, to) =>
            supabase
              .from("producao_funil")
              .select("profile_id, data, etapa, realizado")
              .in("profile_id", idsPessoas)
              .in("etapa", ["tentativas", "alos", "conexoes", "entrevistas"])
              .gte("data", inicioAno)
              .order("data")
              .range(from, to)
        )
      : [];

  const people: Record<string, PersonInfo> = {};
  for (const p of pessoas ?? []) {
    people[p.id] = {
      nome: p.full_name,
      time: p.tribo_id ? nomeTriboPorId.get(p.tribo_id) ?? null : null,
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
  for (const row of funilRows) {
    const pessoa = people[row.profile_id];
    if (!pessoa) continue;
    if (!pessoa.d[row.data]) pessoa.d[row.data] = [0, 0, 0, 0];
    const idx = ETAPA_IDX[row.etapa];
    if (idx !== undefined) pessoa.d[row.data][idx] += row.realizado;
  }

  // Operações do Exército inteiro (empresa toda, na verdade — resolverTimeTribo
  // descarta quem não toca esse Exército de jeito nenhum).
  const opRows = await buscarTudoPaginado<{
    id: string;
    data: string;
    sdr_profile_id: string | null;
    closer_profile_id: string | null;
    cliente: string | null;
    valor: number;
    faturamento: number;
    produto: string | null;
    origem: string | null;
    status: string;
    status_manual: "resolvendo_pendencia" | "aguardando_pagamento" | null;
  }>((from, to) =>
    supabase
      .from("weekly_operacoes")
      .select(
        "id, data, sdr_profile_id, closer_profile_id, cliente, valor, faturamento, produto, origem, status, status_manual"
      )
      .gte("data", inicioAno)
      .order("data")
      .range(from, to)
  );

  const ops: WeeklyOp[] = opRows.flatMap((o): WeeklyOp[] => {
    const time = resolverTimeTribo(o.sdr_profile_id, o.closer_profile_id);
    if (!time) return [];
    return [
      {
        id: o.id,
        data: o.data,
        sdrId: o.sdr_profile_id,
        sdrNome: o.sdr_profile_id ? nomePorProfileId.get(o.sdr_profile_id) ?? null : null,
        closerId: o.closer_profile_id,
        closerNome: o.closer_profile_id ? nomePorProfileId.get(o.closer_profile_id) ?? null : null,
        time,
        valor: Number(o.valor),
        faturamento: Number(o.faturamento),
        origem: o.origem,
        produto: o.produto,
        status: o.status,
        statusManual: o.status_manual,
        cliente: o.cliente,
      },
    ];
  });

  // Entrevistas: mesma regra "mesma Tribo" (ver resolverTimeTribo) em vez de
  // aproximar pelo papel de quem conduz — entrevistas_eventos guarda o par
  // SDR+Closer de cada entrevista (migration 0048), diferente de
  // producao_funil que só guarda crédito solto por pessoa.
  const eventosRows = await buscarTudoPaginado<{
    data: string;
    sdr_profile_id: string | null;
    closer_profile_id: string | null;
    quantidade: number;
  }>((from, to) =>
    supabase
      .from("entrevistas_eventos")
      .select("data, sdr_profile_id, closer_profile_id, quantidade")
      .gte("data", inicioAno)
      .order("data")
      .range(from, to)
  );
  const entrevistaEventos: EntrevistaEvento[] = eventosRows.flatMap((ev): EntrevistaEvento[] => {
    const time = resolverTimeTribo(ev.sdr_profile_id, ev.closer_profile_id);
    if (!time) return [];
    return [{ data: ev.data, time, sdrId: ev.sdr_profile_id, closerId: ev.closer_profile_id, quantidade: ev.quantidade }];
  });

  const lastData = ops.length > 0 ? ops[ops.length - 1].data : hoje.toISOString().slice(0, 10);

  const { data: metasAno } = await supabase
    .from("metas_mensais")
    .select("mes, meta_credito_total")
    .eq("ano", hoje.getFullYear());
  const metaImp: Record<number, number> = {};
  const metaTeam: Record<string, Record<number, number>> = {};
  const nomesTribos = [...(tribos ?? []).map((t) => t.nome), FORA_DA_TRIBO];
  for (const tm of nomesTribos) metaTeam[tm] = {};
  for (const m of metasAno ?? []) {
    const metaExercito = Number(m.meta_credito_total) / (numExercitos || 1);
    metaImp[m.mes] = metaExercito;
    // Divide pela mesma regra da firma inteira (Tribo normal = 1 fatia,
    // Inbound = meia fatia) em vez de repartir igualmente as tribos deste
    // Exército — senão a Tribo Inbound aparecia com o dobro da meta certa.
    const metaPorTriboId = await mapaMetaCreditoPorTribo(supabase, Number(m.meta_credito_total));
    for (const t of tribos ?? []) {
      metaTeam[t.nome][m.mes] = metaPorTriboId.get(t.id) ?? 0;
    }
  }

  const dataset: WeeklyDataset = {
    teams: nomesTribos,
    liderPorTime,
    ops,
    people,
    metaTeam,
    metaImp,
    lastData,
    anoReferenciaMeta: hoje.getFullYear(),
    mesReferenciaMeta: hoje.getMonth() + 1,
    entrevistaEventos,
    metaConversao,
  };

  return (
    <WeeklyDashboard
      dataset={dataset}
      anoAtual={hoje.getFullYear()}
      eyebrow={`Minha Produção · ${meuExercito.nome}${viewer.isPreview ? ` · pré-visualizando como ${viewer.effectiveNome}` : ""}`}
      titulo="Painel do Exército"
      rotuloEquipe="Tribo"
    />
  );
}
