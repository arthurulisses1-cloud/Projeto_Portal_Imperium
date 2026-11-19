// Consolidado do compromisso do dia de cada time (Mural do Diretor): o que cada pessoa prometeu, quanto já fez e o geral do time.
// Lê compromisso_kpis (o compromisso dos negócios) e, no Match e no Energy, atualiza o realizado automático na hora
// (vendas de hoje no Match; Sunne no Energy), porque a linha gravada só muda quando a pessoa abre a própria tela.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarCompromissoEnergia } from "@/lib/energy-time";
import type { AuditoriaGravada, LeadAuditoria } from "@/lib/integracoes/auditoria";
import { usuarioCrmDoPerfil } from "@/lib/sdr-negocio";

export type KpiPessoa = { chave: string; label: string; meta: number; realizado: number };
export type PessoaCompromisso = {
  id: string;
  nome: string;
  cargo: string;
  /** Lançou o compromisso de hoje (algum indicador com meta). */
  lancou: boolean;
  faltou: boolean;
  kpis: KpiPessoa[];
  /** Atingimento médio dos indicadores com meta (0 a 1); null = não lançou. */
  atingimento: number | null;
};
export type KpiTime = { chave: string; label: string; meta: number; realizado: number; pct: number | null };
export type TimeCompromisso = {
  slug: string;
  nome: string;
  pessoas: PessoaCompromisso[];
  kpis: KpiTime[];
  lancaram: number;
  esperados: number;
  /** Atingimento médio de quem lançou (0 a 1); null = ninguém lançou. */
  atingimento: number | null;
};

/** Cargos que fazem compromisso diário (o Head e os demais não entram na conta). */
export const CARGOS_COMPROMISSO = ["executivo", "closer", "sdr", "bdr", "pre_vendas"];

/** Atingimento médio dos indicadores com meta, cada um limitado a 100% (pura). null = nenhuma meta. */
export function atingimentoDaPessoa(kpis: Pick<KpiPessoa, "meta" | "realizado">[]): number | null {
  const comMeta = kpis.filter((k) => k.meta > 0);
  if (comMeta.length === 0) return null;
  return comMeta.reduce((s, k) => s + Math.min(1, k.realizado / k.meta), 0) / comMeta.length;
}

const diaBR = (iso: string | null) => (!iso ? null : iso.length <= 10 ? iso : new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));

/** Reuniões que a pessoa agendou e realizou hoje, pela auditoria do CRM: quem agendou (pré-vendas) ou fechou (closer) (pura). */
export function reunioesDeHoje(leads: Pick<LeadAuditoria, "preVendas" | "closer" | "agendadaEm" | "realizadaEm">[], nomeCrm: string, hoje: string): { agendadas: number; realizadas: number } {
  const meus = leads.filter((l) => l.preVendas === nomeCrm || l.closer === nomeCrm);
  return {
    agendadas: meus.filter((l) => l.preVendas === nomeCrm && diaBR(l.agendadaEm) === hoje).length,
    realizadas: meus.filter((l) => diaBR(l.realizadaEm) === hoje).length,
  };
}

/** Monta o consolidado de um time (pura). `kpisPorPessoa`: indicadores gravados hoje; `faltaram`: quem foi marcado como ausente. */
export function montarTime(
  slug: string,
  nome: string,
  membros: { id: string; nome: string; cargo: string }[],
  kpisPorPessoa: Map<string, KpiPessoa[]>,
  faltaram: ReadonlySet<string>,
): TimeCompromisso {
  const pessoas: PessoaCompromisso[] = membros
    .map((m) => {
      const kpis = (kpisPorPessoa.get(m.id) ?? []).slice().sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
      const lancou = kpis.some((k) => k.meta > 0);
      return { id: m.id, nome: m.nome, cargo: m.cargo, lancou, faltou: faltaram.has(m.id) && !lancou, kpis, atingimento: lancou ? atingimentoDaPessoa(kpis) : null };
    })
    .sort((a, b) => Number(b.lancou) - Number(a.lancou) || (a.atingimento ?? 2) - (b.atingimento ?? 2) || a.nome.localeCompare(b.nome, "pt-BR"));

  const porChave = new Map<string, KpiTime>();
  for (const p of pessoas) {
    if (!p.lancou) continue;
    for (const k of p.kpis) {
      const t = porChave.get(k.chave) ?? { chave: k.chave, label: k.label, meta: 0, realizado: 0, pct: null };
      t.meta += k.meta;
      t.realizado += k.realizado;
      porChave.set(k.chave, t);
    }
  }
  const kpis = Array.from(porChave.values())
    .map((k) => ({ ...k, pct: k.meta > 0 ? k.realizado / k.meta : null }))
    .filter((k) => k.meta > 0)
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const quemLancou = pessoas.filter((p) => p.lancou && p.atingimento !== null);
  const esperados = pessoas.filter((p) => !p.faltou).length;
  return {
    slug,
    nome,
    pessoas,
    kpis,
    lancaram: pessoas.filter((p) => p.lancou).length,
    esperados,
    atingimento: quemLancou.length > 0 ? quemLancou.reduce((s, p) => s + (p.atingimento ?? 0), 0) / quemLancou.length : null,
  };
}

export async function buscarCompromissosDosTimes(admin: SupabaseClient, hoje: string): Promise<TimeCompromisso[]> {
  const { data: negocios } = await admin.from("negocios").select("id, slug, nome, equipe_nome").eq("status", "ativo").order("ordem");
  const lista = negocios ?? [];
  if (lista.length === 0) return [];
  const ids = lista.map((n) => n.id as string);

  const [{ data: vinculos }, { data: kpis }, { data: faltas }, { data: vendasHoje }] = await Promise.all([
    admin.from("profile_negocios").select("negocio_id, cargo, profiles!inner(id, full_name, ativo)").in("negocio_id", ids).in("cargo", CARGOS_COMPROMISSO),
    admin.from("compromisso_kpis").select("profile_id, negocio_id, chave, label, meta, realizado").eq("data", hoje).in("negocio_id", ids),
    admin.from("compromissos").select("profile_id").eq("data", hoje).eq("falta", true),
    admin.from("vendas").select("negocio_id, profile_id, valor, mrr").eq("data", hoje).in("negocio_id", ids),
  ]);
  const faltaram = new Set((faltas ?? []).map((f) => f.profile_id as string));

  type V = { negocio_id: string; cargo: string; profiles: { id: string; full_name: string; ativo: boolean } | { id: string; full_name: string; ativo: boolean }[] };
  const resultado: TimeCompromisso[] = [];
  for (const n of lista) {
    const membros = ((vinculos ?? []) as unknown as V[])
      .filter((v) => v.negocio_id === n.id)
      .map((v) => ({ cargo: v.cargo, p: Array.isArray(v.profiles) ? v.profiles[0] : v.profiles }))
      .filter((v) => v.p?.ativo)
      .map((v) => ({ id: v.p.id, nome: v.p.full_name, cargo: v.cargo }));
    const kpisPor = new Map<string, KpiPessoa[]>();
    for (const k of (kpis ?? []).filter((x) => x.negocio_id === n.id)) {
      kpisPor.set(k.profile_id as string, [...(kpisPor.get(k.profile_id as string) ?? []), { chave: k.chave as string, label: k.label as string, meta: Number(k.meta), realizado: Number(k.realizado) }]);
    }

    // Realizado automático ao vivo: Match (recebido e MRR das vendas de hoje) e Energy (Sunne).
    if (n.slug === "matchsales") {
      for (const m of membros) {
        const minhas = (vendasHoje ?? []).filter((v) => v.negocio_id === n.id && v.profile_id === m.id);
        for (const k of kpisPor.get(m.id) ?? []) {
          if (k.chave === "recebido") k.realizado = minhas.reduce((s, v) => s + Number(v.valor ?? 0), 0);
          if (k.chave === "mrr") k.realizado = minhas.reduce((s, v) => s + Number(v.mrr ?? 0), 0);
        }
      }
    }
    // Acrópole: as reuniões agendadas e realizadas de hoje vêm do CRM (antes valia só o que a pessoa digitava).
    if (n.slug === "vorp") {
      const [{ data: mb }, { data: pf }, { data: au }] = await Promise.all([
        admin.from("integracao_estado").select("valor").eq("chave", "pipefacil:vorp:membros").maybeSingle(),
        admin.from("integracao_estado").select("valor").eq("chave", "pipefacil:vorp:perfis").maybeSingle(),
        admin.from("integracao_estado").select("valor").eq("chave", "auditoria:vorp").maybeSingle(),
      ]);
      const nomesCrm = (mb?.valor as Record<string, string> | null) ?? {};
      const leads = ((au?.valor as AuditoriaGravada | null)?.leads ?? []) as LeadAuditoria[];
      for (const m of membros) {
        const usuario = usuarioCrmDoPerfil((pf?.valor as Record<string, string> | null) ?? null, nomesCrm, m.id, m.nome);
        const nomeCrm = usuario ? nomesCrm[usuario] ?? null : null;
        if (!nomeCrm) continue;
        const r = reunioesDeHoje(leads, nomeCrm, hoje);
        for (const k of kpisPor.get(m.id) ?? []) {
          if (k.chave === "reunioes_agendadas") k.realizado = r.agendadas;
          if (k.chave === "reunioes_realizadas") k.realizado = r.realizadas;
        }
      }
    }
    if (n.slug === "vorp-energy") {
      await Promise.all(
        membros
          .filter((m) => (kpisPor.get(m.id) ?? []).some((k) => ["contas_subidas", "assinaturas", "kwh_gerado"].includes(k.chave)))
          .map(async (m) => {
            try {
              const real = await buscarCompromissoEnergia(admin, m.id, hoje);
              for (const k of kpisPor.get(m.id) ?? []) {
                if (k.chave === "contas_subidas") k.realizado = real.contasSubidas;
                if (k.chave === "assinaturas" && real.assinaturas !== null) k.realizado = real.assinaturas;
                if (k.chave === "kwh_gerado") k.realizado = real.kwh;
              }
            } catch (e) {
              console.error("compromisso do Energy ao vivo falhou:", e);
            }
          }),
      );
    }

    resultado.push(montarTime(n.slug, n.equipe_nome || n.nome, membros, kpisPor, faltaram));
  }
  return resultado;
}
