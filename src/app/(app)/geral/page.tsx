import { createClient } from "@/lib/supabase/server";
import { FUNNEL_STAGES, FUNNEL_LABELS, type FunilEtapa } from "@/lib/funil";
import { calcularFunilMeta } from "@/lib/metas";
import { calcularGargalo, textoGargalo } from "@/lib/gargalo";
import Card from "@/components/ui/Card";
import BarraProgresso from "@/components/ui/BarraProgresso";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type FunilTotais = Record<FunilEtapa, number>;
function totaisVazios(): FunilTotais {
  return Object.fromEntries(FUNNEL_STAGES.map((e) => [e, 0])) as FunilTotais;
}

function FunilDuplo({
  realizado,
  meta,
}: {
  realizado: FunilTotais;
  meta: Record<FunilEtapa, number | null>;
}) {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <p className="kicker mb-3">Volume</p>
        <div className="space-y-3">
          {FUNNEL_STAGES.map((etapa) => {
            const m = meta[etapa];
            return (
              <div key={etapa} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-stone-400">{FUNNEL_LABELS[etapa]}</span>
                <BarraProgresso realizado={realizado[etapa]} meta={m ?? 0} />
                <span className="w-20 shrink-0 text-right text-stone-100">
                  {realizado[etapa]}/{m ? Math.round(m) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <p className="kicker mb-3">Taxa de conversão</p>
        <div className="space-y-3">
          {FUNNEL_STAGES.map((etapa, i) => {
            const anterior = i > 0 ? realizado[FUNNEL_STAGES[i - 1]] : null;
            const pct = anterior && anterior > 0 ? (realizado[etapa] / anterior) * 100 : null;
            return (
              <div key={etapa} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-stone-400">{FUNNEL_LABELS[etapa]}</span>
                <BarraProgresso realizado={pct ?? 0} meta={100} />
                <span className="w-16 shrink-0 text-right text-stone-100">
                  {pct !== null ? `${pct.toFixed(0)}%` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Diagnostico({ realizado, taxas }: { realizado: FunilTotais; taxas: Map<string, number> }) {
  if (taxas.size === 0) {
    return (
      <p className="text-sm text-stone-400">
        Cadastre as taxas de conversão esperadas em &quot;Metas Mensais&quot; pra ver o diagnóstico
        inteligente deste funil.
      </p>
    );
  }
  const gargalo = calcularGargalo(realizado, taxas);
  if (!gargalo) {
    return <p className="text-sm text-emerald-400">Funil equilibrado — nenhuma etapa abaixo da meta de conversão.</p>;
  }
  return (
    <>
      <p className="mb-1 flex items-center gap-2 text-sm font-medium text-wine-bright">⚠ Diagnóstico do Funil</p>
      <p className="text-sm text-stone-300">{textoGargalo(gargalo)}</p>
    </>
  );
}

function AbaLink({ href, ativo, children }: { href: string; ativo: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className={`rounded px-3 py-1.5 text-xs uppercase transition ${
        ativo ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold"
      }`}
    >
      {children}
    </a>
  );
}

export default async function VisaoGeralPage({
  searchParams,
}: {
  searchParams: { visao?: string; exercito?: string; tribo?: string };
}) {
  const supabase = await createClient();

  const visao = searchParams.visao === "exercito" ? "exercito" : "completo";
  const exercitoId = searchParams.exercito;
  const triboId = searchParams.tribo;

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
  const pagosPorTribo = new Map<string, number>();
  let pagoGeral = 0;
  for (const row of vendasRows ?? []) {
    pagoGeral += Number(row.valor);
    const org = orgPorProfile.get(row.profile_id);
    if (org?.exercitoId) pagosPorExercito.set(org.exercitoId, (pagosPorExercito.get(org.exercitoId) ?? 0) + Number(row.valor));
    if (org?.triboId) pagosPorTribo.set(org.triboId, (pagosPorTribo.get(org.triboId) ?? 0) + Number(row.valor));
  }

  const metaCredito = metaMes?.meta_credito_total ?? 0;
  const metaTicket = metaMes?.meta_ticket_medio ?? 0;
  const metaFunilGeral = calcularFunilMeta(metaCredito, metaTicket, taxaMap);

  const numExercitos = exercitos?.length ?? 0;
  const metaCreditoPorExercito = numExercitos > 0 ? metaCredito / numExercitos : 0;
  const metaFunilExercito = calcularFunilMeta(metaCreditoPorExercito, metaTicket, taxaMap);

  const exercitoAtual = exercitoId ? (exercitos ?? []).find((e) => e.id === exercitoId) : null;
  const tribosDoExercito = exercitoId ? (tribos ?? []).filter((t) => t.exercito_id === exercitoId) : [];
  const numTribosAtual = tribosDoExercito.length;
  const metaCreditoPorTribo = numTribosAtual > 0 ? metaCreditoPorExercito / numTribosAtual : 0;
  const metaFunilTribo = calcularFunilMeta(metaCreditoPorTribo, metaTicket, taxaMap);
  const triboAtual = triboId ? tribosDoExercito.find((t) => t.id === triboId) : null;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Visão Geral da Firma</h1>
          <p className="kicker mt-1">Império · todos os Exércitos</p>
        </div>
        <div className="flex gap-2">
          <AbaLink href="/geral?visao=completo" ativo={visao === "completo"}>
            Completo
          </AbaLink>
          <AbaLink href="/geral?visao=exercito" ativo={visao === "exercito"}>
            Por Exército
          </AbaLink>
        </div>
      </div>

      {metaCredito <= 0 && (
        <p className="text-xs text-gold-dim">
          Cadastre a meta de crédito, ticket médio e taxas de conversão em &quot;Metas Mensais&quot; pra
          ver a meta calculada por etapa.
        </p>
      )}

      {visao === "completo" && (
        <>
          <Card title="Funil consolidado do mês — Império" right={<span className="text-gold-bright">{moeda(pagoGeral)}</span>}>
            <FunilDuplo realizado={totalGeral} meta={metaFunilGeral} />
          </Card>
          <div className="rounded border border-wine/50 bg-wine/10 p-4">
            <Diagnostico realizado={totalGeral} taxas={taxaMap} />
          </div>
        </>
      )}

      {visao === "exercito" && !exercitoAtual && (
        <div className="grid gap-4 sm:grid-cols-2">
          {(exercitos ?? []).map((e) => {
            const legado = e.legado as unknown as { full_name: string } | null;
            return (
              <a
                key={e.id}
                href={`/geral?visao=exercito&exercito=${e.id}`}
                className="card-imp block p-4 transition hover:border-gold"
              >
                <p className="font-display text-lg text-gold-bright">{e.nome}</p>
                <p className="text-xs text-stone-500">Legado: {legado?.full_name ?? "—"}</p>
                <p className="mt-2 text-gold">{moeda(pagosPorExercito.get(e.id) ?? 0)}</p>
              </a>
            );
          })}
        </div>
      )}

      {visao === "exercito" && exercitoAtual && !triboAtual && (
        <>
          <a href="/geral?visao=exercito" className="text-xs text-stone-500 hover:text-gold">
            ← Voltar aos Exércitos
          </a>
          <Card
            title={`${exercitoAtual.nome} · Legado: ${(exercitoAtual.legado as unknown as { full_name: string } | null)?.full_name ?? "—"}`}
            right={<span className="text-gold-bright">{moeda(pagosPorExercito.get(exercitoAtual.id) ?? 0)}</span>}
          >
            <FunilDuplo realizado={totalPorExercito.get(exercitoAtual.id) ?? totaisVazios()} meta={metaFunilExercito} />
          </Card>
          <div className="rounded border border-wine/50 bg-wine/10 p-4">
            <Diagnostico realizado={totalPorExercito.get(exercitoAtual.id) ?? totaisVazios()} taxas={taxaMap} />
          </div>

          {tribosDoExercito.length > 0 && (
            <div>
              <p className="kicker mb-3">Tribos de {exercitoAtual.nome}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {tribosDoExercito.map((t) => (
                  <a
                    key={t.id}
                    href={`/geral?visao=exercito&exercito=${exercitoAtual.id}&tribo=${t.id}`}
                    className="card-imp block p-4 transition hover:border-gold"
                  >
                    <p className="font-display text-base text-gold-bright">{t.nome}</p>
                    <p className="mt-1 text-gold">{moeda(pagosPorTribo.get(t.id) ?? 0)}</p>
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {visao === "exercito" && exercitoAtual && triboAtual && (
        <>
          <a
            href={`/geral?visao=exercito&exercito=${exercitoAtual.id}`}
            className="text-xs text-stone-500 hover:text-gold"
          >
            ← Voltar a {exercitoAtual.nome}
          </a>
          <Card
            title={triboAtual.nome}
            right={<span className="text-gold-bright">{moeda(pagosPorTribo.get(triboAtual.id) ?? 0)}</span>}
          >
            <FunilDuplo realizado={totalPorTribo.get(triboAtual.id) ?? totaisVazios()} meta={metaFunilTribo} />
          </Card>
          <div className="rounded border border-wine/50 bg-wine/10 p-4">
            <Diagnostico realizado={totalPorTribo.get(triboAtual.id) ?? totaisVazios()} taxas={taxaMap} />
          </div>
        </>
      )}
    </main>
  );
}
