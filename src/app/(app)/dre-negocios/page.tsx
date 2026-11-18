import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hojeBR } from "@/lib/data-br";
import { NEGOCIO_COR } from "@/lib/negocios";
import { buscarDreNegocios, type DreNegocio, type DreTotal } from "@/lib/dre-negocios";

export const dynamic = "force-dynamic";

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
const pct = (v: number, base: number) => (base > 0 ? Math.round((v / base) * 100) + "%" : "—");
const pad = (n: number) => String(n).padStart(2, "0");

export default async function DreNegociosPage({ searchParams }: { searchParams: { mes?: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: eu } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!eu || !["diretor", "investidor"].includes(eu.role)) redirect("/");

  const hoje = hojeBR();
  const m = /^(\d{4})-(\d{2})$/.exec(searchParams.mes ?? "");
  const ano = m ? Number(m[1]) : Number(hoje.slice(0, 4));
  const mes = m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? Number(m[2]) : Number(hoje.slice(5, 7));
  // Antes de novembro/2026 vale o modelo antigo (DRE).
  if (ano * 100 + mes < 202611) redirect("/dre");

  const { negocios, total } = await buscarDreNegocios(supabase, ano, mes);
  const ant = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  const seg = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
  const link = (p: { ano: number; mes: number }) => `/dre-negocios?mes=${p.ano}-${pad(p.mes)}`;
  const temEstimado = negocios.some((n) => n.estimadoSunne);
  const semRegra = negocios.filter((n) => !n.temRegra);

  type Linha = { rotulo: string; chave: keyof DreTotal; sinal?: "-"; destaque?: boolean; pctDe?: keyof DreTotal };
  const linhas: Linha[] = [
    { rotulo: "Receita recebida", chave: "receita", destaque: true },
    { rotulo: "Comissões", chave: "comissoes", sinal: "-" },
    { rotulo: "Margem de contribuição", chave: "margemContribuicao", destaque: true, pctDe: "receita" },
    { rotulo: "Fixos (folha)", chave: "totalFixos", sinal: "-" },
    { rotulo: "Custo do Diretor (rateio)", chave: "custoDiretor", sinal: "-" },
    { rotulo: "Resultado", chave: "resultado", destaque: true, pctDe: "receita" },
  ];

  const celula = (v: DreTotal, l: Linha) => {
    const valor = v[l.chave];
    const negativo = l.chave === "resultado" && valor < 0;
    return (
      <>
        <span className={negativo ? "text-wine-bright" : l.chave === "resultado" ? (valor > 0 ? "text-success-bright" : "") : ""}>
          {l.sinal === "-" && valor > 0 ? "− " : ""}
          {moeda(valor)}
        </span>
        {l.pctDe && <span className="ml-2 text-[11px] font-normal text-stone-500">{pct(valor, v[l.pctDe])}</span>}
      </>
    );
  };

  return (
    <main className="mx-auto max-w-6xl space-y-5 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">DRE dos negócios</h1>
          <p className="mt-1 text-sm text-stone-400">
            {MESES[mes]} de {ano} · as {negocios.length} DREs lado a lado, por competência.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={link(ant)} className="rounded border border-imperium-line px-3 py-1 text-stone-300 hover:text-stone-100">
            ← {MESES[ant.mes]}
          </Link>
          <Link href={link(seg)} className="rounded border border-imperium-line px-3 py-1 text-stone-300 hover:text-stone-100">
            {MESES[seg.mes]} →
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-imperium-line bg-imperium-surface">
        <table className="w-full min-w-[760px] text-sm [&_td]:px-4 [&_th]:px-4 [&_td.num]:whitespace-nowrap [&_td.num]:text-right [&_th.num]:text-right">
          <thead>
            <tr className="border-b border-imperium-line">
              <th className="py-3 text-left text-[10px] font-normal uppercase tracking-widest text-stone-500">DRE</th>
              {negocios.map((n) => {
                const cor = NEGOCIO_COR[n.slug] ?? "201 162 74";
                return (
                  <th key={n.slug} className="num py-3 text-sm font-semibold" style={{ color: `rgb(${cor})` }}>
                    {n.nome}
                    {n.estimadoSunne && <span className="ml-1 text-[10px] font-normal text-stone-500">Sunne</span>}
                  </th>
                );
              })}
              <th className="num py-3 text-sm font-semibold text-gold-bright">Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave} className={"border-t border-imperium-line/60 " + (l.destaque ? "bg-imperium-bg/40 font-semibold text-stone-100" : "text-stone-300")}>
                <td className="py-2.5">{l.rotulo}</td>
                {negocios.map((n: DreNegocio) => (
                  <td key={n.slug} className="num py-2.5 tabular-nums">
                    {celula(n, l)}
                  </td>
                ))}
                <td className="num py-2.5 tabular-nums">{celula(total, l)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
        <summary className="cursor-pointer select-none text-[10px] uppercase tracking-widest text-stone-500 hover:text-stone-300">Fixos por pessoa</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {negocios.map((n) => (
            <div key={n.slug}>
              <p className="text-sm font-semibold" style={{ color: `rgb(${NEGOCIO_COR[n.slug] ?? "201 162 74"})` }}>
                {n.nome}
              </p>
              {n.fixos.length === 0 ? (
                <p className="mt-1 text-xs text-stone-500">Sem fixos.</p>
              ) : (
                <ul className="mt-1 divide-y divide-imperium-line text-sm">
                  {n.fixos.map((f) => (
                    <li key={f.nome} className="flex justify-between gap-2 py-1">
                      <span className="truncate text-stone-300">{f.nome}</span>
                      <span className="shrink-0 text-stone-100">{moeda(f.fixo)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </details>

      <div className="space-y-1 text-xs text-stone-500">
        <p>Receita é o que entrou no mês; comissões são as do mês, pagas no dia 15 do mês seguinte; fixos saem no dia 5. O custo do Diretor (R$ 10 mil) é dividido igualmente entre os negócios.</p>
        {temEstimado && <p>Maximus Energy: receita (80% da primeira fatura) e comissões lidas da Sunne, porque o negócio não grava vendas.</p>}
        {semRegra.length > 0 && <p className="text-amber-400">Sem regra de comissão: {semRegra.map((n) => n.nome).join(", ")}. A comissão aparece como zero.</p>}
        <p>Impostos, aluguel e tráfego não entram nesta visão (mesmo critério do Financeiro por Negócio).</p>
      </div>
    </main>
  );
}
