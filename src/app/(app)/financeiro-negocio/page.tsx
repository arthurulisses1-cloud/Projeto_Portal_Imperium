import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hojeBR } from "@/lib/data-br";
import { NEGOCIO_COR } from "@/lib/negocios";
import { buscarComissoesNegocios } from "@/lib/comissao-negocio";

export const dynamic = "force-dynamic";

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Custo mensal do Diretor, dividido igualmente entre os negócios ativos (pedido do Diretor, 2026-11-05). */
const CUSTO_DIRETOR = 10000;

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function mesAnterior(ano: number, mes: number) {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
}

export default async function FinanceiroNegocioPage({ searchParams }: { searchParams: { mes?: string } }) {
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
  const ant = mesAnterior(ano, mes);

  const [comissoes, comissoesAnt, { data: negocios }] = await Promise.all([
    buscarComissoesNegocios(supabase, ano, mes),
    buscarComissoesNegocios(supabase, ant.ano, ant.mes),
    supabase.from("negocios").select("id, slug").eq("status", "ativo"),
  ]);

  const ids = (negocios ?? []).map((n) => n.id);
  const { data: vinculos } = await supabase
    .from("profile_negocios")
    .select("negocio_id, cargo, fixo, profiles!inner(id, full_name, ativo)")
    .in("negocio_id", ids)
    .not("fixo", "is", null);
  type V = { negocio_id: string; cargo: string; fixo: number; profiles: { id: string; full_name: string; ativo: boolean } | { id: string; full_name: string; ativo: boolean }[] };
  const slugPorId = new Map((negocios ?? []).map((n) => [n.id as string, n.slug as string]));
  const fixosPor = new Map<string, { nome: string; cargo: string; fixo: number }[]>();
  for (const v of (vinculos ?? []) as unknown as V[]) {
    const p = Array.isArray(v.profiles) ? v.profiles[0] : v.profiles;
    if (!p?.ativo) continue;
    const slug = slugPorId.get(v.negocio_id);
    if (!slug) continue;
    const arr = fixosPor.get(slug) ?? [];
    arr.push({ nome: p.full_name, cargo: v.cargo, fixo: Number(v.fixo) });
    fixosPor.set(slug, arr);
  }

  const custoDiretorPorNegocio = comissoes.length > 0 ? CUSTO_DIRETOR / comissoes.length : 0;
  const linhas = comissoes.map((c) => {
    const fixos = (fixosPor.get(c.slug) ?? []).sort((a, b) => b.fixo - a.fixo);
    const totalFixos = fixos.reduce((s, f) => s + f.fixo, 0);
    const resultado = c.recebido - totalFixos - c.totalComissao - custoDiretorPorNegocio;
    return { c, fixos, totalFixos, resultado };
  });

  const recebido = linhas.reduce((s, l) => s + l.c.recebido, 0);
  const totalFixos = linhas.reduce((s, l) => s + l.totalFixos, 0);
  const totalComissoes = linhas.reduce((s, l) => s + l.c.totalComissao, 0);
  const resultado = recebido - totalFixos - totalComissoes - CUSTO_DIRETOR;
  const comissaoAnteriorAPagar = comissoesAnt.reduce((s, c) => s + c.totalComissao, 0);

  const antLink = `${ant.ano}-${String(ant.mes).padStart(2, "0")}`;
  const seg = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Financeiro por negócio</h1>
          <p className="mt-1 text-sm text-stone-400">
            {MESES[mes]} de {ano} · recebido menos fixos, comissões e a parte de cada negócio no custo do Diretor.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/financeiro-negocio?mes=${antLink}`} className="rounded border border-imperium-line px-3 py-1 text-stone-300 hover:text-stone-100">
            ← {MESES[ant.mes]}
          </Link>
          <Link href={`/financeiro-negocio?mes=${seg}`} className="rounded border border-imperium-line px-3 py-1 text-stone-300 hover:text-stone-100">
            {MESES[mes === 12 ? 1 : mes + 1]} →
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Caixa a pagar em {MESES[mes]}</p>
          <p className="mt-2 flex justify-between text-sm text-stone-300">
            <span>Dia 5 · fixos</span>
            <span className="text-stone-100">{moeda(totalFixos)}</span>
          </p>
          <p className="flex justify-between text-sm text-stone-300">
            <span>Dia 15 · comissões de {MESES[ant.mes]}</span>
            <span className="text-stone-100">{moeda(comissaoAnteriorAPagar)}</span>
          </p>
          <p className="mt-2 flex justify-between border-t border-imperium-line pt-2 text-sm font-semibold text-gold-bright">
            <span>Total do mês</span>
            <span>{moeda(totalFixos + comissaoAnteriorAPagar)}</span>
          </p>
        </div>
        <div className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Resultado de {MESES[mes]} (competência)</p>
          <p className={`mt-2 text-2xl font-semibold ${resultado >= 0 ? "text-success-bright" : "text-wine-bright"}`}>{moeda(resultado)}</p>
          <p className="text-xs text-stone-500">
            Recebido {moeda(recebido)} − fixos {moeda(totalFixos)} − comissões {moeda(totalComissoes)} − Diretor {moeda(CUSTO_DIRETOR)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {linhas.map(({ c, fixos, totalFixos: tf, resultado: res }) => {
          const cor = NEGOCIO_COR[c.slug] ?? "201 162 74";
          return (
            <section key={c.slug} className="rounded-lg border bg-imperium-surface p-4" style={{ borderColor: `rgb(${cor} / 0.55)` }}>
              <p className="text-base font-semibold" style={{ color: `rgb(${cor})` }}>
                {c.equipeNome || c.nome}
              </p>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-stone-400">Recebido</dt>
                  <dd className="text-stone-100">{moeda(c.recebido)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone-400">Fixos (dia 5)</dt>
                  <dd className="text-stone-100">− {moeda(tf)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone-400">
                    Comissões (dia 15 de {MESES[mes === 12 ? 1 : mes + 1]})
                    {!c.temRegra && <span className="ml-1 text-xs text-amber-400">sem regra</span>}
                  </dt>
                  <dd className="text-stone-100">− {moeda(c.totalComissao)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-stone-400">Custo do Diretor (rateio)</dt>
                  <dd className="text-stone-100">− {moeda(custoDiretorPorNegocio)}</dd>
                </div>
                <div className="flex justify-between border-t border-imperium-line pt-1 font-semibold">
                  <dt className="text-stone-300">Resultado</dt>
                  <dd className={res >= 0 ? "text-success-bright" : "text-wine-bright"}>{moeda(res)}</dd>
                </div>
              </dl>
              {fixos.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer select-none text-[10px] uppercase tracking-widest text-stone-500 hover:text-stone-300">
                    Fixos por pessoa
                  </summary>
                  <ul className="mt-2 divide-y divide-imperium-line text-sm">
                    {fixos.map((f) => (
                      <li key={f.nome} className="flex justify-between py-1">
                        <span className="text-stone-300">{f.nome}</span>
                        <span className="text-stone-100">{moeda(f.fixo)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          );
        })}
      </div>
      <p className="text-xs text-stone-500">
        Fixos e comissões a pagar seguem o calendário: fixo no dia 5 e comissão no dia 15 do mês seguinte ao recebimento. Referência: {pad(mes)}/{ano}.
      </p>
    </main>
  );
}
