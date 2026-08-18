import { createClient } from "@/lib/supabase/server";
import { FUNNEL_STAGES, FUNNEL_LABELS, periodoParaDatas, type FunilEtapa } from "@/lib/funil";
import { buscarMetaIndividual, calcularFunilMeta } from "@/lib/metas";
import { buscarFunilColetivo } from "@/lib/time";
import { calcularGargalo, textoGargalo } from "@/lib/gargalo";
import SimuladorMeta from "./simulador";
import Card from "@/components/ui/Card";
import BarraProgresso from "@/components/ui/BarraProgresso";

type Periodo = "hoje" | "semana" | "mes";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default async function ProducaoPage({
  searchParams,
}: {
  searchParams: { periodo?: string };
}) {
  const periodo: Periodo =
    searchParams.periodo === "hoje" || searchParams.periodo === "semana"
      ? searchParams.periodo
      : "mes";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("tribo_id")
    .eq("id", user.id)
    .single();

  const { inicio, fim } = periodoParaDatas(periodo);

  const { data: linhas } = await supabase
    .from("producao_funil")
    .select("etapa, realizado, meta")
    .eq("profile_id", user.id)
    .gte("data", inicio)
    .lte("data", fim);

  const totais = Object.fromEntries(
    FUNNEL_STAGES.map((etapa) => [etapa, { realizado: 0, meta: 0 }])
  ) as Record<FunilEtapa, { realizado: number; meta: number }>;

  for (const linha of linhas ?? []) {
    const etapa = linha.etapa as FunilEtapa;
    totais[etapa].realizado += linha.realizado;
    totais[etapa].meta += linha.meta;
  }

  // Mês inteiro sempre, independente do filtro de período — meta/simulador/gargalo são sobre o mês
  const { inicio: inicioMes, fim: fimMes } = periodoParaDatas("mes");
  const { data: linhasMes } = await supabase
    .from("producao_funil")
    .select("etapa, realizado, meta")
    .eq("profile_id", user.id)
    .gte("data", inicioMes)
    .lte("data", fimMes);

  const totaisMes = Object.fromEntries(
    FUNNEL_STAGES.map((etapa) => [etapa, { realizado: 0, meta: 0 }])
  ) as Record<FunilEtapa, { realizado: number; meta: number }>;
  for (const linha of linhasMes ?? []) {
    const etapa = linha.etapa as FunilEtapa;
    totaisMes[etapa].realizado += linha.realizado;
    totaisMes[etapa].meta += linha.meta;
  }

  const { data: vendasPeriodo } = await supabase
    .from("vendas")
    .select("valor")
    .eq("profile_id", user.id)
    .gte("data", inicio)
    .lte("data", fim);

  const valorPago = (vendasPeriodo ?? []).reduce((s, v) => s + Number(v.valor), 0);
  const ticketMedio = vendasPeriodo && vendasPeriodo.length > 0 ? valorPago / vendasPeriodo.length : null;

  const { metaCreditoIndividual, metaTicketMedio, taxas } = await buscarMetaIndividual(supabase, user.id);
  const metaFunilIndividual = calcularFunilMeta(metaCreditoIndividual, metaTicketMedio, taxas);

  // meta de crédito prorateada pro período selecionado (mês inteiro = 100%)
  const hoje = new Date();
  const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const fatorPeriodo = periodo === "hoje" ? 1 / diasNoMes : periodo === "semana" ? 7 / diasNoMes : 1;
  const metaCreditoPeriodo = metaCreditoIndividual * fatorPeriodo;
  const pctMeta = metaCreditoPeriodo > 0 ? (valorPago / metaCreditoPeriodo) * 100 : null;

  // Diagnóstico de gargalo — sempre sobre o mês inteiro
  let realizadoTribo: Record<FunilEtapa, number> | undefined;
  if (profile?.tribo_id) {
    const { data: membros } = await supabase.from("profiles").select("id").eq("tribo_id", profile.tribo_id);
    const coletivo = await buscarFunilColetivo(supabase, (membros ?? []).map((m) => m.id));
    realizadoTribo = Object.fromEntries(
      FUNNEL_STAGES.map((e) => [e, coletivo[e].realizado])
    ) as Record<FunilEtapa, number>;
  }
  const realizadoMesSimples = Object.fromEntries(
    FUNNEL_STAGES.map((e) => [e, totaisMes[e].realizado])
  ) as Record<FunilEtapa, number>;
  const gargalo = calcularGargalo(realizadoMesSimples, taxas, realizadoTribo);

  // Melhor dia da semana pra prospecção — últimos 90 dias, tentativas → conexões
  const noventaDiasAtras = new Date();
  noventaDiasAtras.setDate(noventaDiasAtras.getDate() - 90);
  const { data: linhasProspeccao } = await supabase
    .from("producao_funil")
    .select("data, etapa, realizado")
    .eq("profile_id", user.id)
    .in("etapa", ["tentativas", "conexoes"])
    .gte("data", noventaDiasAtras.toISOString().slice(0, 10));

  const DIA_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const porDiaSemana = Array.from({ length: 7 }, () => ({ tentativas: 0, conexoes: 0 }));
  for (const row of linhasProspeccao ?? []) {
    const diaSemana = new Date(row.data + "T00:00:00").getDay();
    if (row.etapa === "tentativas") porDiaSemana[diaSemana].tentativas += row.realizado;
    else porDiaSemana[diaSemana].conexoes += row.realizado;
  }
  const ranqueDias = porDiaSemana
    .map((d, i) => ({ dia: DIA_LABEL[i], ...d, taxa: d.tentativas > 0 ? (d.conexoes / d.tentativas) * 100 : 0 }))
    .filter((d) => d.tentativas > 0)
    .sort((a, b) => b.taxa - a.taxa);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Minha Produção</h1>
          <p className="text-sm italic text-stone-500">O campo de batalha — realizado × meta</p>
        </div>
        <div className="flex gap-2">
          {(["hoje", "semana", "mes"] as Periodo[]).map((p) => (
            <a
              key={p}
              href={`/producao?periodo=${p}`}
              className={`rounded px-3 py-1.5 text-xs uppercase transition ${
                periodo === p
                  ? "bg-gold text-imperium-bg"
                  : "border border-imperium-line text-stone-300 hover:border-gold"
              }`}
            >
              {p === "hoje" ? "Hoje" : p === "semana" ? "Semana" : "Mês"}
            </a>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="kicker mb-2">Valor pago no período</p>
          <p className="font-display text-2xl text-gold-bright">{moeda(valorPago)}</p>
          {pctMeta !== null && (
            <p className="mt-1 text-xs text-emerald-400">
              {pctMeta.toFixed(0)}% da meta ({moeda(metaCreditoPeriodo)})
            </p>
          )}
        </Card>
        <Card>
          <p className="kicker mb-2">Ticket médio</p>
          <p className="font-display text-2xl text-gold-bright">
            {ticketMedio !== null ? moeda(ticketMedio) : "—"}
          </p>
        </Card>
        <Card>
          <p className="kicker mb-2">Pagos (qtd) no período</p>
          <p className="font-display text-2xl text-gold-bright">{totais.pagos.realizado}</p>
          {metaFunilIndividual.pagos && (
            <p className="mt-1 text-xs text-stone-500">
              meta {Math.round(metaFunilIndividual.pagos * fatorPeriodo)}
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card title="Volume">
          <div className="space-y-3">
            {FUNNEL_STAGES.map((etapa) => (
              <div key={etapa} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-stone-400">{FUNNEL_LABELS[etapa]}</span>
                <BarraProgresso realizado={totais[etapa].realizado} meta={totais[etapa].meta} />
                <span className="w-16 shrink-0 text-right text-stone-100">
                  {totais[etapa].realizado}/{totais[etapa].meta}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Taxa de conversão (%)">
          <div className="space-y-3">
            {FUNNEL_STAGES.map((etapa, i) => {
              const anterior = i > 0 ? totais[FUNNEL_STAGES[i - 1]].realizado : null;
              const pct = anterior && anterior > 0 ? (totais[etapa].realizado / anterior) * 100 : null;
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
        </Card>
      </div>

      {ranqueDias.length > 0 && (
        <Card title="Melhor dia pra prospectar" right={<span className="text-xs text-stone-500">Últimos 90 dias</span>}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ranqueDias.map((d, i) => (
              <div
                key={d.dia}
                className={`rounded border p-3 text-center ${
                  i === 0 ? "border-gold bg-gold/10" : "border-imperium-line"
                }`}
              >
                <p className={`text-xs ${i === 0 ? "text-gold-bright" : "text-stone-400"}`}>{d.dia}</p>
                <p className={`mt-1 font-display text-lg ${i === 0 ? "text-gold-bright" : "text-stone-200"}`}>
                  {d.taxa.toFixed(0)}%
                </p>
                <p className="text-[10px] text-stone-600">{d.conexoes}/{d.tentativas} conexões</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {gargalo && (
        <div className="rounded border border-wine/50 bg-wine/10 p-4">
          <p className="mb-1 flex items-center gap-2 text-sm font-medium text-wine-bright">
            ⚠ Diagnóstico de Gargalo
          </p>
          <p className="text-sm text-stone-300">{textoGargalo(gargalo)}</p>
          {gargalo.moduloTrilha && (
            <p className="mt-2 text-xs text-stone-400">
              📘 Módulo recomendado: <span className="text-gold">{gargalo.moduloTrilha}</span> —{" "}
              <a href="/trilha" className="text-gold hover:underline">
                abrir na Trilha →
              </a>
            </p>
          )}
        </div>
      )}

      <SimuladorMeta totais={totaisMes} />
    </main>
  );
}
