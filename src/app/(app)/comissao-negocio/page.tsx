import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ExplicacaoComissaoFinance from "@/components/negocio/ExplicacaoComissaoFinance";
import { getViewerContext } from "@/lib/preview";
import { hojeBR } from "@/lib/data-br";
import { COOKIE_NEGOCIO, NEGOCIO_COR, buscarNegociosVisiveis, negocioEmFoco, nomeEquipe, veConsolidado } from "@/lib/negocios";
import { buscarComissoesNegocios, type ComissaoNegocio, type PapelComissao } from "@/lib/comissao-negocio";
import { buscarCarteira, buscarPainelSdr, vinculoPreVendas } from "@/lib/sdr-negocio";
import { ExplicacaoComissaoVorp, PainelComissaoSdr, pctVorp } from "@/components/negocio/ComissaoSdr";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const PAPEL: Record<PapelComissao, string> = { closer: "Fechamento", sdr: "SDR", bdr: "BDR", head: "Gestão (Head)", diretor: "Gestão (Diretor)" };

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}
function dataCurta(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
function dataBR(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default async function ComissaoNegocioPage({ searchParams }: { searchParams: { negocio?: string; mes?: string } }) {
  const supabase = await createClient();
  // Pessoa "vista": respeita o "Ver como" do Diretor; só vê os negócios em que a pessoa está.
  const viewer = await getViewerContext(supabase);
  if (!viewer) redirect("/login");
  const user = { id: viewer.effectiveId };
  const eu = { role: viewer.effectiveRole };

  const visiveis = (await buscarNegociosVisiveis(supabase, user.id, eu.role)).filter((n) => n.status === "ativo");
  if (visiveis.length === 0) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="font-display text-xl text-gold-bright">Sem negócio vinculado</h1>
        <p className="mt-2 text-sm text-stone-400">Você ainda não está em nenhum negócio ativo.</p>
      </main>
    );
  }

  const hoje = hojeBR();
  const m = /^(\d{4})-(\d{2})$/.exec(searchParams.mes ?? "");
  const ano = m ? Number(m[1]) : Number(hoje.slice(0, 4));
  const mes = m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? Number(m[2]) : Number(hoje.slice(5, 7));

  // Fechamentos até outubro/2026 (inclusive) seguem o modelo antigo de comissão.
  if (ano * 100 + mes < 202611) redirect(`/comissao?ano=${ano}&mes=${mes}`);

  const foco = negocioEmFoco(searchParams.negocio ?? cookies().get(COOKIE_NEGOCIO)?.value, visiveis);
  const escolhidos = foco ? [foco] : visiveis;
  const dadosProprios = await buscarComissoesNegocios(supabase, ano, mes, escolhidos.map((n) => n.slug));

  // Venda de outra BU em que a pessoa participou (ex.: consultor de outro negócio que fechou ou indicou
  // uma venda do Vorp Finance): aparece como valor a receber daquela equipe, só as linhas dela.
  let dadosExternos: ComissaoNegocio[] = [];
  if (!veConsolidado(eu.role)) {
    const visiveisSlugs = new Set(visiveis.map((n) => n.slug));
    const { data: outros } = await supabase.from("negocios").select("slug").eq("status", "ativo");
    const slugsOutros = (outros ?? []).map((o) => o.slug as string).filter((s) => !visiveisSlugs.has(s));
    if (slugsOutros.length > 0) {
      dadosExternos = (await buscarComissoesNegocios(supabase, ano, mes, slugsOutros)).filter((d) => d.pessoas.some((p) => p.id === user.id));
    }
  }
  const dados = [...dadosProprios, ...dadosExternos];

  // Diretor vê tudo; Head vê o negócio que chefia; os demais só as próprias linhas.
  const ehDiretor = eu.role === "diretor";
  const headDe = new Set(visiveis.filter((n) => n.cargo === "head" && !ehDiretor).map((n) => n.slug));
  const veTudo = (d: ComissaoNegocio) => ehDiretor || headDe.has(d.slug);

  const ant = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
  const seg = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
  const sufixo = foco ? `&negocio=${foco.slug}` : "";
  const totalGeral = dados.filter(veTudo).reduce((s, d) => s + d.totalComissao, 0);

  // A explicação do Finance só aparece para quem tem comissão do Finance na tela (ou vê o Finance inteiro).
  const mostraFinance = dados.some((d) => d.slug === "vorp-finance" && (veTudo(d) || d.pessoas.some((p) => p.id === user.id)));

  // SDR da Acrópole: regras da Acrópole, RQA do mês, comissão de venda padrão e carteira de recorrência.
  const preVendas = ehDiretor ? null : await vinculoPreVendas(supabase, user.id);
  let blocoSdr: React.ReactNode = null;
  if (preVendas && (!foco || foco.slug === preVendas.slug)) {
    const admin = createAdminClient();
    const [painel, carteira] = await Promise.all([
      buscarPainelSdr(admin, preVendas, { id: user.id, nome: viewer.effectiveNome }, { ano, mes, hoje }),
      buscarCarteira(admin, preVendas.id, user.id, hoje, pctVorp),
    ]);
    const comissaoVendas = dados.find((d) => d.slug === preVendas.slug)?.pessoas.find((p) => p.id === user.id)?.total ?? 0;
    blocoSdr = (
      <>
        <ExplicacaoComissaoVorp />
        <PainelComissaoSdr reunioes={painel.reunioes} comissaoVendas={comissaoVendas} carteira={carteira} atualizadoEm={painel.atualizadoEm} />
      </>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Comissão do mês</h1>
          <p className="mt-1 text-sm text-stone-400">
            {MESES[mes]} de {ano} · calculada sobre o valor recebido de cada venda · pagamento no dia 15 do mês seguinte.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/comissao-negocio?mes=${ant}${sufixo}`} className="rounded border border-imperium-line px-3 py-1 text-stone-300 hover:text-stone-100">
            ← {MESES[mes === 1 ? 12 : mes - 1]}
          </Link>
          <Link href={`/comissao-negocio?mes=${seg}${sufixo}`} className="rounded border border-imperium-line px-3 py-1 text-stone-300 hover:text-stone-100">
            {MESES[mes === 12 ? 1 : mes + 1]} →
          </Link>
        </div>
      </div>

      <p className="text-xs text-stone-500">
        Fechamentos até outubro/2026 seguem o modelo antigo: <Link href="/comissao?ano=2026&mes=10" className="text-gold hover:underline">ver outubro</Link>.
      </p>

      {mostraFinance && <ExplicacaoComissaoFinance completo={ehDiretor || headDe.has("vorp-finance")} />}

      {blocoSdr}

      {visiveis.length > 1 && (
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href={`/comissao-negocio?mes=${ano}-${String(mes).padStart(2, "0")}&negocio=todos`}
            className={`rounded border px-3 py-1 ${!foco ? "border-gold text-stone-100" : "border-imperium-line text-stone-400 hover:text-stone-100"}`}
          >
            Todos
          </Link>
          {visiveis.map((n) => (
            <Link
              key={n.id}
              href={`/comissao-negocio?mes=${ano}-${String(mes).padStart(2, "0")}&negocio=${n.slug}`}
              className={`rounded border px-3 py-1 ${foco?.id === n.id ? "border-gold text-stone-100" : "border-imperium-line text-stone-400 hover:text-stone-100"}`}
            >
              {nomeEquipe(n)}
            </Link>
          ))}
        </div>
      )}

      {dados.length > 1 && totalGeral > 0 && (
        <div className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Total de comissões a pagar em {dataBR(dados[0].pagamento)}</p>
          <p className="mt-1 text-2xl font-semibold text-gold-bright">{moeda(totalGeral)}</p>
        </div>
      )}

      {dados.map((d) => {
        const cor = NEGOCIO_COR[d.slug] ?? "201 162 74";
        const completo = veTudo(d);
        const pessoas = completo ? d.pessoas : d.pessoas.filter((p) => p.id === user.id);
        const nome = d.equipeNome || d.nome;
        const externo = dadosExternos.includes(d);
        return (
          <section key={d.slug} className="rounded-lg border bg-imperium-surface p-4" style={{ borderColor: `rgb(${cor} / 0.55)` }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-base font-semibold" style={{ color: `rgb(${cor})` }}>
                {nome}
              </p>
              {externo && <p className="text-xs text-stone-400">Venda de outra equipe · a receber de {nome}</p>}
              {completo && (
                <p className="text-sm text-stone-400">
                  Recebido {moeda(d.recebido)} · comissões <span className="text-stone-100">{moeda(d.totalComissao)}</span>
                </p>
              )}
            </div>

            {!d.temRegra ? (
              <p className="mt-3 text-sm text-stone-400">As regras de comissão deste negócio ainda não foram definidas.</p>
            ) : pessoas.length === 0 ? (
              <p className="mt-3 text-sm text-stone-500">{completo ? "Nenhuma venda lançada neste mês." : "Você não tem comissão neste mês."}</p>
            ) : (
              <ul className="mt-3 divide-y divide-imperium-line">
                {pessoas.map((p) => (
                  <li key={p.id} className="py-2">
                    <details open={d.slug === "vorp-finance" && !completo}>
                      <summary className="flex cursor-pointer select-none items-center gap-3 text-sm">
                        <span className="min-w-0 flex-1 truncate text-stone-100">{p.nome}</span>
                        <span className="hidden text-xs text-stone-500 sm:inline">
                          {(Object.entries(p.porPapel) as [PapelComissao, number][]).map(([k, v]) => `${PAPEL[k]} ${moeda(v)}`).join(" · ")}
                        </span>
                        {(() => {
                          const desagio = p.itens.filter((i) => i.tipo === "desagio").reduce((s, i) => s + i.valor, 0);
                          return desagio > 0 ? (
                            <span className="shrink-0 text-xs text-stone-500">
                              base {moeda(p.total - desagio)} · deságio {moeda(desagio)}
                            </span>
                          ) : null;
                        })()}
                        <span className="shrink-0 font-semibold text-gold-bright">{moeda(p.total)}</span>
                      </summary>
                      {d.slug === "vorp-finance" ? (
                        (() => {
                          // Uma linha por venda: comissão da margem (base), comissão do deságio e total.
                          const porVenda = new Map<string, { data: string; cliente: string | null; base: number; desagio: number }>();
                          for (const i of p.itens) {
                            const r = porVenda.get(i.vendaId) ?? { data: i.data, cliente: i.cliente, base: 0, desagio: 0 };
                            if (i.tipo === "desagio") r.desagio += i.valor;
                            else r.base += i.valor;
                            porVenda.set(i.vendaId, r);
                          }
                          const linhas = Array.from(porVenda.values()).sort((a, b) => (a.data < b.data ? 1 : -1));
                          const totBase = linhas.reduce((s, l) => s + l.base, 0);
                          const totDesagio = linhas.reduce((s, l) => s + l.desagio, 0);
                          return (
                            <div className="mt-2 overflow-x-auto">
                              <table className="w-full text-xs text-stone-400">
                                <thead>
                                  <tr className="text-[10px] uppercase tracking-wide text-stone-500">
                                    <th className="py-1 text-left font-normal">Cliente</th>
                                    <th className="py-1 text-right font-normal">Comissão da margem</th>
                                    <th className="py-1 text-right font-normal">Comissão do deságio</th>
                                    <th className="py-1 text-right font-normal">Comissão total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {linhas.map((l, idx) => (
                                    <tr key={idx} className="border-t border-imperium-line/60">
                                      <td className="py-1.5">
                                        {l.cliente ?? "—"} <span className="text-stone-600">· {dataCurta(l.data)}</span>
                                      </td>
                                      <td className="py-1.5 text-right">{moeda(l.base)}</td>
                                      <td className="py-1.5 text-right">{moeda(l.desagio)}</td>
                                      <td className="py-1.5 text-right text-stone-100">{moeda(l.base + l.desagio)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t border-imperium-line font-semibold text-stone-200">
                                    <td className="py-1.5">Total</td>
                                    <td className="py-1.5 text-right">{moeda(totBase)}</td>
                                    <td className="py-1.5 text-right">{moeda(totDesagio)}</td>
                                    <td className="py-1.5 text-right text-gold-bright">{moeda(totBase + totDesagio)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          );
                        })()
                      ) : (
                      <table className="mt-2 w-full text-xs text-stone-400">
                        <tbody>
                          {p.itens
                            .slice()
                            .sort((a, b) => (a.data < b.data ? 1 : -1))
                            .map((i, idx) => (
                              <tr key={idx} className="border-t border-imperium-line/60">
                                <td className="w-12 py-1">{dataCurta(i.data)}</td>
                                <td className="py-1">{i.cliente ?? "—"}</td>
                                <td className="py-1">
                                  {PAPEL[i.papel]}
                                  {i.tipo === "desagio" && " · deságio"}
                                </td>
                                <td className="py-1 text-right">
                                  {i.pct}% de {moeda(i.base)}
                                </td>
                                <td className="py-1 text-right text-stone-200">{moeda(i.valor)}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      )}
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </main>
  );
}
