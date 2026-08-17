import { createClient } from "@/lib/supabase/server";
import { FUNNEL_STAGES, FUNNEL_LABELS, periodoParaDatas, type FunilEtapa } from "@/lib/funil";
import SimuladorMeta from "./simulador";

type Periodo = "hoje" | "semana" | "mes";

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

  // Mês inteiro sempre, independente do filtro de período — o simulador é sobre a meta do mês
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

  const ticketMedio =
    vendasPeriodo && vendasPeriodo.length > 0
      ? vendasPeriodo.reduce((s, v) => s + Number(v.valor), 0) / vendasPeriodo.length
      : null;

  return (
    <>
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <div>
          <h1 className="font-serif text-xl text-amber-400">Minha Produção</h1>
          <p className="text-xs text-stone-400">Funil, conversão e simulador de meta</p>
        </div>
        <div className="flex gap-2">
          {(["hoje", "semana", "mes"] as Periodo[]).map((p) => (
            <a
              key={p}
              href={`/producao?periodo=${p}`}
              className={`rounded px-3 py-1.5 text-xs ${
                periodo === p
                  ? "bg-amber-500 text-[#0b0f19]"
                  : "border border-stone-700 text-stone-300 hover:border-amber-500"
              }`}
            >
              {p === "hoje" ? "Hoje" : p === "semana" ? "Semana" : "Mês"}
            </a>
          ))}
        </div>

        <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-stone-400">
            Funil — realizado x meta
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="pb-2">Etapa</th>
                <th className="pb-2 text-right">Realizado</th>
                <th className="pb-2 text-right">Meta</th>
                <th className="pb-2 text-right">Conversão</th>
              </tr>
            </thead>
            <tbody>
              {FUNNEL_STAGES.map((etapa, i) => {
                const anterior = i > 0 ? totais[FUNNEL_STAGES[i - 1]].realizado : null;
                const conversao =
                  anterior && anterior > 0
                    ? ((totais[etapa].realizado / anterior) * 100).toFixed(0) + "%"
                    : "—";
                return (
                  <tr key={etapa} className="border-t border-stone-800">
                    <td className="py-2 text-stone-300">{FUNNEL_LABELS[etapa]}</td>
                    <td className="py-2 text-right text-stone-100">
                      {totais[etapa].realizado}
                    </td>
                    <td className="py-2 text-right text-stone-500">{totais[etapa].meta}</td>
                    <td className="py-2 text-right text-stone-400">{conversao}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-stone-400">
            Ticket médio
          </h2>
          <p className="text-2xl text-amber-400">
            {ticketMedio !== null
              ? ticketMedio.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
              : "—"}
          </p>
        </section>

        <SimuladorMeta totais={totaisMes} />

        <p className="text-center text-xs text-stone-600">
          Trend de 3–6 meses e diagnóstico de gargalo entram numa próxima etapa,
          junto com a integração da planilha.
        </p>
      </main>
    </>
  );
}
