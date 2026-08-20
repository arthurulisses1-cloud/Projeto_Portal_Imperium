import { createClient } from "@/lib/supabase/server";
import { FUNNEL_STAGES, FUNNEL_LABELS, periodoParaDatas, type FunilEtapa } from "@/lib/funil";
import { buscarMetaIndividual, calcularFunilMeta } from "@/lib/metas";
import { buscarFunilColetivo } from "@/lib/time";
import { calcularGargalo } from "@/lib/gargalo";
import { gerarParecer } from "@/lib/oraculo";
import SimuladorMeta from "./simulador";
import Card from "@/components/ui/Card";
import BarraProgresso from "@/components/ui/BarraProgresso";
import { getViewerContext } from "@/lib/preview";
import { IconAlert, IconCheck, IconBook } from "@/components/ui/icons";

type Periodo = "hoje" | "semana" | "mes";
type Visao = "total" | "individual" | "tribo";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default async function ProducaoPage({
  searchParams,
}: {
  searchParams: { periodo?: string; visao?: string };
}) {
  const periodo: Periodo =
    searchParams.periodo === "hoje" || searchParams.periodo === "semana"
      ? searchParams.periodo
      : "mes";

  const supabase = await createClient();
  const viewer = await getViewerContext(supabase);
  if (!viewer) return null;
  const meId = viewer.effectiveId;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, tribo_id")
    .eq("id", meId)
    .single();

  const ehCloser = profile?.role === "closer";
  const visao: Visao =
    ehCloser && (searchParams.visao === "individual" || searchParams.visao === "tribo")
      ? searchParams.visao
      : "total";

  // Closer só se importa do funil a partir de Entrevistas — tentativas/alôs/
  // conexões são atividade de SDR e não aparecem pra ele.
  const etapasVisiveis: readonly FunilEtapa[] = ehCloser
    ? FUNNEL_STAGES.filter((e) => e !== "tentativas" && e !== "alos" && e !== "conexoes")
    : FUNNEL_STAGES;

  // "Produção via tribo" agrega todo mundo da própria Tribo (é o time que o
  // closer lidera); "individual" isola só o que ele fechou sozinho (papel
  // "ambos" — sem SDR envolvido); "total" é a produção dele com qualquer papel.
  let idsProducao = [meId];
  let papelFiltro: string | null = null;
  if (visao === "individual") papelFiltro = "ambos";
  if (visao === "tribo" && profile?.tribo_id) {
    const { data: membrosTribo } = await supabase
      .from("profiles")
      .select("id")
      .eq("tribo_id", profile.tribo_id)
      .in("role", ["sdr", "closer"]);
    idsProducao = (membrosTribo ?? []).map((m) => m.id);
    if (idsProducao.length === 0) idsProducao = [meId];
  }

  const { inicio, fim } = periodoParaDatas(periodo);

  let queryLinhas = supabase
    .from("producao_funil")
    .select("etapa, realizado, meta")
    .in("profile_id", idsProducao)
    .gte("data", inicio)
    .lte("data", fim);
  if (papelFiltro) queryLinhas = queryLinhas.eq("papel", papelFiltro);
  const { data: linhas } = await queryLinhas;

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
    .eq("profile_id", meId)
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

  let queryVendas = supabase
    .from("vendas")
    .select("valor")
    .in("profile_id", idsProducao)
    .gte("data", inicio)
    .lte("data", fim);
  if (papelFiltro) queryVendas = queryVendas.eq("papel", papelFiltro);
  const { data: vendasPeriodo } = await queryVendas;

  const valorPago = (vendasPeriodo ?? []).reduce((s, v) => s + Number(v.valor), 0);
  const ticketMedio = vendasPeriodo && vendasPeriodo.length > 0 ? valorPago / vendasPeriodo.length : null;

  // Sinaliza quando o closer fechou pra alguém fora da própria Tribo — esse
  // crédito já está contado no total da Tribo (ele é membro dela), isso é só
  // um aviso de transparência, não muda a soma.
  let fechosForaDaTribo: { qtd: number; valor: number } | null = null;
  if (visao === "tribo" && profile?.tribo_id) {
    const { data: opsFechadas } = await supabase
      .from("weekly_operacoes")
      .select("sdr_profile_id, valor, status")
      .eq("closer_profile_id", meId)
      .gte("data", inicio)
      .lte("data", fim);
    const idsFora = (opsFechadas ?? [])
      .filter((o) => o.sdr_profile_id)
      .map((o) => o.sdr_profile_id as string);
    if (idsFora.length > 0) {
      const { data: sdrsEnvolvidos } = await supabase.from("profiles").select("id, tribo_id").in("id", idsFora);
      const triboPorSdr = new Map((sdrsEnvolvidos ?? []).map((s) => [s.id, s.tribo_id]));
      const fora = (opsFechadas ?? []).filter(
        (o) => o.sdr_profile_id && triboPorSdr.get(o.sdr_profile_id) !== profile.tribo_id && o.status === "PAGO"
      );
      if (fora.length > 0) {
        fechosForaDaTribo = { qtd: fora.length, valor: fora.reduce((s, o) => s + Number(o.valor), 0) };
      }
    }
  }

  const { metaCreditoIndividual, metaTicketMedio, taxas } = await buscarMetaIndividual(supabase, meId);
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
    .eq("profile_id", meId)
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
        <div className="flex flex-wrap justify-end gap-2">
          {(["hoje", "semana", "mes"] as Periodo[]).map((p) => (
            <a
              key={p}
              href={`/producao?periodo=${p}&visao=${visao}`}
              className={`rounded px-3 py-1.5 text-xs uppercase transition ${
                periodo === p
                  ? "bg-gold text-imperium-bg"
                  : "border border-imperium-line text-stone-300 hover:border-gold"
              }`}
            >
              {p === "hoje" ? "Hoje" : p === "semana" ? "Semana" : "Mês"}
            </a>
          ))}
          {ehCloser && (
            <>
              <span className="mx-1 self-center text-stone-700">·</span>
              {(["total", "individual", "tribo"] as Visao[]).map((v) => (
                <a
                  key={v}
                  href={`/producao?periodo=${periodo}&visao=${v}`}
                  className={`rounded px-3 py-1.5 text-xs uppercase transition ${
                    visao === v
                      ? "bg-gold text-imperium-bg"
                      : "border border-imperium-line text-stone-300 hover:border-gold"
                  }`}
                >
                  {v === "total" ? "Produção total" : v === "individual" ? "Produção individual" : "Produção via tribo"}
                </a>
              ))}
            </>
          )}
        </div>
      </div>

      {fechosForaDaTribo && (
        <div className="flex items-start gap-2 rounded border border-gold/40 bg-gold/10 px-4 py-2.5 text-xs text-gold-dim">
          <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Inclui {fechosForaDaTribo.qtd} fechamento(s) seu(s) fora da própria Tribo neste período (
            {moeda(fechosForaDaTribo.valor)}) — já contado no total da Tribo, mas não é pipeline orgânico dela.
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="kicker mb-2">Valor pago no período</p>
          <p className="font-display text-2xl text-gold-bright">{moeda(valorPago)}</p>
          {pctMeta !== null && (
            <p className="mt-1 text-xs text-success-bright">
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
            {etapasVisiveis.map((etapa) => {
              // producao_funil.meta vem sempre 0 do sync (nunca foi
              // populado) — a meta de verdade é a derivada de
              // metaFunilIndividual (crédito ÷ ticket médio ÷ taxas
              // esperadas), prorateada pro período selecionado.
              const metaBruta = metaFunilIndividual[etapa];
              const meta = metaBruta !== null ? Math.round(metaBruta * fatorPeriodo) : null;
              return (
                <div key={etapa} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-stone-400">{FUNNEL_LABELS[etapa]}</span>
                  <BarraProgresso realizado={totais[etapa].realizado} meta={meta ?? 0} />
                  <span className="w-20 shrink-0 text-right text-stone-100">
                    {totais[etapa].realizado}/{meta ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Taxa de conversão (%)">
          <div className="space-y-3">
            {etapasVisiveis.map((etapa, i) => {
              const anterior = i > 0 ? totais[etapasVisiveis[i - 1]].realizado : null;
              const pct = anterior && anterior > 0 ? (totais[etapa].realizado / anterior) * 100 : null;
              const taxaEsperada = i > 0 ? taxas.get(`${etapasVisiveis[i - 1]}_${etapa}`) : null;
              return (
                <div key={etapa} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-stone-400">{FUNNEL_LABELS[etapa]}</span>
                  <BarraProgresso realizado={pct ?? 0} meta={taxaEsperada ? taxaEsperada * 100 : 100} />
                  <span className="w-24 shrink-0 text-right text-stone-100">
                    {pct !== null ? `${pct.toFixed(0)}%` : "—"}
                    {taxaEsperada != null && (
                      <span className="ml-1 text-[10px] text-stone-500">/ {(taxaEsperada * 100).toFixed(0)}%</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {!ehCloser && ranqueDias.length > 0 && (
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

      <Card title="Parecer do Oráculo">
        <ul className="space-y-2.5">
          {gerarParecer({ gargalo, ticketMedio, metaTicketMedio, pctMeta }).map(
            (item, i) => (
              <li
                key={i}
                className={`flex items-start gap-2 text-sm ${
                  item.tom === "alerta"
                    ? "text-wine-bright"
                    : item.tom === "elogio"
                      ? "text-success-bright"
                      : "text-stone-300"
                }`}
              >
                <span className="mt-0.5 shrink-0">
                  {item.tom === "alerta" ? (
                    <IconAlert className="h-4 w-4" />
                  ) : item.tom === "elogio" ? (
                    <IconCheck className="h-4 w-4" />
                  ) : (
                    <IconBook className="h-4 w-4" />
                  )}
                </span>
                <span>
                  {item.texto}
                  {item.texto.includes("Trilha de Formação") && (
                    <>
                      {" "}
                      <a href="/trilha" className="text-gold hover:underline">
                        abrir na Trilha →
                      </a>
                    </>
                  )}
                </span>
              </li>
            )
          )}
        </ul>
      </Card>

      <SimuladorMeta totais={totaisMes} />
    </main>
  );
}
