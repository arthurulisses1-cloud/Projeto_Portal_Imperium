import { createClient } from "@/lib/supabase/server";
import { TRANSICOES, MESES_LABEL, mapaMetaCreditoPorTribo, buscarOverridesIndividuais, dividirMetaTriboComOverrides } from "@/lib/metas";
import { salvarMeta, salvarMetaIndividual } from "./actions";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { hojeBR } from "@/lib/data-br";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function MetasPage({
  searchParams,
}: {
  searchParams: { ano?: string; mes?: string };
}) {
  const [anoHoje, mesHoje] = hojeBR().split("-").map(Number);
  const ano = Number(searchParams.ano) || anoHoje;
  const mes = Number(searchParams.mes) || mesHoje;

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
  const { data: pessoasRaw } = await supabase
    .from("profiles")
    .select("id, full_name, tribo_id")
    .in("role", ["sdr", "closer"])
    .eq("ativo", true)
    .order("full_name");

  const metaCredito = meta?.meta_credito_total ?? 0;
  // Mesma fonte que buscarMetaIndividual/buscarMetaTribo já usam em
  // qualquer outra tela (já trata Inbound como metade de uma Tribo lógica)
  // — achado 2026-09-11: essa página tinha sua PRÓPRIA divisão (÷Exércitos
  // ÷Tribos do Exército), ignorando a regra do Inbound e o próprio corte de
  // "Tribo lógica" que mapaMetaCreditoPorTribo já aplica em todo lugar.
  const mapaMetaPorTribo = metaCredito > 0 ? await mapaMetaCreditoPorTribo(supabase, metaCredito) : new Map<string, number>();

  const pessoasPorTribo = new Map<string, { id: string; nome: string }[]>();
  for (const p of pessoasRaw ?? []) {
    if (!p.tribo_id) continue;
    if (!pessoasPorTribo.has(p.tribo_id)) pessoasPorTribo.set(p.tribo_id, []);
    pessoasPorTribo.get(p.tribo_id)!.push({ id: p.id, nome: p.full_name });
  }

  const overrides = await buscarOverridesIndividuais(supabase, ano, mes);
  const metaPorPessoaPorTribo = new Map<string, Map<string, number>>();
  for (const [triboId, membros] of Array.from(pessoasPorTribo)) {
    const metaTribo = mapaMetaPorTribo.get(triboId) ?? 0;
    metaPorPessoaPorTribo.set(
      triboId,
      dividirMetaTriboComOverrides(
        metaTribo,
        membros.map((m) => m.id),
        overrides
      )
    );
  }

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
        <h2 className="kicker mb-4">Divisão — Exército → Tribo → Pessoa</h2>
        <p className="mb-4 text-xs text-stone-500">
          Por padrão a meta da Tribo é dividida igualmente entre os membros. Pra dar uma meta diferente pra alguém
          específico, edita o campo dela e salva — o resto da Tribo automaticamente divide igualmente o que sobrou.
          Deixa o campo em branco e salva de novo pra voltar a dividir igual.
        </p>
        {metaCredito <= 0 ? (
          <p className="text-sm text-stone-500">Cadastra a meta de crédito acima pra ver a divisão.</p>
        ) : (
          <div className="space-y-5">
            {(exercitos ?? []).map((ex) => {
              const tribosDoExercito = (tribos ?? []).filter((t) => t.exercito_id === ex.id);
              const metaExercito = tribosDoExercito.reduce((s, t) => s + (mapaMetaPorTribo.get(t.id) ?? 0), 0);
              return (
                <div key={ex.id} className="border-t border-imperium-line pt-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-100">{ex.nome}</span>
                    <span className="text-gold-bright">{moeda(metaExercito)}</span>
                  </div>
                  <div className="mt-2 space-y-3 pl-4">
                    {tribosDoExercito.map((t) => {
                      const metaTribo = mapaMetaPorTribo.get(t.id) ?? 0;
                      const membros = pessoasPorTribo.get(t.id) ?? [];
                      const metaPorPessoa = metaPorPessoaPorTribo.get(t.id) ?? new Map<string, number>();
                      return (
                        <div key={t.id}>
                          <div className="flex justify-between text-xs">
                            <span className="text-stone-400">{t.nome}</span>
                            <span className="text-stone-300">{moeda(metaTribo)}</span>
                          </div>
                          <ul className="mt-1.5 space-y-1 pl-3">
                            {membros.map((m) => {
                              const temOverride = overrides.has(m.id);
                              return (
                                <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
                                  <span className={temOverride ? "text-gold" : "text-stone-500"}>
                                    {m.nome}
                                    {temOverride && <span className="ml-1 text-[9px] uppercase text-gold-dim">editado</span>}
                                  </span>
                                  <form action={salvarMetaIndividual} className="flex items-center gap-1.5">
                                    <input type="hidden" name="ano" value={ano} />
                                    <input type="hidden" name="mes" value={mes} />
                                    <input type="hidden" name="profile_id" value={m.id} />
                                    <span className="text-stone-600">R$</span>
                                    <input
                                      type="number"
                                      name="meta_credito"
                                      step="0.01"
                                      placeholder={String(Math.round(metaPorPessoa.get(m.id) ?? 0))}
                                      defaultValue={temOverride ? overrides.get(m.id) : undefined}
                                      className="input-imp w-28 px-2 py-1 text-xs"
                                    />
                                    <button type="submit" className="btn-outline px-2 py-1 text-[10px]">
                                      Salvar
                                    </button>
                                  </form>
                                </li>
                              );
                            })}
                            {membros.length === 0 && <li className="text-[11px] text-stone-600">Sem membros nessa Tribo.</li>}
                          </ul>
                        </div>
                      );
                    })}
                    {tribosDoExercito.length === 0 && (
                      <p className="text-xs text-stone-600">Nenhuma Tribo cadastrada ainda.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {evolucao.length > 0 && (
        <section className="card-imp">
          <h2 className="kicker mb-4">Evolução mês a mês</h2>
          <Table>
            <thead>
              <tr>
                <Th>Mês</Th>
                <Th align="right">Meta</Th>
                <Th align="right">Realizado</Th>
                <Th align="right">%</Th>
              </tr>
            </thead>
            <tbody>
              {evolucao.map((e) => (
                <Tr key={e.label}>
                  <Td className="text-stone-300">{e.label}</Td>
                  <Td align="right" className="text-stone-500">{moeda(e.meta)}</Td>
                  <Td align="right" className="text-stone-100">{moeda(e.realizado)}</Td>
                  <Td
                    align="right"
                    className={e.pct !== null && e.pct >= 100 ? "text-success-bright" : "text-gold-dim"}
                  >
                    {e.pct !== null ? `${e.pct.toFixed(0)}%` : "—"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}
    </main>
  );
}
