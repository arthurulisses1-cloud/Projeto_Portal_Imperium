import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeBR, paraDataUTC } from "@/lib/data-br";
import { logErroSupabase } from "@/lib/log-erro-supabase";

// Repasse de entrevistas recusadas pra SDR (pedido do Diretor, 2026-10-09).
// Entrevista que o closer não validou vira "Entrevista Recusada"; em D+15 o
// lead é atribuído a um SDR de OUTRO Exército (diferente do SDR original),
// que tenta gerar uma nova entrevista com o cliente.

export const DIAS_ATE_REPASSE = 15;

export const ETAPAS_REPASSE = [
  { valor: "base_repasses", label: "Base de Repasses" },
  { valor: "tentando_reativacao", label: "Tentando Reativação" },
  { valor: "entrevista_recuperada", label: "Entrevista Recuperada" },
  { valor: "nao_faz_sentido", label: "Não faz sentido recuperar" },
] as const;

export type EtapaRepasse = (typeof ETAPAS_REPASSE)[number]["valor"];

export type LeadParaRepasse = {
  status_followup: string;
  recusada_em: string | null;
  repasse_sdr_id: string | null;
  repasse_etapa: string | null;
  sdr_profile_id: string | null;
  repasse_tentaram: string[];
};

function somarDias(data: string, dias: number): string {
  const d = paraDataUTC(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function dataDoRepasse(recusadaEm: string): string {
  return somarDias(recusadaEm, DIAS_ATE_REPASSE);
}

export function deveAtribuirRepasse(l: LeadParaRepasse, hoje: string): boolean {
  if (l.status_followup !== "entrevista_recusada") return false;
  if (!l.recusada_em) return false;
  if (l.repasse_sdr_id || l.repasse_etapa) return false; // já atribuído (ou travado em "não faz sentido")
  return dataDoRepasse(l.recusada_em) <= hoje;
}

export type SdrDaFila = { id: string; exercitoId: string | null };

// Escolhe o SDR: nunca o original, nunca de um Exército igual ao do SDR
// original, nunca quem já tentou esse lead; entre os restantes, o com menos
// leads de repasse em andamento (desempate por id).
export function escolherSdrRepasse(
  l: Pick<LeadParaRepasse, "sdr_profile_id" | "repasse_tentaram">,
  exercitoDoSdrOriginal: string | null,
  sdrs: SdrDaFila[],
  carga: Map<string, number>
): string | null {
  const candidatos = sdrs
    .filter((s) => s.id !== l.sdr_profile_id)
    .filter((s) => !l.repasse_tentaram.includes(s.id))
    .filter((s) => !(exercitoDoSdrOriginal && s.exercitoId === exercitoDoSdrOriginal));
  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => (carga.get(a.id) ?? 0) - (carga.get(b.id) ?? 0) || a.id.localeCompare(b.id));
  return candidatos[0].id;
}

// Roda no fim de cada sync (idempotente): atribui os leads que completaram
// D+15 da recusa.
export async function atribuirRepassesDeEntrevista(supabase: SupabaseClient): Promise<{ atribuidos: number }> {
  const hoje = hojeBR();

  const { data: recusadasRaw, error } = await supabase
    .from("entrevistas_leads")
    .select("id, lead_nome, status_followup, recusada_em, repasse_sdr_id, repasse_etapa, sdr_profile_id, repasse_tentaram")
    .eq("status_followup", "entrevista_recusada")
    .is("repasse_sdr_id", null)
    .is("repasse_etapa", null);
  logErroSupabase("atribuirRepassesDeEntrevista: recusadas", error);

  const pendentes = ((recusadasRaw ?? []) as (LeadParaRepasse & { id: string; lead_nome: string })[]).filter((l) =>
    deveAtribuirRepasse(l, hoje)
  );
  if (pendentes.length === 0) return { atribuidos: 0 };

  const [{ data: sdrsRaw }, { data: emAndamento }] = await Promise.all([
    supabase.from("profiles").select("id, tribo:tribos!profiles_tribo_id_fkey(exercito_id)").eq("role", "sdr").eq("ativo", true),
    supabase.from("entrevistas_leads").select("repasse_sdr_id").in("repasse_etapa", ["base_repasses", "tentando_reativacao"]),
  ]);

  const sdrs: SdrDaFila[] = (sdrsRaw ?? []).map((p) => ({
    id: p.id as string,
    exercitoId: (p.tribo as unknown as { exercito_id: string | null } | null)?.exercito_id ?? null,
  }));
  const exercitoPorSdr = new Map(sdrs.map((s) => [s.id, s.exercitoId]));

  // O SDR original pode estar inativo (fora da lista acima) — nesse caso o
  // Exército dele vem direto do profile.
  const idsOriginaisFora = Array.from(
    new Set(pendentes.map((l) => l.sdr_profile_id).filter((id): id is string => !!id && !exercitoPorSdr.has(id)))
  );
  if (idsOriginaisFora.length > 0) {
    const { data: extras } = await supabase
      .from("profiles")
      .select("id, tribo:tribos!profiles_tribo_id_fkey(exercito_id)")
      .in("id", idsOriginaisFora);
    for (const p of extras ?? []) {
      exercitoPorSdr.set(p.id as string, (p.tribo as unknown as { exercito_id: string | null } | null)?.exercito_id ?? null);
    }
  }

  const carga = new Map<string, number>();
  for (const r of emAndamento ?? []) {
    if (r.repasse_sdr_id) carga.set(r.repasse_sdr_id as string, (carga.get(r.repasse_sdr_id as string) ?? 0) + 1);
  }

  let atribuidos = 0;
  for (const l of pendentes) {
    const exercitoOriginal = l.sdr_profile_id ? exercitoPorSdr.get(l.sdr_profile_id) ?? null : null;
    const sdrId = escolherSdrRepasse(l, exercitoOriginal, sdrs, carga);
    if (!sdrId) continue;

    const { error: updError } = await supabase
      .from("entrevistas_leads")
      .update({
        repasse_sdr_id: sdrId,
        repasse_etapa: "base_repasses",
        repasse_desde: hoje,
        repasse_tentaram: [...l.repasse_tentaram, sdrId],
      })
      .eq("id", l.id);
    if (updError) {
      logErroSupabase(`atribuirRepassesDeEntrevista: update ${l.id}`, updError);
      continue;
    }
    carga.set(sdrId, (carga.get(sdrId) ?? 0) + 1);
    await supabase.from("lead_atualizacoes").insert({
      lead_id: l.id,
      autor_id: null,
      tipo: "repasse",
      nota: "D+15 da recusa — lead enviado pra um SDR de outro Exército tentar reativar",
      detalhe: { sdr: sdrId },
    });
    atribuidos++;
  }

  return { atribuidos };
}
