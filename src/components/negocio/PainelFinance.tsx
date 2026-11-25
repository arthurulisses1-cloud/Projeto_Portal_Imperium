// Mural do Vorp Finance: os três paces (R$, entrevistas e subidos) e o funil em R$ por etapa.
// O executivo vê os dele e os leads dele; o Head, os do time, a tabela por pessoa e o funil de todos.
import type { DiaFinance, EtapaFunilFinance, PainelFinance } from "@/lib/finance-time";
import { ROTULO_STATUS } from "@/lib/head-negocio";
import type { PaceCalculado } from "@/lib/pace-negocio";
import { BarraMes, PaceEsforcoCard } from "@/components/negocio/PainelSdr";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

function Paces({ reais, entrevistas, subidos, cor, mesAtual, time = false, semReais = false, extra = null }: { extra?: PainelFinance["extra"]; reais: PaceCalculado; entrevistas: PaceCalculado; subidos: PaceCalculado; cor: string; mesAtual: boolean; time?: boolean; semReais?: boolean }) {
  return (
    <div className={`grid gap-4 ${semReais ? "md:grid-cols-2" : "lg:grid-cols-3"}`}>
      {!semReais && (
        <div className="space-y-1">
          <PaceEsforcoCard titulo={time ? "Recebido do time no mês" : "Seu recebido no mês"} p={reais} cor={cor} mesAtual={mesAtual} formato="moeda" ondeEstaPrimeiro />
          {time && extra && (extra.vendas > 0 || extra.recebido > 0) && (
            <p className="px-1 text-xs text-stone-400">
              Extra <span className="font-semibold text-stone-200">{moeda(extra.recebido)}</span>{" "}
              <span className="text-[11px] text-stone-500">· {extra.vendas} {extra.vendas === 1 ? "venda" : "vendas"} do Matri, sem o time do Finance · fora da meta</span>
            </p>
          )}
        </div>
      )}
      <PaceEsforcoCard titulo={time ? "Entrevistas do time" : "Suas entrevistas"} p={entrevistas} cor={cor} mesAtual={mesAtual} />
      <PaceEsforcoCard titulo={time ? "Subidos do time" : "Seus subidos"} p={subidos} cor={cor} mesAtual={mesAtual} />
    </div>
  );
}

/** Funil em R$: uma coluna por etapa, com a quantidade, o total e quem/quanto tem em cada lead. */
export function FunilFinanceCard({ funil, cor, mostrarQuem, titulo }: { funil: EtapaFunilFinance[]; cor: string; mostrarQuem: boolean; titulo: string }) {
  const totalGeral = funil.reduce((s, e) => s + e.total, 0);
  const qtd = funil.reduce((s, e) => s + e.leads.length, 0);
  return (
    <section className="rounded-lg border bg-imperium-surface p-4" style={{ borderColor: `rgb(${cor} / 0.55)` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">{titulo}</p>
        <p className="text-sm text-stone-400">
          {qtd} {qtd === 1 ? "lead" : "leads"} · <span className="font-semibold text-gold-bright">{moeda(totalGeral)}</span> de comissão prevista
        </p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {funil.map((e) => (
          <div key={e.chave} className="min-w-0 rounded border border-imperium-line p-3">
            <p className="text-[10px] uppercase tracking-widest text-stone-500">{e.label}</p>
            <p className="mt-0.5 text-2xl font-semibold text-stone-100">{e.leads.length}</p>
            <p className="text-xs text-gold-bright">{e.total > 0 ? moeda(e.total) : e.chave === "entrevista" ? "sem valor ainda" : "—"}</p>
            {e.leads.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs">
                {e.leads.slice(0, 5).map((l) => (
                  <li key={l.id} className="flex items-baseline justify-between gap-2" title={`${l.nome}${mostrarQuem ? " · " + l.quem : ""} · parado há ${l.dias}d`}>
                    <span className="min-w-0 truncate text-stone-300">
                      {l.nome}
                      {mostrarQuem && <span className="text-stone-500"> · {l.quem.split(" ")[0]}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-stone-400">{l.valor !== null ? moeda(l.valor) : "—"}</span>
                  </li>
                ))}
                {e.leads.length > 5 && (
                  <li>
                    <details>
                      <summary className="cursor-pointer text-[11px] text-stone-500 hover:text-stone-300">+ {e.leads.length - 5} leads</summary>
                      <ul className="mt-1 space-y-1">
                        {e.leads.slice(5).map((l) => (
                          <li key={l.id} className="flex items-baseline justify-between gap-2">
                            <span className="min-w-0 truncate text-stone-300">
                              {l.nome}
                              {mostrarQuem && <span className="text-stone-500"> · {l.quem.split(" ")[0]}</span>}
                            </span>
                            <span className="shrink-0 tabular-nums text-stone-400">{l.valor !== null ? moeda(l.valor) : "—"}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </li>
                )}
              </ul>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-stone-500">
        Leads abertos agora, por etapa. R$ = comissão prevista informada no Subido (na venda aguardando aprovação, a comissão pedida). A entrevista ainda não tem valor.
      </p>
    </section>
  );
}

/** Mural do executivo do Finance: os três paces de cara e o funil dos leads dele. */
export function MuralFinance({ painel, pessoaId, equipe, cor, mesLabel, mesAtual }: { painel: PainelFinance; pessoaId: string; equipe: string; cor: string; mesLabel: string; mesAtual: boolean }) {
  const eu = painel.pessoas.find((p) => p.id === pessoaId);
  const meuNome = eu?.nome ?? "";
  const meusLeads = painel.funil.map((e) => ({ ...e, leads: e.leads.filter((l) => l.quem === meuNome) })).map((e) => ({ ...e, total: e.leads.reduce((s, l) => s + (l.valor ?? 0), 0) }));
  const vazio = (p: PaceCalculado | null) => p ?? painel.equipe.reais;
  return (
    <div className="space-y-4">
      <p className="text-[10px] uppercase tracking-widest text-stone-500">
        Seu pace e seu funil · {equipe} · {mesLabel}
      </p>
      {mesAtual && <BarraMes p={painel.equipe.reais} cor={cor} />}
      {eu ? (
        <Paces reais={vazio(eu.paceReais)} entrevistas={eu.paceEntrevistas ?? painel.equipe.entrevistas} subidos={eu.paceSubidos ?? painel.equipe.subidos} cor={cor} mesAtual={mesAtual} />
      ) : (
        <p className="text-sm text-stone-400">Você ainda não aparece como executivo deste negócio.</p>
      )}
      <FunilFinanceCard funil={meusLeads} cor={cor} mostrarQuem={false} titulo="Seu funil em R$" />
      <p className="text-[11px] text-stone-500">
        Entrevistas e subidos do mês vêm dos seus leads; a meta de cada um é a do forecast dividida igualmente entre os executivos ({painel.metas.entrevistasPessoa} entrevistas e {painel.metas.subidosPessoa} subidos por pessoa).
      </p>
    </div>
  );
}

function Celula({ p, f }: { p: PaceCalculado | null; f: (v: number) => string }) {
  if (!p) return <span className="text-stone-600">—</span>;
  const cor = p.meta <= 0 || p.indice === null ? "text-stone-300" : p.indice >= 1 ? "text-success-bright" : p.indice >= 0.85 ? "text-amber-400" : "text-wine-bright";
  return (
    <span className={cor}>
      {f(p.recebido)} <span className="text-stone-500">/ {f(p.meta)}</span>
    </span>
  );
}

/** Mural do Head do Finance: paces do time, tabela por executivo e o funil de todos. */
export function MuralFinanceHead({ painel, equipe, cor, mesLabel, mesAtual, vendasParaAprovar, semReais = false }: { painel: PainelFinance; equipe: string; cor: string; mesLabel: string; mesAtual: boolean; vendasParaAprovar: number; /** Tela de Pace: o recebido já aparece no cartão do negócio. */ semReais?: boolean }) {
  const ordenadas = [...painel.pessoas].sort((a, b) => (a.paceReais?.indice ?? 99) - (b.paceReais?.indice ?? 99) || a.nome.localeCompare(b.nome, "pt-BR"));
  const atrasados = ordenadas.filter((p) => p.paceReais && (p.paceReais.status === "atrasado" || p.paceReais.status === "critico")).length;
  return (
    <div className="space-y-4">
      <p className="text-[10px] uppercase tracking-widest text-stone-500">
        Gestão do time · {equipe} · {mesLabel}
      </p>
      {mesAtual && !semReais && <BarraMes p={painel.equipe.reais} cor={cor} />}
      {vendasParaAprovar > 0 && (
        <a href="/leads" className="block rounded-lg border border-amber-400/50 bg-imperium-surface px-4 py-3 text-sm text-amber-400 hover:opacity-80">
          {vendasParaAprovar} {vendasParaAprovar === 1 ? "venda aguardando" : "vendas aguardando"} a sua aprovação · abrir Meus Leads →
        </a>
      )}
      <Paces reais={painel.equipe.reais} entrevistas={painel.equipe.entrevistas} subidos={painel.equipe.subidos} cor={cor} mesAtual={mesAtual} time semReais={semReais} extra={painel.extra} />
      <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Time · quem precisa de atenção</p>
          <p className={`text-xs ${atrasados > 0 ? "text-wine-bright" : "text-success-bright"}`}>
            {atrasados > 0 ? `${atrasados} ${atrasados === 1 ? "pessoa abaixo" : "pessoas abaixo"} do ritmo` : "todos no ritmo"}
          </p>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm [&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0 [&_td.num]:whitespace-nowrap">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-stone-500">
                <th className="py-1 text-left font-normal">Pessoa</th>
                <th className="py-1 text-right font-normal">Recebido</th>
                <th className="py-1 text-right font-normal">Entrevistas</th>
                <th className="py-1 text-right font-normal">Subidos</th>
                <th className="py-1 text-right font-normal">Ritmo (R$)</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((p) => (
                <tr key={p.id} className="border-t border-imperium-line/60">
                  <td className="py-1.5 text-stone-200">{p.nome}</td>
                  <td className="num py-1.5 text-right tabular-nums">
                    <Celula p={p.paceReais} f={moeda} />
                  </td>
                  <td className="num py-1.5 text-right tabular-nums">
                    <Celula p={p.paceEntrevistas} f={num} />
                  </td>
                  <td className="num py-1.5 text-right tabular-nums">
                    <Celula p={p.paceSubidos} f={num} />
                  </td>
                  <td className="py-1.5 text-right">
                    {p.paceReais ? <span className={`rounded border px-1.5 py-0.5 text-[10px] ${ROTULO_STATUS[p.paceReais.status].classe}`}>{ROTULO_STATUS[p.paceReais.status].texto}</span> : <span className="text-stone-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-stone-500">Ordenado de quem está mais longe do ritmo de recebido. As metas do forecast são divididas igualmente entre os executivos.</p>
      </section>
      <FunilFinanceCard funil={painel.funil} cor={cor} mostrarQuem titulo="Funil do time em R$" />
    </div>
  );
}

/** Pace diário de entrevistas e subidos: o que entrou em cada dia, o acumulado e onde deveria estar pela meta. */
export function TabelaPaceDiarioFinance({ dias, titulo }: { dias: DiaFinance[]; titulo: string }) {
  const recentes = [...dias].reverse();
  const cel = (acum: number, ideal: number) => {
    const cor = ideal <= 0 ? "text-stone-300" : acum >= ideal ? "text-success-bright" : acum >= ideal * 0.85 ? "text-amber-400" : "text-wine-bright";
    return (
      <span className={cor}>
        {num(acum)} <span className="text-stone-500">/ {ideal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span>
      </span>
    );
  };
  return (
    <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <p className="text-[10px] uppercase tracking-widest text-stone-500">{titulo}</p>
      {dias.length === 0 ? (
        <p className="mt-2 text-sm text-stone-500">O mês ainda não começou.</p>
      ) : (
        <div className="mt-2 max-h-[420px] overflow-auto">
          <table className="w-full min-w-[560px] text-sm [&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0 [&_td.num]:whitespace-nowrap">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-stone-500">
                <th className="py-1 text-left font-normal">Dia</th>
                <th className="py-1 text-right font-normal">Entrevistas no dia</th>
                <th className="py-1 text-right font-normal">Acumulado / ideal</th>
                <th className="py-1 text-right font-normal">Subidos no dia</th>
                <th className="py-1 text-right font-normal">Acumulado / ideal</th>
              </tr>
            </thead>
            <tbody>
              {recentes.map((d) => (
                <tr key={d.data} className="border-t border-imperium-line/60">
                  <td className="py-1.5 text-stone-300">
                    {d.data.slice(8)}/{d.data.slice(5, 7)}
                  </td>
                  <td className="num py-1.5 text-right tabular-nums text-stone-200">{d.entrevistas}</td>
                  <td className="num py-1.5 text-right tabular-nums">{cel(d.entrevistasAcum, d.entrevistasIdeal)}</td>
                  <td className="num py-1.5 text-right tabular-nums text-stone-200">{d.subidos}</td>
                  <td className="num py-1.5 text-right tabular-nums">{cel(d.subidosAcum, d.subidosIdeal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-stone-500">O ideal acumula a meta do mês pelos dias úteis; fim de semana e feriado não somam meta.</p>
    </section>
  );
}
