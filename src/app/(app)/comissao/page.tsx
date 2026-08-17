import { createClient } from "@/lib/supabase/server";
import SimuladorComissao from "./simulador";
import { abrirContestacao } from "./actions";

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<string, string> = { aberto: "Aberta", resolvido: "Resolvida" };

export default async function ComissaoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("rank")
    .eq("id", user.id)
    .single();

  const { data: tiers } = await supabase
    .from("commission_tiers")
    .select("producao_min, fixo, pct_variavel")
    .eq("rank", profile?.rank ?? "legionario")
    .order("ordem");

  const agora = new Date();
  const { data: historico } = await supabase
    .from("comissao_mensal")
    .select("ano, mes, producao_realizada, fixo, variavel, total")
    .eq("profile_id", user.id)
    .order("ano", { ascending: false })
    .order("mes", { ascending: false })
    .limit(6);

  const mesAtual = historico?.find(
    (h) => h.ano === agora.getFullYear() && h.mes === agora.getMonth() + 1
  );

  const inicioMes = agora.toISOString().slice(0, 7) + "-01";
  const { data: vendasMes } = await supabase
    .from("vendas")
    .select("id, data, valor, origem, multiplicador")
    .eq("profile_id", user.id)
    .gte("data", inicioMes)
    .order("data", { ascending: false });

  const { data: contestacoes } = await supabase
    .from("contestacoes")
    .select("id, referencia, valor_contestado, motivo, status, resposta, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-serif text-xl text-amber-400">Comissão do Mês</h1>
        <p className="text-xs text-stone-400">Visão privada — só você e o Diretor veem isso</p>
      </div>

      <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-stone-400">
          Mês atual
        </h2>
        {mesAtual ? (
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-stone-500">Produção</p>
              <p className="text-stone-100">{moeda(mesAtual.producao_realizada)}</p>
            </div>
            <div>
              <p className="text-stone-500">Fixo</p>
              <p className="text-stone-100">{moeda(mesAtual.fixo)}</p>
            </div>
            <div>
              <p className="text-stone-500">Variável</p>
              <p className="text-stone-100">{moeda(mesAtual.variavel)}</p>
            </div>
            <div>
              <p className="text-stone-500">Total</p>
              <p className="text-amber-400">{moeda(mesAtual.total)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-stone-500">
            Ainda sem cálculo fechado pra esse mês — vai aparecer aqui assim que a
            integração com a planilha estiver ligada.
          </p>
        )}

        {historico && historico.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-xs uppercase tracking-wide text-stone-500">
              Comparativo com meses anteriores
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-500">
                  <th className="pb-1">Mês</th>
                  <th className="pb-1 text-right">Produção</th>
                  <th className="pb-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={`${h.ano}-${h.mes}`} className="border-t border-stone-800">
                    <td className="py-1 text-stone-300">
                      {MESES[h.mes - 1]}/{h.ano}
                    </td>
                    <td className="py-1 text-right text-stone-400">
                      {moeda(h.producao_realizada)}
                    </td>
                    <td className="py-1 text-right text-stone-100">{moeda(h.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SimuladorComissao tiers={tiers ?? []} />

      <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-stone-400">
          Extrato do mês
        </h2>
        {vendasMes && vendasMes.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500">
                <th className="pb-1">Data</th>
                <th className="pb-1">Origem</th>
                <th className="pb-1 text-right">Valor</th>
                <th className="pb-1 text-right">Multiplicador</th>
              </tr>
            </thead>
            <tbody>
              {vendasMes.map((v) => (
                <tr key={v.id} className="border-t border-stone-800">
                  <td className="py-1 text-stone-300">
                    {new Date(v.data + "T00:00:00").toLocaleDateString("pt-BR")}
                  </td>
                  <td className="py-1 text-stone-400">{v.origem ?? "—"}</td>
                  <td className="py-1 text-right text-stone-100">{moeda(Number(v.valor))}</td>
                  <td className="py-1 text-right text-stone-400">×{v.multiplicador}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-stone-500">Nenhuma venda registrada neste mês ainda.</p>
        )}
      </section>

      <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-stone-400">
          Contestação
        </h2>

        <form action={abrirContestacao} className="mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-stone-400">Referência (opcional)</label>
              <input
                name="referencia"
                placeholder="Ex: Venda #4471"
                className="w-full rounded border border-stone-700 bg-[#0b0f19] px-3 py-2 text-stone-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-400">
                Valor contestado (opcional)
              </label>
              <input
                name="valor_contestado"
                type="number"
                step="0.01"
                className="w-full rounded border border-stone-700 bg-[#0b0f19] px-3 py-2 text-stone-100"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-400">Motivo</label>
            <textarea
              name="motivo"
              required
              rows={2}
              className="w-full rounded border border-stone-700 bg-[#0b0f19] px-3 py-2 text-stone-100"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-[#0b0f19] hover:bg-amber-400"
          >
            Abrir contestação
          </button>
        </form>

        {contestacoes && contestacoes.length > 0 && (
          <ul className="space-y-2">
            {contestacoes.map((c) => (
              <li key={c.id} className="border-t border-stone-800 pt-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-stone-300">{c.referencia ?? "Sem referência"}</span>
                  <span
                    className={c.status === "aberto" ? "text-amber-400" : "text-emerald-400"}
                  >
                    {STATUS_LABELS[c.status]}
                  </span>
                </div>
                <p className="text-xs text-stone-500">{c.motivo}</p>
                {c.resposta && (
                  <p className="mt-1 text-xs text-stone-400">Resposta: {c.resposta}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
