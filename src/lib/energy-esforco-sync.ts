// Vorp Energy: mantém o realizado do compromisso (contas subidas, assinaturas, kWh gerado) batendo com a Sunne nos dias que já passaram.
// O compromisso do dia é gravado quando a pessoa o salva; contas subidas ou fechadas depois disso deixavam o dia gravado a menos.
// Hoje continua ao vivo (buscarCompromissoEnergia); aqui recontamos os últimos dias e corrigimos só o que diverge.
import type { SupabaseClient } from "@supabase/supabase-js";
import { lerAssinaturasDosDias, lerRedeSunne, vendedoresSunne } from "@/lib/sunne";
import { realizadoDoDia, SLUG_ENERGY } from "@/lib/energy-time";

const diaAnterior = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") - n * 86400000).toISOString().slice(0, 10);

/** Recalcula o realizado gravado dos `dias` dias anteriores a `hoje` (hoje fica de fora). Devolve quantas linhas corrigiu. */
export async function reconciliarEsforcoEnergy(admin: SupabaseClient, hoje: string, dias = 5): Promise<number> {
  const desde = diaAnterior(hoje, dias);
  const ontem = diaAnterior(hoje, 1);
  const { data: negocio } = await admin.from("negocios").select("id").eq("slug", SLUG_ENERGY).maybeSingle();
  if (!negocio) return 0;
  const { data: kpis } = await admin
    .from("compromisso_kpis")
    .select("id, profile_id, data, chave, realizado")
    .eq("negocio_id", negocio.id)
    .in("chave", ["contas_subidas", "assinaturas", "kwh_gerado"])
    .gte("data", desde)
    .lte("data", ontem)
    .limit(5000);
  if (!kpis || kpis.length === 0) return 0;

  const [rede, { data: perfis }] = await Promise.all([lerRedeSunne(), admin.from("profiles").select("id, full_name, nomes_planilha").eq("ativo", true)]);
  const orgsPor = new Map<string, Set<string>>();
  for (const [orgId, v] of Array.from(vendedoresSunne(rede.organizacoes, perfis ?? []))) {
    if (!v.profileId) continue;
    const s = orgsPor.get(v.profileId) ?? new Set<string>();
    s.add(orgId);
    orgsPor.set(v.profileId, s);
  }
  const diasComKpi = Array.from(new Set(kpis.map((k) => k.data as string))).sort();
  let assinaturas: Map<string, Map<string, number>> | null = null;
  if (kpis.some((k) => k.chave === "assinaturas")) {
    try {
      assinaturas = await lerAssinaturasDosDias(diasComKpi);
    } catch (e) {
      console.error("reconciliarEsforcoEnergy: assinaturas indisponíveis, só contas e kWh:", e);
    }
  }

  let corrigidas = 0;
  for (const k of kpis) {
    const orgs = orgsPor.get(k.profile_id as string);
    if (!orgs) continue; // sem organização casada na Sunne: não há como recontar, mantém o gravado
    const dia = k.data as string;
    let certo: number | null = null;
    if (k.chave === "assinaturas") {
      const porOrg = assinaturas?.get(dia);
      if (porOrg) certo = Array.from(orgs).reduce((s, o) => s + (porOrg.get(o) ?? 0), 0);
    } else {
      const r = realizadoDoDia(rede.deals, orgs, dia);
      certo = k.chave === "contas_subidas" ? r.contasSubidas : r.kwh;
    }
    if (certo === null || Number(k.realizado) === certo) continue;
    const { error } = await admin.from("compromisso_kpis").update({ realizado: certo }).eq("id", k.id);
    if (!error) corrigidas += 1;
  }
  return corrigidas;
}
