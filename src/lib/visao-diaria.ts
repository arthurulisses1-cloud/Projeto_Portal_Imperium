import type { SupabaseClient } from "@supabase/supabase-js";
import { FUNNEL_STAGES, type FunilEtapa } from "@/lib/funil";
import { buscarTudoPaginado } from "@/lib/supabase/paginate";

export type FunilContagem = Record<FunilEtapa, number>;

export function funilVazio(): FunilContagem {
  return Object.fromEntries(FUNNEL_STAGES.map((e) => [e, 0])) as FunilContagem;
}

export type PessoaVisao = { id: string; nome: string; funil: FunilContagem };
export type TriboVisao = { id: string; nome: string; funil: FunilContagem; pessoas: PessoaVisao[] };
export type ExercitoVisao = { id: string; nome: string; funil: FunilContagem; tribos: TriboVisao[] };
export type VisaoGeralData = { funil: FunilContagem; exercitos: ExercitoVisao[] };

// Agrega o funil (tentativas..pagos) num período [inicio, fimExclusivo) em 3
// níveis: pessoa (seu próprio funil, papel-inclusivo), Tribo/Exército/Firma
// (1 crédito por operação/entrevista, dono = Closer com fallback SDR — mesma
// regra que buscarProducaoPagaTribo/Exercito e buscarRealizadoDia já usam em
// outras telas, ver src/lib/metas.ts, pra nunca contar a mesma coisa 2x
// quando SDR e Closer são do mesmo time).
//
// Tentativas/Alôs/Conexões não têm esse risco (só o SDR loga, ninguém mais
// credita a mesma linha) — soma direto, sem dedupe.
export async function buscarVisaoDiaria(
  supabase: SupabaseClient,
  inicio: string,
  fimExclusivo: string
): Promise<VisaoGeralData> {
  const [{ data: pessoasRaw }, { data: exercitosRaw }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, role, tribo:tribos!profiles_tribo_id_fkey(id, nome, exercito_id, exercito:exercitos(id, nome))"
      )
      .in("role", ["sdr", "closer", "lider"])
      .eq("ativo", true),
    supabase.from("exercitos").select("id, nome, legado_id"),
  ]);

  const exercitoIdPorLegadoId = new Map((exercitosRaw ?? []).map((e) => [e.legado_id, e.id]));

  type PessoaInfo = { id: string; nome: string; triboId: string | null; triboNome: string | null; exercitoId: string | null };
  const pessoaPorId = new Map<string, PessoaInfo>();
  for (const p of pessoasRaw ?? []) {
    const tribo = p.tribo as unknown as
      | { id: string; nome: string; exercito_id: string; exercito: { id: string; nome: string } | null }
      | null;
    const exercitoId = tribo?.exercito_id ?? exercitoIdPorLegadoId.get(p.id) ?? null;
    pessoaPorId.set(p.id, { id: p.id, nome: p.full_name, triboId: tribo?.id ?? null, triboNome: tribo?.nome ?? null, exercitoId });
  }
  const idsTodos = Array.from(pessoaPorId.keys());

  type OpRow = { valor: number; sdr_profile_id: string | null; closer_profile_id: string | null };
  const [funilRows, opsAssinado, opsPago] = await Promise.all([
    idsTodos.length > 0
      ? buscarTudoPaginado<{ profile_id: string; etapa: string; realizado: number; papel: string }>((from, to) =>
          // Assinaturas e Pagos vêm só de weekly_operacoes (abaixo) — mesmo
          // motivo do resto do app (ver CentralNotificacoes.tsx):
          // producao_funil.etapa='assinaturas'/'pagos' é OUTRA sincronização
          // da MESMA operação, e contar as duas fontes juntas duplicava
          // (achado 2026-09-09: "ontem teve 2 assinaturas" quando era 1 só).
          supabase
            .from("producao_funil")
            .select("profile_id, etapa, realizado, papel")
            .in("profile_id", idsTodos)
            .in("etapa", ["tentativas", "alos", "conexoes", "entrevistas"])
            .gte("data", inicio)
            .lt("data", fimExclusivo)
            .range(from, to)
        )
      : Promise.resolve([]),
    buscarTudoPaginado<OpRow>((from, to) =>
      supabase
        .from("weekly_operacoes")
        .select("valor, sdr_profile_id, closer_profile_id")
        .gte("data", inicio)
        .lt("data", fimExclusivo)
        .range(from, to)
    ),
    buscarTudoPaginado<OpRow>((from, to) =>
      supabase
        .from("weekly_operacoes")
        .select("valor, sdr_profile_id, closer_profile_id")
        .eq("status", "PAGO")
        .gte("pago_em", inicio)
        .lt("pago_em", fimExclusivo)
        .range(from, to)
    ),
  ]);

  // ---------- nível pessoa: próprio funil, papel-inclusivo ----------
  const funilPorPessoa = new Map<string, FunilContagem>();
  for (const id of idsTodos) funilPorPessoa.set(id, funilVazio());
  for (const r of funilRows) {
    const bucket = funilPorPessoa.get(r.profile_id);
    if (bucket) bucket[r.etapa as FunilEtapa] += r.realizado;
  }
  function contarPessoal(ops: OpRow[], etapa: FunilEtapa) {
    for (const o of ops) {
      const envolvidos = new Set([o.sdr_profile_id, o.closer_profile_id].filter((x): x is string => !!x));
      for (const pid of Array.from(envolvidos)) {
        const bucket = funilPorPessoa.get(pid);
        if (bucket) bucket[etapa] += 1;
      }
    }
  }
  contarPessoal(opsAssinado, "assinaturas");
  contarPessoal(opsPago, "pagos");

  // ---------- nível time (Tribo/Exército/Firma): 1 crédito só, dono único ----------
  const funilTimePorTribo = new Map<string, FunilContagem>();
  const funilTimePorExercito = new Map<string, FunilContagem>();
  const funilFirma = funilVazio();

  function creditarTime(pessoaId: string | null, etapa: FunilEtapa, qtd: number) {
    if (!pessoaId || qtd === 0) return;
    const info = pessoaPorId.get(pessoaId);
    if (!info) return;
    funilFirma[etapa] += qtd;
    if (info.exercitoId) {
      const bucket = funilTimePorExercito.get(info.exercitoId) ?? funilVazio();
      bucket[etapa] += qtd;
      funilTimePorExercito.set(info.exercitoId, bucket);
    }
    if (info.triboId) {
      const bucket = funilTimePorTribo.get(info.triboId) ?? funilVazio();
      bucket[etapa] += qtd;
      funilTimePorTribo.set(info.triboId, bucket);
    }
  }

  for (const r of funilRows) {
    if (r.etapa === "entrevistas") continue; // tratado à parte, com dedupe
    creditarTime(r.profile_id, r.etapa as FunilEtapa, r.realizado);
  }
  for (const r of funilRows) {
    if (r.etapa !== "entrevistas" || r.papel === "closer") continue;
    creditarTime(r.profile_id, "entrevistas", r.realizado);
  }
  for (const o of opsAssinado) creditarTime(o.closer_profile_id ?? o.sdr_profile_id ?? null, "assinaturas", 1);
  for (const o of opsPago) creditarTime(o.closer_profile_id ?? o.sdr_profile_id ?? null, "pagos", 1);

  // ---------- monta a árvore Exército → Tribo → Pessoa ----------
  const pessoasPorTribo = new Map<string, PessoaVisao[]>();
  for (const p of Array.from(pessoaPorId.values())) {
    if (!p.triboId) continue;
    if (!pessoasPorTribo.has(p.triboId)) pessoasPorTribo.set(p.triboId, []);
    pessoasPorTribo.get(p.triboId)!.push({ id: p.id, nome: p.nome, funil: funilPorPessoa.get(p.id) ?? funilVazio() });
  }

  const tribosPorExercito = new Map<string, TriboVisao[]>();
  const triboVista = new Set<string>();
  for (const p of Array.from(pessoaPorId.values())) {
    if (!p.triboId || !p.exercitoId || triboVista.has(p.triboId)) continue;
    triboVista.add(p.triboId);
    if (!tribosPorExercito.has(p.exercitoId)) tribosPorExercito.set(p.exercitoId, []);
    tribosPorExercito.get(p.exercitoId)!.push({
      id: p.triboId,
      nome: p.triboNome ?? "—",
      funil: funilTimePorTribo.get(p.triboId) ?? funilVazio(),
      pessoas: (pessoasPorTribo.get(p.triboId) ?? []).sort((a, b) => a.nome.localeCompare(b.nome)),
    });
  }

  const exercitos: ExercitoVisao[] = (exercitosRaw ?? [])
    .map((e) => ({
      id: e.id,
      nome: e.nome,
      funil: funilTimePorExercito.get(e.id) ?? funilVazio(),
      tribos: (tribosPorExercito.get(e.id) ?? []).sort((a, b) => a.nome.localeCompare(b.nome)),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return { funil: funilFirma, exercitos };
}
