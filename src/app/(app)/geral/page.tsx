import { createClient } from "@/lib/supabase/server";
import { FUNNEL_STAGES, FUNNEL_LABELS, type FunilEtapa } from "@/lib/funil";
import { calcularFunilMeta } from "@/lib/metas";
import Card from "@/components/ui/Card";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type FunilTotais = Record<FunilEtapa, number>;
function totaisVazios(): FunilTotais {
  return Object.fromEntries(FUNNEL_STAGES.map((e) => [e, 0])) as FunilTotais;
}

function FunilTabela({ realizado, meta }: { realizado: FunilTotais; meta: Record<FunilEtapa, number | null> }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
          <th className="pb-2">Etapa</th>
          <th className="pb-2 text-right">Realizado</th>
          <th className="pb-2 text-right">Meta</th>
          <th className="pb-2 text-right">%</th>
        </tr>
      </thead>
      <tbody>
        {FUNNEL_STAGES.map((etapa) => {
          const m = meta[etapa];
          const pct = m && m > 0 ? Math.min(100, (realizado[etapa] / m) * 100) : null;
          return (
            <tr key={etapa} className="border-t border-imperium-line">
              <td className="py-2 text-stone-300">{FUNNEL_LABELS[etapa]}</td>
              <td className="py-2 text-right text-stone-100">{realizado[etapa]}</td>
              <td className="py-2 text-right text-stone-500">{m ? Math.round(m) : "—"}</td>
              <td className={`py-2 text-right ${pct !== null && pct >= 100 ? "text-emerald-400" : "text-gold-dim"}`}>
                {pct !== null ? `${pct.toFixed(0)}%` : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default async function VisaoGeralPage() {
  const supabase = await createClient();

  const agora = new Date();
  const { data: metaMes } = await supabase
    .from("metas_mensais")
    .select("id, meta_credito_total, meta_ticket_medio")
    .eq("ano", agora.getFullYear())
    .eq("mes", agora.getMonth() + 1)
    .maybeSingle();

  const { data: conversoes } = metaMes
    ? await supabase
        .from("metas_conversao")
        .select("etapa_de, etapa_para, taxa_esperada")
        .eq("meta_mensal_id", metaMes.id)
    : { data: [] };
  const taxaMap = new Map((conversoes ?? []).map((c) => [`${c.etapa_de}_${c.etapa_para}`, c.taxa_esperada]));

  const { data: exercitos } = await supabase
    .from("exercitos")
    .select("id, nome, legado:profiles!exercitos_legado_id_fkey(full_name)");
  const { data: tribos } = await supabase.from("tribos").select("id, nome, exercito_id");

  const { data: pessoas } = await supabase
    .from("profiles")
    .select("id, role, tribo:tribos!profiles_tribo_id_fkey(id, exercito_id)")
    .in("role", ["sdr", "closer"]);

  const inicioMes = agora.toISOString().slice(0, 7) + "-01";
  const idsTodos = (pessoas ?? []).map((p) => p.id);

  const { data: funilRows } =
    idsTodos.length > 0
      ? await supabase
          .from("producao_funil")
          .select("profile_id, etapa, realizado")
          .in("profile_id", idsTodos)
          .gte("data", inicioMes)
      : { data: [] };

  const { data: vendasRows } =
    idsTodos.length > 0
      ? await supabase.from("vendas").select("profile_id, valor").in("profile_id", idsTodos).gte("data", inicioMes)
      : { data: [] };

  // profile_id -> {tribo_id, exercito_id}
  const orgPorProfile = new Map<string, { triboId: string | null; exercitoId: string | null }>();
  for (const p of pessoas ?? []) {
    const tribo = p.tribo as unknown as { id: string; exercito_id: string } | null;
    orgPorProfile.set(p.id, { triboId: tribo?.id ?? null, exercitoId: tribo?.exercito_id ?? null });
  }

  const totalGeral = totaisVazios();
  const totalPorExercito = new Map<string, FunilTotais>();
  const totalPorTribo = new Map<string, FunilTotais>();
  for (const row of funilRows ?? []) {
    const etapa = row.etapa as FunilEtapa;
    totalGeral[etapa] += row.realizado;
    const org = orgPorProfile.get(row.profile_id);
    if (org?.exercitoId) {
      if (!totalPorExercito.has(org.exercitoId)) totalPorExercito.set(org.exercitoId, totaisVazios());
      totalPorExercito.get(org.exercitoId)![etapa] += row.realizado;
    }
    if (org?.triboId) {
      if (!totalPorTribo.has(org.triboId)) totalPorTribo.set(org.triboId, totaisVazios());
      totalPorTribo.get(org.triboId)![etapa] += row.realizado;
    }
  }

  const pagosPorExercito = new Map<string, number>();
  for (const row of vendasRows ?? []) {
    const exId = orgPorProfile.get(row.profile_id)?.exercitoId;
    if (!exId) continue;
    pagosPorExercito.set(exId, (pagosPorExercito.get(exId) ?? 0) + Number(row.valor));
  }

  const metaCredito = metaMes?.meta_credito_total ?? 0;
  const metaTicket = metaMes?.meta_ticket_medio ?? 0;
  const metaFunilGeral = calcularFunilMeta(metaCredito, metaTicket, taxaMap);

  const numExercitos = exercitos?.length ?? 0;
  const metaCreditoPorExercito = numExercitos > 0 ? metaCredito / numExercitos : 0;
  const metaFunilExercito = calcularFunilMeta(metaCreditoPorExercito, metaTicket, taxaMap);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Visão Geral da Firma</h1>
        <p className="kicker mt-1">Império · todos os Exércitos</p>
      </div>

      <Card title="Funil consolidado do mês — Império">
        {metaCredito <= 0 && (
          <p className="mb-3 text-xs text-gold-dim">
            Cadastre a meta de crédito, ticket médio e taxas de conversão em &quot;Metas Mensais&quot; pra
            ver a meta calculada por etapa.
          </p>
        )}
        <FunilTabela realizado={totalGeral} meta={metaFunilGeral} />
      </Card>

      {(exercitos ?? []).map((e) => {
        const tribosDoExercito = (tribos ?? []).filter((t) => t.exercito_id === e.id);
        const legado = e.legado as unknown as { full_name: string } | null;
        const realizadoExercito = totalPorExercito.get(e.id) ?? totaisVazios();
        const numTribos = tribosDoExercito.length;
        const metaCreditoTribo = numTribos > 0 ? metaCreditoPorExercito / numTribos : 0;
        const metaFunilTribo = calcularFunilMeta(metaCreditoTribo, metaTicket, taxaMap);

        return (
          <Card
            key={e.id}
            title={`${e.nome} · Legado: ${legado?.full_name ?? "—"}`}
            right={<span className="text-gold-bright">{moeda(pagosPorExercito.get(e.id) ?? 0)}</span>}
          >
            <FunilTabela realizado={realizadoExercito} meta={metaFunilExercito} />

            {tribosDoExercito.length > 0 && (
              <div className="mt-6 space-y-4">
                {tribosDoExercito.map((t) => (
                  <div key={t.id} className="border-t border-imperium-line pt-4">
                    <p className="mb-2 text-xs uppercase tracking-wide text-stone-500">{t.nome}</p>
                    <FunilTabela realizado={totalPorTribo.get(t.id) ?? totaisVazios()} meta={metaFunilTribo} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </main>
  );
}
