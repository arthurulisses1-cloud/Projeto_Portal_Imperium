import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hojeBR } from "@/lib/data-br";
import { COOKIE_NEGOCIO, NEGOCIO_COR, buscarNegociosVisiveis, negocioEmFoco, nomeEquipe } from "@/lib/negocios";
import { buscarDashboardNegocio, type MixCanal } from "@/lib/dashboard-negocio";
import { buscarComissoesNegocios } from "@/lib/comissao-negocio";
import type { StatusPace } from "@/lib/pace-negocio";

export const dynamic = "force-dynamic";

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const CANAL: Record<MixCanal["canal"], string> = { outbound: "Outbound", inbound: "Inbound", indicacao: "Indicação", sem_canal: "Sem canal" };
const STATUS: Record<StatusPace, { texto: string; classe: string }> = {
  sem_meta: { texto: "Sem meta", classe: "border-imperium-line text-stone-400" },
  adiantado: { texto: "Adiantado", classe: "border-success/50 text-success-bright" },
  no_ritmo: { texto: "No ritmo", classe: "border-amber-400/50 text-amber-400" },
  atrasado: { texto: "Atrasado", classe: "border-wine/60 text-wine-bright" },
  critico: { texto: "Crítico", classe: "border-wine/80 bg-wine/10 text-wine-bright" },
};

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function num(v: number) {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}
function dataCurta(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
function Barra({ valor, total, cor }: { valor: number; total: number; cor: string }) {
  const p = total > 0 ? Math.min(100, (valor / total) * 100) : 0;
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-imperium-raised">
      <div className="h-full rounded-full" style={{ width: `${p}%`, backgroundColor: `rgb(${cor})` }} />
    </div>
  );
}

export default async function NegocioDashboardPage({ searchParams }: { searchParams: { negocio?: string; mes?: string } }) {
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

  const atual = negocioEmFoco(searchParams.negocio ?? cookies().get(COOKIE_NEGOCIO)?.value, visiveis) ?? visiveis[0];
  const dados = await buscarDashboardNegocio(supabase, atual.slug, ano, mes, hoje);
  if (!dados) redirect("/");

  const ehGestor = eu.role === "diretor" || atual.cargo === "head";
  const comissao = ehGestor ? (await buscarComissoesNegocios(supabase, ano, mes, [atual.slug]))[0] : null;

  const { pace } = dados.pace;
  const cor = NEGOCIO_COR[atual.slug] ?? "201 162 74";
  const st = STATUS[pace.status];
  const pctMeta = pace.meta > 0 ? Math.round((pace.recebido / pace.meta) * 100) : null;
  const ant = mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
  const seg = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
  const mesParam = `${ano}-${String(mes).padStart(2, "0")}`;
  const totalMix = dados.vendas.mix.reduce((s, x) => s + x.valor, 0);
  const pessoasComVenda = dados.pace.pessoas.filter((p) => p.recebido > 0);

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {atual.equipe_bandeira && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={atual.equipe_bandeira} alt="" className="h-14 w-14 rounded-md object-cover" />
          )}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Dashboard do negócio · {MESES[mes]} de {ano}</p>
            <h1 className="font-display text-2xl" style={{ color: `rgb(${cor})` }}>
              {nomeEquipe(atual)}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/negocio?mes=${ant}&negocio=${atual.slug}`} className="rounded border border-imperium-line px-3 py-1 text-stone-300 hover:text-stone-100">
            ← {MESES[mes === 1 ? 12 : mes - 1]}
          </Link>
          <Link href={`/negocio?mes=${seg}&negocio=${atual.slug}`} className="rounded border border-imperium-line px-3 py-1 text-stone-300 hover:text-stone-100">
            {MESES[mes === 12 ? 1 : mes + 1]} →
          </Link>
        </div>
      </div>

      {visiveis.length > 1 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {visiveis.map((n) => (
            <Link
              key={n.id}
              href={`/negocio?mes=${mesParam}&negocio=${n.slug}`}
              className={`rounded border px-3 py-1 ${n.id === atual.id ? "border-gold text-stone-100" : "border-imperium-line text-stone-400 hover:text-stone-100"}`}
            >
              {nomeEquipe(n)}
            </Link>
          ))}
        </div>
      )}

      {/* Resultado */}
      <section className="rounded-lg border bg-imperium-surface p-4" style={{ borderColor: `rgb(${cor} / 0.55)` }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Recebido</p>
            <p className="text-3xl font-semibold text-stone-100">{moeda(pace.recebido)}</p>
            <p className="text-sm text-stone-400">{pace.meta > 0 ? `${pctMeta}% de ${moeda(pace.meta)} (meta do forecast)` : "sem meta de forecast neste mês"}</p>
          </div>
          <span className={`rounded border px-2 py-0.5 text-xs ${st.classe}`}>{st.texto}</span>
        </div>
        <div className="mt-3">
          <Barra valor={pace.recebido} total={pace.meta} cor={cor} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Deveria estar em</p>
            <p className="font-semibold text-stone-100">{pace.meta > 0 ? moeda(pace.esperadoAteHoje) : "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Projeção do mês</p>
            <p className="font-semibold text-stone-100">{pace.diasUteisDecorridos > 0 ? moeda(pace.projecao) : "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Falta por dia útil</p>
            <p className="font-semibold text-stone-100">{pace.necessarioPorDia === null || pace.meta <= 0 ? "—" : moeda(pace.necessarioPorDia)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Dias úteis</p>
            <p className="font-semibold text-stone-100">
              {pace.diasUteisDecorridos} de {pace.diasUteisTotal}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Vendas */}
        <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Vendas do mês</p>
          <div className="mt-2 flex items-end gap-6">
            <div>
              <p className="text-2xl font-semibold text-stone-100">{dados.vendas.qtd}</p>
              <p className="text-xs text-stone-500">lançamentos{dados.previsto ? ` · previstas ${num(dados.previsto.vendas)}` : ""}</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-stone-100">{dados.vendas.qtd > 0 ? moeda(dados.vendas.ticketMedio) : "—"}</p>
              <p className="text-xs text-stone-500">ticket médio recebido</p>
            </div>
          </div>
          <p className="mt-4 text-[10px] uppercase tracking-widest text-stone-500">Por canal</p>
          {dados.vendas.mix.length === 0 ? (
            <p className="mt-1 text-sm text-stone-500">Nenhuma venda lançada.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {dados.vendas.mix.map((x) => (
                <li key={x.canal}>
                  <div className="flex justify-between">
                    <span className="text-stone-300">
                      {CANAL[x.canal]} <span className="text-xs text-stone-500">· {x.qtd}</span>
                    </span>
                    <span className="text-stone-100">{moeda(x.valor)}</span>
                  </div>
                  <Barra valor={x.valor} total={totalMix} cor={cor} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Funil previsto */}
        <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Forecast do mês (com ramp-up)</p>
          {dados.previsto ? (
            <ul className="mt-2 space-y-1 text-sm">
              <li className="flex justify-between">
                <span className="text-stone-400">Vendas via outbound</span>
                <span className="text-stone-100">{num(dados.previsto.outbound)}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-stone-400">Vendas via inbound</span>
                <span className="text-stone-100">{num(dados.previsto.inbound)}</span>
              </li>
              {dados.previsto.referidos > 0 && (
                <li className="flex justify-between">
                  <span className="text-stone-400">Vendas por indicação</span>
                  <span className="text-stone-100">{num(dados.previsto.referidos)}</span>
                </li>
              )}
              <li className="flex justify-between border-t border-imperium-line pt-1 font-semibold">
                <span className="text-stone-300">Total previsto</span>
                <span className="text-stone-100">{num(dados.previsto.vendas)}</span>
              </li>
              <li className="flex justify-between text-xs text-stone-500">
                <span>Realizado até hoje</span>
                <span>{dados.vendas.qtd} lançamentos</span>
              </li>
            </ul>
          ) : (
            <p className="mt-2 text-sm text-stone-500">Este negócio ainda não tem forecast.</p>
          )}
        </section>
      </div>

      {/* Esforço */}
      <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">Esforço da equipe no mês (compromisso do dia)</p>
        {dados.esforco.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">Sem indicadores cadastrados.</p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {dados.esforco.map((e) => (
              <div key={e.chave}>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-200">{e.label}</span>
                  <span className="text-stone-100">
                    {num(e.realizado)} <span className="text-xs text-stone-500">de {num(e.meta)} comprometidos</span>
                  </span>
                </div>
                <Barra valor={e.realizado} total={e.meta} cor={cor} />
                {e.porPessoa.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer select-none text-[10px] uppercase tracking-widest text-stone-500 hover:text-stone-300">Por pessoa</summary>
                    <ul className="mt-1 text-xs text-stone-400">
                      {e.porPessoa.map((p) => (
                        <li key={p.nome} className="flex justify-between py-0.5">
                          <span>{p.nome}</span>
                          <span>
                            {num(p.realizado)} / {num(p.meta)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Ranking */}
        <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Quem mais recebeu no mês</p>
          {pessoasComVenda.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">Nenhum recebimento ainda.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {pessoasComVenda.slice(0, 8).map((p, i) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="w-5 text-xs text-stone-500">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-stone-200">{p.nome}</span>
                  <span className="text-stone-100">{moeda(p.recebido)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Últimos lançamentos + comissão */}
        <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          {comissao && (
            <div className="mb-3 border-b border-imperium-line pb-3">
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Comissões geradas no mês</p>
              <p className="text-lg font-semibold text-stone-100">
                {comissao.temRegra ? moeda(comissao.totalComissao) : "regra não definida"}
                {comissao.temRegra && comissao.recebido > 0 && (
                  <span className="ml-2 text-xs font-normal text-stone-500">{((comissao.totalComissao / comissao.recebido) * 100).toFixed(1)}% do recebido</span>
                )}
              </p>
            </div>
          )}
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Últimos recebimentos</p>
          {dados.ultimas.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">Nenhum lançamento.</p>
          ) : (
            <ul className="mt-2 divide-y divide-imperium-line text-sm">
              {dados.ultimas.map((u) => (
                <li key={u.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-10 shrink-0 text-xs text-stone-500">{dataCurta(u.data)}</span>
                  <span className="min-w-0 flex-1 truncate text-stone-300">
                    {u.vendedor}
                    {u.cliente ? ` · ${u.cliente}` : ""}
                  </span>
                  <span className="shrink-0 text-stone-100">{moeda(u.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
