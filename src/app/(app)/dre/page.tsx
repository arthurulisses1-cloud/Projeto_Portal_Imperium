import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buscarFolha,
  buscarFolhaForecast,
  buscarResumoDre,
  buscarResumoDreForecast,
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
import SimuladorDre from "@/components/dre/SimuladorDre";
import EstruturaDreView from "@/components/dre/EstruturaDreView";

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
  // Diretor edita tudo; Investidor só enxerga (RLS das tabelas dre_* já
  // barra escrita dele no banco — is_investidor() só tem policy de select,
  // ver migration 0040). Qualquer outro papel nem chega aqui.
  const isDiretor = profile?.role === "diretor";
  if (!isDiretor && profile?.role !== "investidor") redirect("/");

  const hoje = new Date();
  const ano = Number(searchParams.ano) || hoje.getFullYear();
  const mes = Number(searchParams.mes) || hoje.getMonth() + 1;

  const [folhaPago, resumoPago, folhaForecast, resumoForecast, config, despesas, receitasExtras, producaoParceiroAtual] =
    await Promise.all([
      buscarFolha(supabase, ano, mes),
      buscarResumoDre(supabase, ano, mes),
      buscarFolhaForecast(supabase, ano, mes),
      buscarResumoDreForecast(supabase, ano, mes),
      buscarConfigDre(supabase),
      buscarDespesasExtras(supabase, ano, mes),
      buscarReceitasExtras(supabase, ano, mes),
      buscarProducaoParceiro(supabase, ano, mes),
    ]);
  const { linhas } = folhaPago;
  const resumo = resumoPago;

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
        <Card title="Margem de Contribuição">
          <p className="font-display text-2xl text-gold-bright">{moeda(resumo.margemContribuicao)}</p>
          <p className="mt-1 text-[11px] text-stone-600">
            {resumo.margemContribuicaoPct.toFixed(0)}% da Receita Líquida, depois de tirar comissão e bônus
          </p>
        </Card>
        <Card title="Lucro">
          <p className={`font-display text-2xl ${resumo.lucro >= 0 ? "text-success-bright" : "text-wine-bright"}`}>
            {moeda(resumo.lucro)}
          </p>
          <p className="mt-1 text-[11px] text-stone-600">Margem líquida: {resumo.lucroPct.toFixed(0)}%</p>
        </Card>
      </div>

      {/* DRE gerencial de custeio variável — separa o que só existe PORQUE
          alguém vendeu (comissão, bônus de tier) do que a firma paga
          independente de vender ou não (salário-base, aluguel, tráfego).
          Comissão de vendas é custo variável e entra na margem de
          contribuição, não numa "despesa operacional" genérica misturada
          com fixo — é assim que qualquer CFO estruturaria isso. Toggle
          Pago/Forecast e drill-down por pessoa vivem dentro do client
          component (interatividade não dá pra fazer só no server). */}
      <EstruturaDreView
        config={{ pctImposto: config.pctImposto }}
        pago={{ resumo: resumoPago, folha: folhaPago }}
        forecast={{ resumo: resumoForecast, folha: folhaForecast }}
      />

      <details className="card-imp group">
        <summary className="kicker flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
          <span>Simulador de cenário</span>
          <span className="text-[10px] normal-case text-stone-500 transition group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-4">
          <SimuladorDre
            pctReceitaCredito={config.pctReceitaCredito}
            pctReceitaParceiro={config.pctReceitaParceiro}
            pctImposto={config.pctImposto}
            pctCustoVariavel={resumo.receitaLiquida > 0 ? resumo.custosVariaveisTotal / resumo.receitaLiquida : 0}
            despesasFixasAtuais={resumo.despesasFixasTotal}
          />
        </div>
      </details>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Outras receitas do mês">
          {isDiretor && (
            <form action={adicionarReceitaExtra} className="mb-3 flex gap-2">
              <input type="hidden" name="ano" value={ano} />
              <input type="hidden" name="mes" value={mes} />
              <input name="descricao" placeholder="Ex: Aporte, outro fundo" className="input-imp flex-1 text-xs" />
              <input name="valor" type="number" step="0.01" placeholder="R$" className="input-imp w-28 text-xs" />
              <button type="submit" className="btn-outline shrink-0 px-3 py-1.5 text-xs">
                Adicionar
              </button>
            </form>
          )}

          {receitasExtras.length > 0 ? (
            <ul className="space-y-1.5">
              {receitasExtras.map((r) => (
                <li key={r.id} className="flex items-center justify-between border-t border-imperium-line pt-1.5 text-xs">
                  <span className="text-stone-300">{r.descricao}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-success-bright">{moeda(r.valor)}</span>
                    {isDiretor && (
                      <form action={excluirReceitaExtra}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="text-stone-600 hover:text-wine-bright">
                          ×
                        </button>
                      </form>
                    )}
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
          {isDiretor ? (
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
          ) : (
            <p className="font-display text-lg text-gold-bright">{moeda(producaoParceiroAtual)}</p>
          )}
        </Card>

        <Card title="Despesas extras do mês">
          {isDiretor && (
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
          )}

          {despesas.length > 0 ? (
            <ul className="space-y-1.5">
              {despesas.map((d) => (
                <li key={d.id} className="flex items-center justify-between border-t border-imperium-line pt-1.5 text-xs">
                  <span className="text-stone-300">
                    {d.descricao} {d.profileNome && <span className="text-stone-600">· {d.profileNome}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-wine-bright">{moeda(d.valor)}</span>
                    {isDiretor && (
                      <form action={excluirDespesaExtra}>
                        <input type="hidden" name="id" value={d.id} />
                        <button type="submit" className="text-stone-600 hover:text-wine-bright">
                          ×
                        </button>
                      </form>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-stone-600">Nenhuma despesa extra lançada esse mês.</p>
          )}
        </Card>
      </div>

      {isDiretor && (
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
      )}
    </main>
  );
}
