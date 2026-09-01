import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buscarNotaMes, buscarPendenciasAprovacao, buscarFechamento } from "@/lib/dre";
import { aprovarComissaoParceiro, fecharMes, reabrirMes } from "./actions";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { hojeBR } from "@/lib/data-br";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

export default async function FechamentoPage({ searchParams }: { searchParams: { ano?: string; mes?: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  // Mesma regra da DRE: Diretor edita, Investidor só enxerga (RLS das
  // tabelas fechamento_*/comissoes_parceiro já barra escrita dele no banco).
  const isDiretor = profile?.role === "diretor";
  if (!isDiretor && profile?.role !== "investidor") redirect("/");

  const [anoHoje, mesHoje] = hojeBR().split("-").map(Number);
  const ano = Number(searchParams.ano) || anoHoje;
  const mes = Number(searchParams.mes) || mesHoje;

  const [nota, pendencias, fechamento] = await Promise.all([
    buscarNotaMes(supabase, ano, mes),
    buscarPendenciasAprovacao(supabase, ano, mes),
    buscarFechamento(supabase, ano, mes),
  ]);

  const mesAnterior = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  const mesSeguinte = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };

  const totalDia5 = fechamento.pessoas.reduce((s, p) => s + p.fixo + p.bonus, 0);
  const totalDia15Comissao = fechamento.pessoas.reduce((s, p) => s + p.variavel, 0);
  const totalDia15Parceiros = fechamento.parceiros.reduce((s, p) => s + p.valorRepassado, 0);
  const totalDia15 = totalDia15Comissao + totalDia15Parceiros;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Fechamento de Mês</h1>
          <p className="text-xs text-stone-500">
            Nota, aprovação de parceiro e pagamentos — só Diretor e Investidor acessam. ·{" "}
            <a href="/dre" className="text-gold hover:underline">
              Ir pra DRE →
            </a>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/fechamento?ano=${mesAnterior.ano}&mes=${mesAnterior.mes}`} className="btn-outline px-2.5 py-1.5 text-xs">
            ← {MESES[mesAnterior.mes - 1].slice(0, 3)}
          </a>
          <span className="font-display text-sm text-stone-200">
            {MESES[mes - 1]}/{ano}
          </span>
          <a href={`/fechamento?ano=${mesSeguinte.ano}&mes=${mesSeguinte.mes}`} className="btn-outline px-2.5 py-1.5 text-xs">
            {MESES[mesSeguinte.mes - 1].slice(0, 3)} →
          </a>
        </div>
      </div>

      {/* Trava (no dia 1) a Folha + Comissão de Parceiro desse mês de
          produção — a partir daí /comissao e este painel mostram o
          snapshot, não o número live (que pode mudar se o sync corrigir
          algo depois). Reabrível pelo Diretor se achar erro. */}
      <div className="card-imp space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-imperium-line pb-4">
          <div>
            <p className="text-xs text-stone-500">
              Status de {MESES[mes - 1]}/{ano}
            </p>
            <p className={`font-display text-lg ${fechamento.status === "fechado" ? "text-success-bright" : "text-gold"}`}>
              {fechamento.status === "fechado" ? "Fechado" : "Aberto (números ainda podem mudar)"}
            </p>
            {fechamento.status === "fechado" && (
              <p className="text-[11px] text-stone-600">
                pagamento dia 5 e dia 15 de {MESES[mesSeguinte.mes - 1]}/{mesSeguinte.ano}
              </p>
            )}
          </div>
          {isDiretor && (
            <div className="flex gap-2">
              {fechamento.status === "fechado" ? (
                <form action={reabrirMes}>
                  <input type="hidden" name="ano" value={ano} />
                  <input type="hidden" name="mes" value={mes} />
                  <button type="submit" className="btn-outline px-3 py-1.5 text-xs">
                    Reabrir
                  </button>
                </form>
              ) : (
                <form action={fecharMes}>
                  <input type="hidden" name="ano" value={ano} />
                  <input type="hidden" name="mes" value={mes} />
                  <button
                    type="submit"
                    disabled={pendencias.length > 0}
                    className="btn-gold px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Fechar {MESES[mes - 1]}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {isDiretor && pendencias.length > 0 && (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-gold">
              Comissão de parceiro acima do padrão — aguardando aprovação ({pendencias.length})
            </p>
            <ul className="space-y-2">
              {pendencias.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-gold/30 bg-gold/5 p-2 text-xs"
                >
                  <span className="text-stone-300">
                    {p.nomeParceiro} · {p.percentual}% de {moeda(p.valorOperacao)}
                    {p.cliente && <> ({p.cliente})</>} = <span className="text-gold-bright">{moeda(p.valorComissao)}</span>
                  </span>
                  <form action={aprovarComissaoParceiro}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="btn-outline px-2 py-1 text-[10px]">
                      Aprovar
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-stone-500">
            Nota do mês (crédito pago no mês — pra mandar ao banco)
          </p>
          {nota.length > 0 ? (
            <>
              <Table minWidth="min-w-[640px]">
                <thead>
                  <tr>
                    <Th className="pr-2">Data</Th>
                    <Th className="pr-2">Cliente</Th>
                    <Th className="pr-2">ID cliente</Th>
                    <Th align="right" className="pr-2">Crédito</Th>
                    <Th className="pr-2">Parceiro</Th>
                    <Th align="right">Extra %</Th>
                  </tr>
                </thead>
                <tbody>
                  {nota.map((l) => (
                    <Tr key={l.weeklyOperacaoId}>
                      <Td className="pr-2 whitespace-nowrap text-stone-300">
                        {new Date(l.data + "T00:00:00").toLocaleDateString("pt-BR")}
                      </Td>
                      <Td className="pr-2 text-stone-300">{l.cliente ?? "—"}</Td>
                      <Td className="pr-2 text-stone-600">{l.clienteId ?? "—"}</Td>
                      <Td align="right" className="pr-2 whitespace-nowrap text-stone-100">{moeda(l.valor)}</Td>
                      <Td className="pr-2 text-stone-400">{l.parceiro?.nomeParceiro ?? "—"}</Td>
                      <Td align="right" className="whitespace-nowrap text-gold">
                        {l.parceiro ? moeda(l.parceiro.extra) : "—"}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
              <p className="mt-2 text-[11px] text-stone-600">
                Total crédito: {moeda(nota.reduce((s, l) => s + l.valor, 0))} · Total extra de parceiro:{" "}
                {moeda(nota.reduce((s, l) => s + (l.parceiro?.extra ?? 0), 0))}
              </p>
            </>
          ) : (
            <p className="text-xs text-stone-600">Nenhuma operação paga esse mês ainda.</p>
          )}
        </div>

        {fechamento.status === "fechado" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-stone-500">Dia 5 · Fixo + Bônus</p>
              <ul className="space-y-1">
                {fechamento.pessoas.map((p) => (
                  <li key={p.profileId} className="flex justify-between text-xs">
                    <span className="text-stone-300">{p.nome}</span>
                    <span className="text-gold-bright">{moeda(p.fixo + p.bonus)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-between border-t border-imperium-line pt-2 text-xs font-medium">
                <span className="text-stone-300">Total dia 5</span>
                <span className="text-gold-bright">{moeda(totalDia5)}</span>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-stone-500">Dia 15 · Comissão + Parceiros</p>
              <ul className="space-y-1">
                {fechamento.pessoas
                  .filter((p) => p.variavel > 0)
                  .map((p) => (
                    <li key={p.profileId} className="flex justify-between text-xs">
                      <span className="text-stone-300">{p.nome}</span>
                      <span className="text-gold-bright">{moeda(p.variavel)}</span>
                    </li>
                  ))}
                {fechamento.parceiros.map((p, i) => (
                  <li key={i} className="flex justify-between border-t border-imperium-line pt-1 text-xs">
                    <span className="text-stone-400">
                      {p.nomeParceiro} · Pix {p.chavePix}
                    </span>
                    <span className="text-gold-bright">{moeda(p.valorRepassado)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-between border-t border-imperium-line pt-2 text-xs font-medium">
                <span className="text-stone-300">Total dia 15</span>
                <span className="text-gold-bright">{moeda(totalDia15)}</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-stone-600">Feche o mês pra travar quem recebe quanto dia 5 e dia 15.</p>
        )}
      </div>
    </main>
  );
}
