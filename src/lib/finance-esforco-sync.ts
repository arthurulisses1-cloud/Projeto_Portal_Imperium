// Vorp Finance: mantém o realizado de entrevistas e subidos do compromisso (compromisso_kpis) batendo com os leads.
// O compromisso do dia é gravado quando a pessoa o salva; um lead que entra na planilha depois (ou um subido feito depois)
// deixava o dia gravado com 0 mesmo havendo entrevista. Aqui recontamos os últimos dias e corrigimos só o que diverge.
import type { SupabaseClient } from "@supabase/supabase-js";
import { contarEsforcoFinance, SLUG_FINANCE, type LeadFinance } from "@/lib/finance-time";

const diaAnterior = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") - n * 86400000).toISOString().slice(0, 10);

/** Recalcula entrevistas e subidos gravados dos últimos `dias` dias (até `hoje`). Devolve quantas linhas corrigiu. */
export async function reconciliarEsforcoFinance(admin: SupabaseClient, hoje: string, dias = 14): Promise<number> {
  const desde = diaAnterior(hoje, dias);
  const { data: negocio } = await admin.from("negocios").select("id").eq("slug", SLUG_FINANCE).maybeSingle();
  if (!negocio) return 0;

  const [{ data: kpis }, { data: leads }, { data: membros }] = await Promise.all([
    admin.from("compromisso_kpis").select("id, profile_id, data, chave, realizado").eq("negocio_id", negocio.id).in("chave", ["entrevistas", "subidos"]).gte("data", desde).lte("data", hoje).limit(5000),
    admin
      .from("entrevistas_leads")
      .select("id, lead_nome, data, status_followup, sdr_profile_id, closer_profile_id, subido_em, subido_por, sub_comissao_prevista, venda_valor_recebido, recusada_em, ultimo_movimento_em")
      .eq("negocio_id", negocio.id)
      .or(`and(data.gte.${desde},data.lte.${hoje}),and(subido_em.gte.${desde},subido_em.lte.${hoje})`)
      .limit(5000),
    admin.from("profile_negocios").select("profile_id").eq("negocio_id", negocio.id),
  ]);
  const time = new Set((membros ?? []).map((m) => m.profile_id as string));
  const doDia = new Map<string, ReturnType<typeof contarEsforcoFinance>>();
  let corrigidas = 0;
  for (const k of kpis ?? []) {
    const dia = k.data as string;
    if (!doDia.has(dia)) doDia.set(dia, contarEsforcoFinance((leads ?? []) as unknown as LeadFinance[], time, dia, dia + "~"));
    const c = doDia.get(dia)!;
    const certo = (k.chave === "entrevistas" ? c.entrevistas : c.subidos).get(k.profile_id as string) ?? 0;
    if (Number(k.realizado) !== certo) {
      const { error } = await admin.from("compromisso_kpis").update({ realizado: certo }).eq("id", k.id);
      if (!error) corrigidas += 1;
    }
  }
  return corrigidas;
}
