import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hojeBR } from "@/lib/data-br";
import { COOKIE_NEGOCIO, NEGOCIO_COR, buscarNegociosVisiveis, negocioEmFoco, nomeEquipe } from "@/lib/negocios";
import { buscarComissoesNegocios, type ComissaoNegocio, type PapelComissao } from "@/lib/comissao-negocio";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: eu } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!eu) redirect("/");

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
  const dados = await buscarComissoesNegocios(supabase, ano, mes, escolhidos.map((n) => n.slug));

  // Diretor vê tudo; Head vê o negócio que chefia; os demais só as próprias linhas.
  const ehDiretor = eu.role === "diretor";
  const headDe = new Set(visiveis.filter((n) => n.cargo === "head" && !ehDiretor).map((n) => n.slug));
  const veTudo = (d: ComissaoNegocio) => ehDiretor || headDe.has(d.slug);

  const ant = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
  const seg = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
  const sufixo = foco ? `&negocio=${foco.slug}` : "";
  const totalGeral = dados.filter(veTudo).reduce((s, d) => s + d.totalComissao, 0);

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
        return (
          <section key={d.slug} className="rounded-lg border bg-imperium-surface p-4" style={{ borderColor: `rgb(${cor} / 0.55)` }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-base font-semibold" style={{ color: `rgb(${cor})` }}>
                {nome}
              </p>
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
                    <details>
                      <summary className="flex cursor-pointer select-none items-center gap-3 text-sm">
                        <span className="min-w-0 flex-1 truncate text-stone-100">{p.nome}</span>
                        <span className="hidden text-xs text-stone-500 sm:inline">
                          {(Object.entries(p.porPapel) as [PapelComissao, number][]).map(([k, v]) => `${PAPEL[k]} ${moeda(v)}`).join(" · ")}
                        </span>
                        <span className="shrink-0 font-semibold text-gold-bright">{moeda(p.total)}</span>
                      </summary>
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
