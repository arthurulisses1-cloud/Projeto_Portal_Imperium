import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarProgressoCampanha, type CampanhaComProgresso, type RecompensaTipo } from "@/lib/campanhas";

export type ConcessaoPrevia = {
  profileId: string;
  nome: string;
  role: "sdr" | "closer" | "lider";
  valor: number;
  // De qual grupo/pessoa vencedora veio esse crédito — pra deixar claro
  // na tela de apuração ("Marcus Lira — via Tribo Aquila").
  origemLabel: string;
};

export type ResultadoConcessao = {
  campanha: CampanhaComProgresso;
  requisito: number | null;
  vencedores: { refId: string; label: string; valor: number }[];
  concessoes: ConcessaoPrevia[];
};

// Calcula quem venceu (bateu o requisito mínimo) e quanto cada um recebe,
// SEM gravar nada — usado tanto pra mostrar a prévia na tela de apuração
// quanto, de novo, no momento de confirmar (nunca confia em valores vindos
// do form do cliente pra dinheiro/estrela).
export async function calcularConcessaoCampanha(
  supabase: SupabaseClient,
  campanhaId: string
): Promise<ResultadoConcessao | null> {
  const campanha = await buscarProgressoCampanha(supabase, campanhaId);
  if (!campanha) return null;

  const requisito = campanha.requisitoMinimoValor ?? campanha.metaValor ?? null;
  if (requisito === null || !campanha.recompensaTipo) {
    return { campanha, requisito, vencedores: [], concessoes: [] };
  }

  const vencedores = campanha.participantes.filter((p) => p.valor >= requisito);
  if (vencedores.length === 0) {
    return { campanha, requisito, vencedores: [], concessoes: [] };
  }

  const valorPorRole = {
    sdr: campanha.recompensaValorSdr,
    closer: campanha.recompensaValorCloser,
    lider: campanha.recompensaValorLider,
  };

  // Resolve o conjunto de pessoas (com papel) que recebem crédito por cada
  // refId vencedor — pra individual/grupo_rank o refId JÁ é a pessoa; pra
  // tribo/exercito/geral é um grupo, então precisa expandir.
  async function pessoasDoRefId(refId: string): Promise<{ id: string; nome: string; role: "sdr" | "closer" | "lider" }[]> {
    if (campanha!.alvo === "individual" || campanha!.alvo === "grupo_rank") {
      const { data } = await supabase.from("profiles").select("id, full_name, role").eq("id", refId).maybeSingle();
      if (!data || (data.role !== "sdr" && data.role !== "closer" && data.role !== "lider")) return [];
      return [{ id: data.id, nome: data.full_name, role: data.role }];
    }

    if (campanha!.alvo === "tribo") {
      const { data: tribo } = await supabase.from("tribos").select("id, closer_id, exercito_id").eq("id", refId).maybeSingle();
      if (!tribo) return [];
      const [{ data: sdrs }, { data: closer }, { data: exercito }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, role").eq("tribo_id", refId).eq("role", "sdr").eq("ativo", true),
        tribo.closer_id ? supabase.from("profiles").select("id, full_name, role").eq("id", tribo.closer_id).maybeSingle() : Promise.resolve({ data: null }),
        tribo.exercito_id ? supabase.from("exercitos").select("legado_id").eq("id", tribo.exercito_id).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const lider = exercito?.legado_id
        ? await supabase.from("profiles").select("id, full_name, role").eq("id", exercito.legado_id).maybeSingle()
        : { data: null };
      const pessoas: { id: string; nome: string; role: "sdr" | "closer" | "lider" }[] = [];
      for (const s of sdrs ?? []) pessoas.push({ id: s.id, nome: s.full_name, role: "sdr" });
      if (closer) pessoas.push({ id: closer.id, nome: closer.full_name, role: "closer" });
      if (lider.data) pessoas.push({ id: lider.data.id, nome: lider.data.full_name, role: "lider" });
      return pessoas;
    }

    if (campanha!.alvo === "exercito") {
      const [{ data: exercito }, { data: tribosDoExercito }] = await Promise.all([
        supabase.from("exercitos").select("id, legado_id").eq("id", refId).maybeSingle(),
        supabase.from("tribos").select("id, closer_id").eq("exercito_id", refId),
      ]);
      const idsTribos = (tribosDoExercito ?? []).map((t) => t.id);
      const closerIds = (tribosDoExercito ?? []).map((t) => t.closer_id).filter((x): x is string => !!x);
      const [{ data: sdrs }, { data: closers }, liderResult] = await Promise.all([
        idsTribos.length > 0
          ? supabase.from("profiles").select("id, full_name, role").in("tribo_id", idsTribos).eq("role", "sdr").eq("ativo", true)
          : Promise.resolve({ data: [] }),
        closerIds.length > 0
          ? supabase.from("profiles").select("id, full_name, role").in("id", closerIds)
          : Promise.resolve({ data: [] }),
        exercito?.legado_id
          ? supabase.from("profiles").select("id, full_name, role").eq("id", exercito.legado_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const pessoas: { id: string; nome: string; role: "sdr" | "closer" | "lider" }[] = [];
      for (const s of sdrs ?? []) pessoas.push({ id: s.id, nome: s.full_name, role: "sdr" });
      for (const c of closers ?? []) pessoas.push({ id: c.id, nome: c.full_name, role: "closer" });
      if (liderResult.data) pessoas.push({ id: liderResult.data.id, nome: liderResult.data.full_name, role: "lider" });
      return pessoas;
    }

    // "geral" — a firma toda, cada um recebe o valor do próprio papel.
    const { data } = await supabase.from("profiles").select("id, full_name, role").in("role", ["sdr", "closer", "lider"]).eq("ativo", true);
    return (data ?? []).map((p) => ({ id: p.id, nome: p.full_name, role: p.role as "sdr" | "closer" | "lider" }));
  }

  const porPessoa = new Map<string, ConcessaoPrevia>();
  for (const v of vencedores) {
    const pessoas = await pessoasDoRefId(v.refId);
    for (const p of pessoas) {
      const valor = valorPorRole[p.role] ?? 0;
      if (valor <= 0) continue;
      const existente = porPessoa.get(p.id);
      if (existente) {
        existente.valor += valor;
        existente.origemLabel += `, ${v.label}`;
      } else {
        porPessoa.set(p.id, { profileId: p.id, nome: p.nome, role: p.role, valor, origemLabel: v.label });
      }
    }
  }

  return { campanha, requisito, vencedores, concessoes: Array.from(porPessoa.values()).sort((a, b) => b.valor - a.valor) };
}

export type { RecompensaTipo };
