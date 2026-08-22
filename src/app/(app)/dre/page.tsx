import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buscarFolha,
  buscarResumoDre,
  buscarConfigDre,
  buscarDespesasExtras,
  buscarProducaoParceiro,
  buscarReceitasExtras,
} from "@/lib/dre";
import {
  salvarConfigDre,
  salvarProducaoParceiro,
  adicionarDespesaExtra,
  excluirDespesaExtra,
  adicionarReceitaExtra,
  excluirReceitaExtra,
} from "./actions";
import Card from "@/components/ui/Card";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import SimuladorDre from "@/components/dre/SimuladorDre";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

export default async function DrePage({ searchParams }: { searchParams: { ano?: string; mes?: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  // Rota estritamente Diretor-only — qualquer outro papel volta pro Mural
  // sem explicação nenhuma na tela (a RLS das tabelas dre_* também barra,
  // isso aqui é só pra nem chegar a montar a página).
  if (profile?.role !== "diretor") redirect("/");

  const hoje = new Date();
  const ano = Number(searchParams.ano) || hoje.getFullYear();
  const mes = Number(searchParams.mes) || hoje.getMonth() + 1;

  const [{ linhas, totais }, resumo, config, despesas, receitasExtras, producaoParceiroAtual] = await Promise.all([
    buscarFolha(supabase, ano, mes),
    buscarResumoDre(supabase, ano, mes),
    buscarConfigDre(supabase),
    buscarDespesasExtras(supabase, ano, mes),
    buscarReceitasExtras(supabase, ano, mes),
    buscarProducaoParceiro(supabase, ano, mes),
  ]);

  const mesAnterior = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  const mesSeguinte = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">DRE & Folha de Pagamento</h1>
          <p className="text-xs text-stone-500">Visão privada — só o Diretor acessa. Nunca é lida pela Minerva.</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/dre?ano=${mesAnterior.ano}&mes=${mesAnterior.mes}`} className="btn-outline px-2.5 py-1.5 text-xs">
            ← {MESES[mesAnterior.mes - 1].slice(0, 3)}
          </a>
          <span className="font-display text-sm text-stone-200">
            {MESES[mes - 1]}/{ano}
          </span>
          <a href={`/dre?ano=${mesSeguinte.ano}&mes=${mesSeguinte.mes}`} className="btn-outline px-2.5 py-1.5 text-xs">
            {MESES[mesSeguinte.mes - 1].slice(0, 3)} →
          </a>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="Receita">
          <p className="font-display text-2xl text-gold-bright">{moeda(resumo.receitaBruta)}</p>
          <p className="mt-1 text-[11px] text-stone-600">
            {moeda(resumo.receitaPropria)} crédito + {moeda(resumo.receitaParceiro)} parceiro
            {resumo.outrasReceitas > 0 && <> + {moeda(resumo.outrasReceitas)} outras</>}
          </p>
        </Card>
        <Card title="Despesas">
          <p className="font-display text-2xl text-wine-bright">
            {moeda(resumo.imposto + resumo.despesasOperacionais)}
          </p>
          <p className="mt-1 text-[11px] text-stone-600">
            Folha {moeda(resumo.folhaTotal)} · Imposto {moeda(resumo.imposto)} · Fixos{" "}
            {moeda(resumo.custoAluguel + resumo.custoTrafego)}
            {resumo.despesasExtrasGerais > 0 && <> · Extras {moeda(resumo.despesasExtrasGerais)}</>}
          </p>
        </Card>
        <Card title="Lucro">
          <p className={`font-display text-2xl ${resumo.lucro >= 0 ? "text-success-bright" : "text-wine-bright"}`}>
            {moeda(resumo.lucro)}
          </p>
          <p className="mt-1 text-[11px] text-stone-600">
            Margem: {resumo.receitaBruta > 0 ? ((resumo.lucro / resumo.receitaBruta) * 100).toFixed(0) : 0}%
          </p>
        </Card>
      </div>

      <Card title="Estrutura da DRE">
        <div className="space-y-1 text-sm">
          <p className="text-[10px] uppercase tracking-wide text-gold">Receita Bruta</p>
          <div className="flex justify-between pl-3 text-stone-400">
            <span>Crédito próprio ({(config.pctReceitaCredito * 100).toFixed(0)}% de {moeda(resumo.creditoTotalMes)})</span>
            <span className="text-stone-200">{moeda(resumo.receitaPropria)}</span>
          </div>
          <div className="flex justify-between pl-3 text-stone-400">
            <span>Produção parceiro ({(config.pctReceitaParceiro * 100).toFixed(0)}% de {moeda(resumo.producaoParceiro)})</span>
            <span className="text-stone-200">{moeda(resumo.receitaParceiro)}</span>
          </div>
          {resumo.outrasReceitas > 0 && (
            <div className="flex justify-between pl-3 text-stone-400">
              <span>Outras receitas</span>
              <span className="text-stone-200">{moeda(resumo.outrasReceitas)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-imperium-line pt-1 font-medium">
            <span className="text-stone-200">= Receita Bruta</span>
            <span className="text-gold-bright">{moeda(resumo.receitaBruta)}</span>
          </div>

          <div className="flex justify-between pt-2 text-stone-400">
            <span>(-) Impostos ({(config.pctImposto * 100).toFixed(0)}%)</span>
            <span className="text-wine-bright">{moeda(resumo.imposto)}</span>
          </div>
          <div className="flex justify-between border-t border-imperium-line pt-1 font-medium">
            <span className="text-stone-200">= Receita Líquida</span>
            <span className="text-gold-bright">{moeda(resumo.receitaLiquida)}</span>
          </div>

          <p className="pt-3 text-[10px] uppercase tracking-wide text-gold">Despesas Operacionais</p>
          <div className="flex justify-between pl-3 text-stone-400">
            <span>Folha de Pagamento</span>
            <span className="text-stone-200">{moeda(resumo.folhaTotal)}</span>
          </div>
          <div className="flex justify-between pl-3 text-stone-400">
            <span>Vorp (aluguel)</span>
            <span className="text-stone-200">{moeda(resumo.custoAluguel)}</span>
          </div>
          <div className="flex justify-between pl-3 text-stone-400">
            <span>Tráfego</span>
            <span className="text-stone-200">{moeda(resumo.custoTrafego)}</span>
          </div>
          {resumo.despesasExtrasGerais > 0 && (
            <div className="flex justify-between pl-3 text-stone-400">
              <span>Despesas extras (gerais)</span>
              <span className="text-stone-200">{moeda(resumo.despesasExtrasGerais)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-imperium-line pt-1 font-medium">
            <span className="text-stone-200">= Total Despesas Operacionais</span>
            <span className="text-wine-bright">{moeda(resumo.despesasOperacionais)}</span>
          </div>

          <div className="flex justify-between border-t-2 border-imperium-line-strong pt-2 text-base font-medium">
            <span className="text-gold">= LUCRO LÍQUIDO</span>
            <span className={resumo.lucro >= 0 ? "text-success-bright" : "text-wine-bright"}>{moeda(resumo.lucro)}</span>
          </div>
        </div>
      </Card>

      <Card title="Simulador de cenário">
        <SimuladorDre
          pctReceitaCredito={config.pctReceitaCredito}
          pctReceitaParceiro={config.pctReceitaParceiro}
          pctImposto={config.pctImposto}
          despesasOperacionaisAtuais={resumo.despesasOperacionais}
        />
      </Card>

      <details className="card-imp group" open>
        <summary className="kicker flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
          <span>Folha de Pagamento ({linhas.length} pessoas)</span>
          <span className="text-[10px] normal-case text-stone-500 transition group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-4">
          <Table minWidth="min-w-[1100px]">
            <thead>
              <tr>
                <Th className="px-2">Equipe</Th>
                <Th align="right" className="px-2">Vendido SDR</Th>
                <Th align="right" className="px-2">Vendido Closer</Th>
                <Th className="px-2">Cargo</Th>
                <Th className="px-2">Time</Th>
                <Th className="px-2">Tribo</Th>
                <Th align="right" className="px-2">Fixo</Th>
                <Th align="right" className="px-2">Bônus</Th>
                <Th align="right" className="px-2">Fixo+Bônus</Th>
                <Th align="right" className="px-2">Var. SDR</Th>
                <Th align="right" className="px-2">Var. Closer</Th>
                <Th align="right" className="px-2">Var. Gestão</Th>
                <Th align="right" className="px-2">Campanhas</Th>
                <Th align="right" className="px-2">Folha</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <Tr key={l.profileId}>
                  <Td className="px-2 whitespace-nowrap text-stone-200">{l.nome}</Td>
                  <Td align="right" className="px-2 text-stone-400">{l.vendidoSdr > 0 ? moeda(l.vendidoSdr) : "—"}</Td>
                  <Td align="right" className="px-2 text-stone-400">{l.vendidoCloser > 0 ? moeda(l.vendidoCloser) : "—"}</Td>
                  <Td className="px-2 whitespace-nowrap text-stone-400">{l.cargo}</Td>
                  <Td className="px-2 whitespace-nowrap text-stone-500">{l.time ?? "—"}</Td>
                  <Td className="px-2 whitespace-nowrap text-stone-500">{l.tribo ?? "—"}</Td>
                  <Td align="right" className="px-2 text-stone-300">{moeda(l.fixo)}</Td>
                  <Td align="right" className="px-2 text-stone-300">{l.bonus > 0 ? moeda(l.bonus) : "—"}</Td>
                  <Td align="right" className="px-2 text-stone-100">{moeda(l.fixoMaisBonus)}</Td>
                  <Td align="right" className="px-2 text-stone-400">{l.variavelSdr > 0 ? moeda(l.variavelSdr) : "—"}</Td>
                  <Td align="right" className="px-2 text-stone-400">{l.variavelCloser > 0 ? moeda(l.variavelCloser) : "—"}</Td>
                  <Td align="right" className="px-2 text-stone-400">{l.variavelGestao > 0 ? moeda(l.variavelGestao) : "—"}</Td>
                  <Td align="right" className="px-2 text-stone-400">{l.campanhas > 0 ? moeda(l.campanhas) : "—"}</Td>
                  <Td align="right" className="px-2 font-medium text-gold-bright">{moeda(l.folhaTotal)}</Td>
                </Tr>
              ))}
            </tbody>
            <tfoot>
              <Tr className="border-t-2 border-imperium-line-strong font-medium">
                <Td className="px-2 text-gold-bright">TOTAL</Td>
                <Td className="px-2" />
                <Td className="px-2" />
                <Td className="px-2" />
                <Td className="px-2" />
                <Td className="px-2" />
                <Td align="right" className="px-2 text-stone-200">{moeda(totais.fixo)}</Td>
                <Td align="right" className="px-2 text-stone-200">{moeda(totais.bonus)}</Td>
                <Td align="right" className="px-2 text-stone-100">{moeda(totais.fixoMaisBonus)}</Td>
                <Td align="right" className="px-2 text-stone-200">{moeda(totais.variavelSdr)}</Td>
                <Td align="right" className="px-2 text-stone-200">{moeda(totais.variavelCloser)}</Td>
                <Td align="right" className="px-2 text-stone-200">{moeda(totais.variavelGestao)}</Td>
                <Td align="right" className="px-2 text-stone-200">{moeda(totais.campanhas)}</Td>
                <Td align="right" className="px-2 text-gold-bright">{moeda(totais.folhaTotal)}</Td>
              </Tr>
            </tfoot>
          </Table>
        </div>
      </details>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Outras receitas do mês">
          <form action={adicionarReceitaExtra} className="mb-3 flex gap-2">
            <input type="hidden" name="ano" value={ano} />
            <input type="hidden" name="mes" value={mes} />
            <input name="descricao" placeholder="Ex: Aporte, outro fundo" className="input-imp flex-1 text-xs" />
            <input name="valor" type="number" step="0.01" placeholder="R$" className="input-imp w-28 text-xs" />
            <button type="submit" className="btn-outline shrink-0 px-3 py-1.5 text-xs">
              Adicionar
            </button>
          </form>

          {receitasExtras.length > 0 ? (
            <ul className="space-y-1.5">
              {receitasExtras.map((r) => (
                <li key={r.id} className="flex items-center justify-between border-t border-imperium-line pt-1.5 text-xs">
                  <span className="text-stone-300">{r.descricao}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-success-bright">{moeda(r.valor)}</span>
                    <form action={excluirReceitaExtra}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="text-stone-600 hover:text-wine-bright">
                        ×
                      </button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-stone-600">Nenhuma receita extra lançada esse mês.</p>
          )}
        </Card>

        <Card title="Produção do parceiro">
          <p className="mb-2 text-xs text-stone-500">
            Operação externa sem dado nativo aqui — cadastra manualmente quanto eles produziram no mês, e a Receita
            já soma {(config.pctReceitaParceiro * 100).toFixed(0)}% disso.
          </p>
          <form action={salvarProducaoParceiro} className="flex items-end gap-2">
            <input type="hidden" name="ano" value={ano} />
            <input type="hidden" name="mes" value={mes} />
            <div className="flex-1">
              <label className="mb-1 block text-[10px] uppercase text-stone-500">Produção do mês (R$)</label>
              <input
                type="number"
                name="valor"
                step="0.01"
                defaultValue={producaoParceiroAtual || undefined}
                className="input-imp text-sm"
              />
            </div>
            <button type="submit" className="btn-outline px-3 py-2 text-xs">
              Salvar
            </button>
          </form>
        </Card>

        <Card title="Despesas extras do mês">
          <form action={adicionarDespesaExtra} className="mb-3 space-y-2">
            <input type="hidden" name="ano" value={ano} />
            <input type="hidden" name="mes" value={mes} />
            <div className="flex gap-2">
              <input name="descricao" placeholder="Ex: Campanha fim de ano" className="input-imp flex-1 text-xs" />
              <input name="valor" type="number" step="0.01" placeholder="R$" className="input-imp w-28 text-xs" />
            </div>
            <div className="flex items-center gap-2">
              <select name="profile_id" className="input-imp flex-1 text-xs">
                <option value="">Custo geral da firma (sem pessoa)</option>
                {linhas.map((l) => (
                  <option key={l.profileId} value={l.profileId}>
                    {l.nome} (entra na Folha dela)
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-outline px-3 py-1.5 text-xs">
                Adicionar
              </button>
            </div>
          </form>

          {despesas.length > 0 ? (
            <ul className="space-y-1.5">
              {despesas.map((d) => (
                <li key={d.id} className="flex items-center justify-between border-t border-imperium-line pt-1.5 text-xs">
                  <span className="text-stone-300">
                    {d.descricao} {d.profileNome && <span className="text-stone-600">· {d.profileNome}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-wine-bright">{moeda(d.valor)}</span>
                    <form action={excluirDespesaExtra}>
                      <input type="hidden" name="id" value={d.id} />
                      <button type="submit" className="text-stone-600 hover:text-wine-bright">
                        ×
                      </button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-stone-600">Nenhuma despesa extra lançada esse mês.</p>
          )}
        </Card>
      </div>

      <details className="card-imp group">
        <summary className="kicker flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
          <span>Configurações da DRE</span>
          <span className="text-[10px] normal-case text-stone-500 transition group-open:rotate-180">▾</span>
        </summary>
        <form action={salvarConfigDre} className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-stone-400">% Receita sobre crédito próprio</label>
            <input
              name="pct_receita_credito"
              type="number"
              step="0.01"
              defaultValue={(config.pctReceitaCredito * 100).toFixed(2)}
              className="input-imp text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-400">% Receita sobre produção do parceiro</label>
            <input
              name="pct_receita_parceiro"
              type="number"
              step="0.01"
              defaultValue={(config.pctReceitaParceiro * 100).toFixed(2)}
              className="input-imp text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-400">% Imposto (sobre a Receita total)</label>
            <input
              name="pct_imposto"
              type="number"
              step="0.01"
              defaultValue={(config.pctImposto * 100).toFixed(2)}
              className="input-imp text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-400">Custo fixo · Vorp (aluguel)</label>
            <input
              name="custo_aluguel"
              type="number"
              step="0.01"
              defaultValue={config.custoAluguel}
              className="input-imp text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-400">Custo fixo · Tráfego</label>
            <input
              name="custo_trafego"
              type="number"
              step="0.01"
              defaultValue={config.custoTrafego}
              className="input-imp text-sm"
            />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-gold px-4 py-2 text-xs">
              Salvar configurações
            </button>
          </div>
        </form>
      </details>
    </main>
  );
}
