import type { SupabaseClient } from "@supabase/supabase-js";
import { FUNNEL_LABELS, FUNNEL_STAGES, type FunilEtapa } from "@/lib/funil";
import { calcularFunilMeta, dividirMetaTriboComOverrides, buscarOverridesIndividuais, mapaMetaCreditoPorTribo, TRANSICOES } from "@/lib/metas";
import { buscarTudoPaginado } from "@/lib/supabase/paginate";
import { paraDataUTC } from "@/lib/data-br";

// Feedback do mês na Central de Notificações (pedido do Diretor, 2026-10-13):
// "como estou no mês" juntando meta, volume, funil e conversões. SDR vê o
// próprio, Closer vê cada membro da Tribo, Líder vê um por Tribo.
//
// Mesma régua do Pace consolidado: só dias já fechados (até ontem) contra o
// esperado pró-rata em dias úteis (seg-sex) — dia em andamento não conta.

export type Papel = "sdr" | "closer";
export type Nivel = "ritmo" | "atencao" | "abaixo" | "inicio" | "sem_base";

export type EntradaFeedback = {
  papel: Papel;
  realizado: Record<FunilEtapa, number>;
  creditoPago: number;
  metaCredito: number | null;
  metaTicketMedio: number;
  taxas: Map<string, number>;
  // dias úteis fechados ÷ dias úteis do mês (0..1)
  fracaoMes: number;
};

export type LinhaVolume = { etapa: FunilEtapa; label: string; real: number; esperado: number; pct: number };
export type LinhaConversao = { label: string; real: number; meta: number; pct: number };

export type Feedback = {
  nivel: Nivel;
  titulo: string;
  meta: { pago: number; esperado: number; total: number; pct: number } | null;
  volume: LinhaVolume[];
  conversoes: LinhaConversao[];
  gargalo: string | null;
};

const ETAPAS_DO_PAPEL: Record<Papel, FunilEtapa[]> = {
  sdr: ["tentativas", "conexoes", "entrevistas", "assinaturas", "pagos"],
  closer: ["entrevistas", "assinaturas", "pagos"],
};

// Transições de funil que cada papel acompanha (pela etapa de origem).
const DE_DO_PAPEL: Record<Papel, FunilEtapa[]> = {
  sdr: ["tentativas", "alos", "conexoes", "entrevistas", "assinaturas"],
  closer: ["entrevistas", "assinaturas"],
};

const TITULOS: Record<Nivel, string> = {
  ritmo: "No ritmo",
  atencao: "Atenção",
  abaixo: "Abaixo do ritmo",
  inicio: "Mês começando",
  sem_base: "Sem meta para comparar",
};

const media = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const pctInt = (v: number) => Math.round(v * 100);

export function diasUteisNoIntervalo(inicio: string, fimExclusivo: string): number {
  let n = 0;
  const d = paraDataUTC(inicio);
  const fim = paraDataUTC(fimExclusivo);
  while (d < fim) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

export function avaliarFeedback(e: EntradaFeedback): Feedback {
  const vazio = (nivel: Nivel): Feedback => ({ nivel, titulo: TITULOS[nivel], meta: null, volume: [], conversoes: [], gargalo: null });
  if (e.fracaoMes <= 0) return vazio("inicio");

  const metaPorEtapa =
    e.metaCredito && e.metaCredito > 0 ? calcularFunilMeta(e.metaCredito, e.metaTicketMedio, e.taxas) : null;
  const etapas = ETAPAS_DO_PAPEL[e.papel];

  const volume: LinhaVolume[] = [];
  for (const etapa of etapas) {
    const total = metaPorEtapa?.[etapa];
    if (total === null || total === undefined || total <= 0) continue;
    const esperado = total * e.fracaoMes;
    volume.push({ etapa, label: FUNNEL_LABELS[etapa], real: e.realizado[etapa], esperado, pct: e.realizado[etapa] / esperado });
  }

  const conversoes: LinhaConversao[] = [];
  for (const t of TRANSICOES) {
    if (!DE_DO_PAPEL[e.papel].includes(t.de)) continue;
    const taxa = e.taxas.get(`${t.de}_${t.para}`);
    const base = e.realizado[t.de];
    // Base muito pequena não diz nada sobre conversão (1 de 2 = 50% é ruído).
    if (!taxa || base < 5) continue;
    const real = e.realizado[t.para] / base;
    conversoes.push({ label: t.label, real, meta: taxa, pct: real / taxa });
  }

  const meta =
    e.metaCredito && e.metaCredito > 0
      ? (() => {
          const esperado = e.metaCredito * e.fracaoMes;
          return { pago: e.creditoPago, esperado, total: e.metaCredito, pct: e.creditoPago / esperado };
        })()
      : null;

  // Nota geral: crédito pago (40%), volume (30%) e conversões (30%) — o que
  // existir, com os pesos renormalizados. Cada parte é limitada a 120% pra um
  // excesso de volume não esconder uma conversão ruim.
  const partes: { peso: number; valor: number }[] = [];
  if (meta) partes.push({ peso: 0.4, valor: Math.min(meta.pct, 1.2) });
  if (volume.length) partes.push({ peso: 0.3, valor: media(volume.map((v) => Math.min(v.pct, 1.2))) });
  if (conversoes.length) partes.push({ peso: 0.3, valor: media(conversoes.map((c) => Math.min(c.pct, 1.2))) });
  if (partes.length === 0) return vazio("sem_base");

  const pesoTotal = partes.reduce((s, p) => s + p.peso, 0);
  const nota = partes.reduce((s, p) => s + p.peso * p.valor, 0) / pesoTotal;
  const nivel: Nivel = nota >= 0.95 ? "ritmo" : nota >= 0.7 ? "atencao" : "abaixo";

  // Gargalo: o pior ponto entre volume e conversões (se algo está abaixo do esperado).
  // Conversões vêm antes: num empate, a conversão é a causa e o volume da
  // etapa seguinte é só o efeito.
  const candidatos = [
    ...conversoes.map((c) => ({ pct: c.pct, texto: `Conversão ${c.label}: ${pctInt(c.real)}% (esperado ${pctInt(c.meta)}%)` })),
    ...volume.map((v) => ({ pct: v.pct, texto: `${v.label}: ${Math.round(v.real)} de ${Math.round(v.esperado)} esperadas até agora (${pctInt(v.pct)}%)` })),
  ].sort((a, b) => a.pct - b.pct);
  const gargalo = candidatos.length > 0 && candidatos[0].pct < 0.95 ? candidatos[0].texto : null;

  return { nivel, titulo: TITULOS[nivel], meta, volume, conversoes, gargalo };
}

export type AlvoFeedback = {
  chave: string;
  // "pessoa" = produção da própria pessoa; "time" = soma da Tribo (sem contar
  // duas vezes a entrevista que o Closer também lança)
  tipo: "pessoa" | "time";
  profileIds: string[];
  papel: Papel;
  triboId: string | null;
  // Exército inteiro: a meta é a soma da meta das Tribos dele
  triboIds?: string[];
};

const ETAPAS_FUNIL = ["tentativas", "alos", "conexoes", "entrevistas"] as const;

const zerado = () => Object.fromEntries(FUNNEL_STAGES.map((e) => [e, 0])) as Record<FunilEtapa, number>;

export async function buscarFeedbacksMes(
  supabase: SupabaseClient,
  hoje: string,
  alvos: AlvoFeedback[]
): Promise<Map<string, Feedback>> {
  const resultado = new Map<string, Feedback>();
  if (alvos.length === 0) return resultado;

  const [ano, mes] = hoje.split("-").map(Number);
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const proximoMes = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
  const totalUteis = diasUteisNoIntervalo(inicioMes, proximoMes);
  const fracaoMes = totalUteis > 0 ? diasUteisNoIntervalo(inicioMes, hoje) / totalUteis : 0;

  const ids = Array.from(new Set(alvos.flatMap((a) => a.profileIds)));
  if (ids.length === 0) return resultado;

  const [{ data: metaMes }, funil, { data: opsAssinadas }, { data: opsPagas }] = await Promise.all([
    supabase.from("metas_mensais").select("id, meta_credito_total, meta_ticket_medio").eq("ano", ano).eq("mes", mes).maybeSingle(),
    buscarTudoPaginado<{ profile_id: string; etapa: string; papel: string; realizado: number }>((from, to) =>
      supabase
        .from("producao_funil")
        .select("profile_id, etapa, papel, realizado")
        .in("profile_id", ids)
        .in("etapa", [...ETAPAS_FUNIL])
        .gte("data", inicioMes)
        .lt("data", hoje)
        .order("data")
        .range(from, to)
    ),
    supabase
      .from("weekly_operacoes")
      .select("valor, sdr_profile_id, closer_profile_id")
      .gte("data", inicioMes)
      .lt("data", hoje)
      .or(`sdr_profile_id.in.(${ids.join(",")}),closer_profile_id.in.(${ids.join(",")})`),
    supabase
      .from("weekly_operacoes")
      .select("valor, sdr_profile_id, closer_profile_id")
      .eq("status", "PAGO")
      .gte("pago_em", inicioMes)
      .lt("pago_em", hoje)
      .or(`sdr_profile_id.in.(${ids.join(",")}),closer_profile_id.in.(${ids.join(",")})`),
  ]);

  const { data: conversoes } = metaMes
    ? await supabase.from("metas_conversao").select("etapa_de, etapa_para, taxa_esperada").eq("meta_mensal_id", metaMes.id)
    : { data: [] };
  const taxas = new Map<string, number>((conversoes ?? []).map((c) => [`${c.etapa_de}_${c.etapa_para}`, Number(c.taxa_esperada)]));
  const metaTicketMedio = Number(metaMes?.meta_ticket_medio ?? 0);

  // Meta de crédito: da Tribo (mapaMetaCreditoPorTribo) ou a fatia da pessoa
  // (Tribo ÷ membros, respeitando overrides) — mesma conta de buscarMetaIndividual,
  // só que em lote.
  const mapaTribo = await mapaMetaCreditoPorTribo(supabase, Number(metaMes?.meta_credito_total ?? 0));
  const triboIds = Array.from(new Set(alvos.map((a) => a.triboId).filter((x): x is string => !!x)));
  const { data: membros } = triboIds.length
    ? await supabase.from("profiles").select("id, tribo_id").in("tribo_id", triboIds).in("role", ["sdr", "closer"])
    : { data: [] };
  const membrosPorTribo = new Map<string, string[]>();
  for (const m of membros ?? []) {
    const arr = membrosPorTribo.get(m.tribo_id) ?? [];
    arr.push(m.id);
    membrosPorTribo.set(m.tribo_id, arr);
  }
  const overrides = await buscarOverridesIndividuais(supabase, ano, mes, (membros ?? []).map((m) => m.id));
  const fatiaPorPessoa = new Map<string, number>();
  for (const [triboId, idsMembros] of Array.from(membrosPorTribo)) {
    const divisao = dividirMetaTriboComOverrides(mapaTribo.get(triboId) ?? 0, idsMembros, overrides);
    for (const [id, v] of Array.from(divisao)) fatiaPorPessoa.set(id, v);
  }

  for (const a of alvos) {
    const conjunto = new Set(a.profileIds);
    const realizado = zerado();
    for (const r of funil) {
      if (!conjunto.has(r.profile_id)) continue;
      if (a.tipo === "time" && r.papel === "closer") continue;
      realizado[r.etapa as FunilEtapa] += r.realizado;
    }
    const doAlvo = (o: { sdr_profile_id: string | null; closer_profile_id: string | null }) =>
      (!!o.sdr_profile_id && conjunto.has(o.sdr_profile_id)) || (!!o.closer_profile_id && conjunto.has(o.closer_profile_id));
    const assinadas = (opsAssinadas ?? []).filter(doAlvo);
    const pagas = (opsPagas ?? []).filter(doAlvo);
    realizado.assinaturas = assinadas.length;
    realizado.pagos = pagas.length;
    const creditoPago = pagas.reduce((s, o) => s + Number(o.valor), 0);

    const metaCredito =
      a.tipo === "time"
        ? a.triboIds
          ? a.triboIds.reduce((s, id) => s + (mapaTribo.get(id) ?? 0), 0)
          : a.triboId
          ? mapaTribo.get(a.triboId) ?? null
          : null
        : fatiaPorPessoa.get(a.profileIds[0]) ?? null;

    resultado.set(a.chave, avaliarFeedback({ papel: a.papel, realizado, creditoPago, metaCredito, metaTicketMedio, taxas, fracaoMes }));
  }
  return resultado;
}
