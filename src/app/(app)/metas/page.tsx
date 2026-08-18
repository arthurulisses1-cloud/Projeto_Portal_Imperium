import { createClient } from "@/lib/supabase/server";
import { TRANSICOES, MESES_LABEL } from "@/lib/metas";
import { salvarMeta } from "./actions";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function MetasPage({
  searchParams,
}: {
  searchParams: { ano?: string; mes?: string };
}) {
  const hoje = new Date();
  const ano = Number(searchParams.ano) || hoje.getFullYear();
  const mes = Number(searchParams.mes) || hoje.getMonth() + 1;

  const supabase = await createClient();

  const { data: meta } = await supabase
    .from("metas_mensais")
    .select("id, meta_credito_total, meta_ticket_medio")
    .eq("ano", ano)
    .eq("mes", mes)
    .maybeSingle();

  const { data: conversoes } = meta
    ? await supabase
        .from("metas_conversao")
        .select("etapa_de, etapa_para, taxa_esperada")
        .eq("meta_mensal_id", meta.id)
    : { data: [] };

  const taxaMap = new Map(
    (conversoes ?? []).map((c) => [`${c.etapa_de}_${c.etapa_para}`, c.taxa_esperada * 100])
  );

  const { data: exercitos } = await supabase.from("exercitos").select("id, nome");
  const { data: tribos } = await supabase.from("tribos").select("id, nome, exercito_id");

  const metaCredito = meta?.meta_credito_total ?? 0;
  const numExercitos = exercitos?.length ?? 0;
  const metaPorExercito = numExercitos > 0 ? metaCredito / numExercitos : 0;

  // ---------- Evolução mês a mês (últimos 6 meses com meta cadastrada) ----------
  const { data: historicoMetas } = await supabase
    .from("metas_mensais")
    .select("ano, mes, meta_credito_total")
    .order("ano", { ascending: false })
    .order("mes", { ascending: false })
    .limit(6);

  const historicoOrdenado = [...(historicoMetas ?? [])].reverse();
  const inicioHistorico = historicoOrdenado.length
    ? `${historicoOrdenado[0].ano}-${String(historicoOrdenado[0].mes).padStart(2, "0")}-01`
    : null;
  const { data: vendasHistorico } = inicioHistorico
    ? await supabase.from("vendas").select("valor, data").gte("data", inicioHistorico)
    : { data: [] };
  const pagoPorMes = new Map<string, number>();
  for (const v of vendasHistorico ?? []) {
    const chave = v.data.slice(0, 7);
    pagoPorMes.set(chave, (pagoPorMes.get(chave) ?? 0) + Number(v.valor));
  }
  const evolucao = historicoOrdenado.map((h) => {
    const chave = `${h.ano}-${String(h.mes).padStart(2, "0")}`;
    const realizado = pagoPorMes.get(chave) ?? 0;
    return {
      label: `${MESES_LABEL[h.mes - 1].slice(0, 3)}/${h.ano}`,
      meta: h.meta_credito_total,
      realizado,
      pct: h.meta_credito_total > 0 ? (realizado / h.meta_credito_total) * 100 : null,
    };
  });

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Metas Mensais</h1>
        <p className="mt-1 text-xs text-stone-400">
          Meta de crédito, ticket médio e taxas de conversão esperadas
        </p>
      </div>

      <div className="flex gap-3">
        <form method="get" className="flex items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-stone-400">Mês</label>
            <select name="mes" defaultValue={mes} className="input-imp text-sm">
              {MESES_LABEL.map((label, i) => (
                <option key={i} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-400">Ano</label>
            <input type="number" name="ano" defaultValue={ano} className="input-imp w-24 text-sm" />
          </div>
          <button type="submit" className="btn-outline">
            Ver
          </button>
        </form>
      </div>

      <section className="card-imp">
        <h2 className="kicker mb-4">
          {MESES_LABEL[mes - 1]}/{ano}
        </h2>
        <form action={salvarMeta} className="space-y-5">
          <input type="hidden" name="ano" value={ano} />
          <input type="hidden" name="mes" value={mes} />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-stone-400">Meta de Crédito total (R$)</label>
              <input
                type="number"
                name="meta_credito_total"
                step="0.01"
                defaultValue={meta?.meta_credito_total ?? 0}
                className="input-imp"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-400">Meta de Ticket Médio (R$)</label>
              <input
                type="number"
                name="meta_ticket_medio"
                step="0.01"
                defaultValue={meta?.meta_ticket_medio ?? 0}
                className="input-imp"
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-stone-500">
              Taxas de conversão esperadas
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {TRANSICOES.map((t) => {
                const key = `${t.de}_${t.para}`;
                return (
                  <div key={key}>
                    <label className="mb-1 block text-xs text-stone-400">{t.label}</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.1"
                        name={`taxa_${key}`}
                        defaultValue={taxaMap.get(key) ?? ""}
                        className="w-full rounded border border-stone-700 bg-[#0b0f19] px-3 py-2 text-stone-100"
                      />
                      <span className="text-xs text-stone-500">%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button type="submit" className="btn-gold">
            Salvar meta do mês
          </button>
        </form>
      </section>

      <section className="card-imp">
        <h2 className="kicker mb-4">Divisão automática — Exército → Tribo</h2>
        {metaCredito <= 0 ? (
          <p className="text-sm text-stone-500">Cadastra a meta de crédito acima pra ver a divisão.</p>
        ) : (
          <div className="space-y-4">
            {(exercitos ?? []).map((ex) => {
              const tribosDoExercito = (tribos ?? []).filter((t) => t.exercito_id === ex.id);
              const metaPorTribo =
                tribosDoExercito.length > 0 ? metaPorExercito / tribosDoExercito.length : 0;
              return (
                <div key={ex.id} className="border-t border-imperium-line pt-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-100">{ex.nome}</span>
                    <span className="text-gold-bright">{moeda(metaPorExercito)}</span>
                  </div>
                  <ul className="mt-2 space-y-1 pl-4">
                    {tribosDoExercito.map((t) => (
                      <li key={t.id} className="flex justify-between text-xs">
                        <span className="text-stone-400">{t.nome}</span>
                        <span className="text-stone-300">{moeda(metaPorTribo)}</span>
                      </li>
                    ))}
                    {tribosDoExercito.length === 0 && (
                      <li className="text-xs text-stone-600">Nenhuma Tribo cadastrada ainda.</li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {evolucao.length > 0 && (
        <section className="card-imp">
          <h2 className="kicker mb-4">Evolução mês a mês</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
                <th className="pb-2">Mês</th>
                <th className="pb-2 text-right">Meta</th>
                <th className="pb-2 text-right">Realizado</th>
                <th className="pb-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {evolucao.map((e) => (
                <tr key={e.label} className="border-t border-imperium-line">
                  <td className="py-2 text-stone-300">{e.label}</td>
                  <td className="py-2 text-right text-stone-500">{moeda(e.meta)}</td>
                  <td className="py-2 text-right text-stone-100">{moeda(e.realizado)}</td>
                  <td
                    className={`py-2 text-right ${
                      e.pct !== null && e.pct >= 100 ? "text-emerald-400" : "text-gold-dim"
                    }`}
                  >
                    {e.pct !== null ? `${e.pct.toFixed(0)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
