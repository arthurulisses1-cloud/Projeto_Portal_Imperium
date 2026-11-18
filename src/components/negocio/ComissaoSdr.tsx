// Comissão do mês do SDR da Acrópole (Vorp): regras, RQA, comissão de venda padrão e carteira de recorrência.
import { percentuais } from "@/lib/comissao-negocio";
import { RQA_VALOR, recorrenciaDaVenda, type ContratoCarteira, type ResumoReunioes, type StatusRqa } from "@/lib/sdr-negocio";
import type { ItemComissao } from "@/lib/comissao-negocio";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}
const dataCurta = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
const CANAL: Record<string, string> = { outbound: "Outbound", inbound: "Tráfego Pago", indicacao: "Referido", alternativo: "Canal alternativo" };

/** % do SDR e do closer na Vorp, lidos da mesma regra que calcula o pagamento. */
export function pctVorp(papel: "sdr" | "closer", canal: string | null): number {
  const p = percentuais("vorp", {
    id: "",
    valor: 0,
    canal: canal === "outbound" ? "outbound" : "inbound",
    closerId: "x",
    closerCargo: "executivo",
    indicadorId: "y",
  });
  return p ? (papel === "sdr" ? p.sdr : p.closer) : 0;
}

/** % do pré-vendas/BDR e do executivo de um negócio, lidos da mesma regra que calcula o pagamento (Match: o % do executivo muda com BDR). */
export function pctNegocio(slug: string) {
  return (papel: "sdr" | "closer", canal: string | null, comIndicador = true): number => {
    const p = percentuais(slug, {
      id: "",
      valor: 0,
      canal: canal === "outbound" ? "outbound" : "inbound",
      closerId: "x",
      closerCargo: "executivo",
      indicadorId: comIndicador || slug === "vorp" ? "y" : null,
    });
    return p ? (papel === "sdr" ? (slug === "matchsales" ? p.bdr : p.sdr) : p.closer) : 0;
  };
}

/** "Como sua comissão é calculada" do Match Sales (Galácticos), para o BDR ou o executivo. */
export function ExplicacaoComissaoMatch({ papel }: { papel: "bdr" | "executivo" }) {
  const p = pctNegocio("matchsales");
  const sem = (c: string) => pctNegocio("matchsales")("closer", c, false);
  return (
    <details className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <summary className="cursor-pointer text-sm font-semibold text-gold-bright">Como sua comissão é calculada · Galácticos</summary>
      <div className="mt-3 space-y-4 text-sm text-stone-300">
        {papel === "bdr" ? (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">1 · Comissão de venda</p>
            <p className="mt-1">
              Quando uma reunião que você agendou vira venda, você recebe <strong>{p("sdr", "outbound")}%</strong> sobre o valor recebido da venda (setup e mensalidade, conforme cada
              recebimento).
            </p>
          </div>
        ) : (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">1 · Comissão de venda</p>
            <p className="mt-1">
              Em cada venda sua, você recebe <strong>{sem("outbound")}% no outbound</strong> e <strong>{sem("inbound")}% no inbound</strong> sobre o valor recebido. Se a reunião
              veio de um BDR, o seu % passa a ser <strong>{p("closer", "outbound", true)}%</strong> e o BDR fica com {p("sdr", "outbound")}%.
            </p>
          </div>
        )}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">2 · Recorrência</p>
          <p className="mt-1">
            A comissão segue a cada recebimento do cliente da sua carteira e termina quando o contrato deixa de ser lançado (cancelamento ou encerramento). Não há teto de 3 meses no
            Match Sales.
          </p>
        </div>
        <p className="text-xs text-stone-500">O pagamento sai no dia 15 do mês seguinte ao recebimento.</p>
      </div>
    </details>
  );
}

/** "Como sua comissão é calculada" da Acrópole, para o SDR. */
export function ExplicacaoComissaoVorp() {
  const out = pctVorp("sdr", "outbound");
  const inb = pctVorp("sdr", "inbound");
  const rqa = RQA_VALOR.vorp;
  return (
    <details className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <summary className="cursor-pointer text-sm font-semibold text-gold-bright">Como sua comissão é calculada · Acrópole</summary>
      <div className="mt-3 space-y-4 text-sm text-stone-300">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">1 · RQA (Reunião Qualificada Agendada)</p>
          <p className="mt-1">
            Cada reunião que você agendou, que foi <strong>realizada</strong> e que o closer <strong>validou como RQA</strong> no Pipefácil paga{" "}
            <strong>{moeda(rqa.outbound)} no outbound</strong> e <strong>{moeda(rqa.inbound)} no inbound</strong>. Reunião sem validação fica como &quot;aguardando&quot; e entra
            quando o closer validar; a validação fecha no fim do mês.
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">2 · Comissão de venda</p>
          <p className="mt-1">
            Quando uma reunião sua vira venda, você recebe <strong>{out}% no outbound</strong> e <strong>{inb}% no inbound</strong> sobre o valor recebido. Se o cliente
            antecipa, a base vai até <strong>3 × o MRR</strong>, e só o <strong>1º contrato</strong> do cliente paga comissão.
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">3 · Recorrência</p>
          <p className="mt-1">
            A comissão segue a cada MRR recebido dos clientes da sua carteira e termina quando o contrato deixa de ser lançado (cancelamento ou encerramento).
          </p>
        </div>
        <p className="text-xs text-stone-500">O pagamento sai no dia 15 do mês seguinte ao recebimento.</p>
      </div>
    </details>
  );
}

/** "Como sua comissão é calculada" da Acrópole, para o Closer. */
export function ExplicacaoComissaoCloserVorp() {
  const out = pctVorp("closer", "outbound");
  const inb = pctVorp("closer", "inbound");
  return (
    <details className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <summary className="cursor-pointer text-sm font-semibold text-gold-bright">Como sua comissão é calculada · Acrópole</summary>
      <div className="mt-3 space-y-4 text-sm text-stone-300">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">1 · Comissão de venda</p>
          <p className="mt-1">
            Em cada venda que você fecha, você recebe <strong>{out}% no outbound</strong> e <strong>{inb}% no inbound</strong> (indicação conta como inbound) sobre o valor
            recebido da venda.
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">2 · Antecipado e 1º contrato</p>
          <p className="mt-1">
            Se o cliente paga antecipado, a base da comissão vai até <strong>3 × o MRR</strong> (teto de 3 meses). Só o <strong>1º contrato</strong> do cliente paga comissão de venda.
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">3 · Recorrência</p>
          <p className="mt-1">
            A comissão segue a cada MRR recebido dos clientes da sua carteira e termina quando o contrato deixa de ser lançado (cancelamento ou encerramento). A carteira está
            logo abaixo.
          </p>
        </div>
        <p className="text-xs text-stone-500">O pagamento sai no dia 15 do mês seguinte ao recebimento.</p>
      </div>
    </details>
  );
}

/** O que está gerando a comissão do mês: uma linha por venda, com o valor recebido, se gera recorrência e a comissão. */
export function TabelaComissaoMes({ itens, hoje, detectarPrepago }: { itens: ItemComissao[]; hoje: string; detectarPrepago: boolean }) {
  const linhas = itens.slice().sort((a, b) => (a.data < b.data ? 1 : -1));
  const total = linhas.reduce((s, l) => s + l.valor, 0);
  return (
    <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">O que gera a sua comissão no mês</p>
        <p className="text-sm text-stone-400">
          {linhas.length} {linhas.length === 1 ? "venda" : "vendas"} · <span className="font-semibold text-gold-bright">{moeda(total)}</span>
        </p>
      </div>
      {linhas.length === 0 ? (
        <p className="mt-2 text-sm text-stone-500">Nenhuma venda sua gerou comissão neste mês ainda.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm [&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0 [&_td.num]:whitespace-nowrap [&_th]:whitespace-nowrap">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-stone-500">
                <th className="py-1 text-left font-normal">Cliente</th>
                <th className="py-1 text-right font-normal">Valor recebido</th>
                <th className="py-1 text-left font-normal">Gera recorrência?</th>
                <th className="py-1 text-right font-normal">Seu %</th>
                <th className="py-1 text-right font-normal">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, idx) => {
                const r = recorrenciaDaVenda(l, hoje, detectarPrepago);
                return (
                  <tr key={l.vendaId + idx} className="border-t border-imperium-line/60">
                    <td className="py-1.5 text-stone-200">
                      {l.cliente ?? "—"} <span className="text-[11px] text-stone-600">· {dataCurta(l.data)}</span>
                    </td>
                    <td className="num py-1.5 text-right tabular-nums text-stone-300">{moeda(l.recebido)}</td>
                    <td className={"max-w-[280px] py-1.5 text-xs leading-snug " + (r.gera ? "text-success-bright" : "text-amber-400")}>{r.texto}</td>
                    <td className="num py-1.5 text-right tabular-nums text-stone-400">{l.pct}%</td>
                    <td className="num py-1.5 text-right tabular-nums text-stone-100">{moeda(l.valor)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-imperium-line font-semibold text-stone-200">
                <td className="py-1.5">Total</td>
                <td className="num py-1.5 text-right tabular-nums">{moeda(linhas.reduce((s, l) => s + l.recebido, 0))}</td>
                <td />
                <td />
                <td className="num py-1.5 text-right tabular-nums text-gold-bright">{moeda(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-stone-500">
        A comissão é sobre o valor recebido de cada venda. Cliente que antecipa o plano todo já gera a comissão toda agora, e a recorrência só começa depois do período pago.
      </p>
    </section>
  );
}

const SELO: Record<StatusRqa, { texto: string; classe: string }> = {
  validada: { texto: "RQA validada", classe: "border-success/50 text-success-bright" },
  aguardando: { texto: "Aguardando validação", classe: "border-amber-400/50 text-amber-400" },
  recusada: { texto: "Não é RQA", classe: "border-wine/60 text-wine-bright" },
};

/** Resumo do que a pessoa tem a receber no mês e as reuniões realizadas com o status da RQA. */
export function PainelComissaoSdr({
  reunioes,
  comissaoVendas,
  carteira,
  atualizadoEm,
  papel = "sdr",
  temRqa = true,
  itens,
  hoje,
  detectarPrepago = false,
}: {
  /** Linhas de comissão do mês da pessoa (para a tabela "o que gera a sua comissão"). */
  itens?: ItemComissao[];
  hoje?: string;
  detectarPrepago?: boolean;
  papel?: "sdr" | "closer";
  /** Só a Acrópole paga RQA; nos outros negócios a tela é só de vendas e carteira. */
  temRqa?: boolean;
  reunioes: ResumoReunioes | null;
  comissaoVendas: number;
  carteira: ContratoCarteira[];
  atualizadoEm: string | null;
}) {
  const rqa = reunioes?.rqa ?? { validadas: 0, aguardando: 0, recusadas: 0, valorValidado: 0, valorAguardando: 0 };
  const ativos = carteira.filter((c) => c.ativo);
  const antecipados = carteira.filter((c) => c.antecipado);
  const closer = papel === "closer" || !temRqa;
  const recorrenciaMes = ativos.reduce((s, c) => s + c.porMes, 0);
  return (
    <div className="space-y-4">
      {closer && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Comissão de vendas</p>
            <p className="mt-1 text-2xl font-semibold text-stone-100">{moeda(comissaoVendas)}</p>
            <p className="text-xs text-stone-500">vendas que você fechou no mês</p>
          </div>
          <div className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Recorrência por mês</p>
            <p className="mt-1 text-2xl font-semibold text-stone-100">{moeda(recorrenciaMes)}</p>
            <p className="text-xs text-stone-500">
              {ativos.length} {ativos.length === 1 ? "contrato ativo" : "contratos ativos"} na carteira
            </p>
          </div>
          <div className="rounded-lg border border-gold/40 bg-imperium-surface p-4">
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Total do mês</p>
            <p className="mt-1 text-2xl font-semibold text-gold-bright">{moeda(comissaoVendas)}</p>
            <p className="text-xs text-stone-500">a recorrência entra conforme cada MRR for recebido</p>
          </div>
        </div>
      )}
      {!closer && (
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">RQA a receber</p>
          <p className="mt-1 text-2xl font-semibold text-gold-bright">{moeda(rqa.valorValidado)}</p>
          <p className="text-xs text-stone-500">
            {rqa.validadas} validadas · {rqa.aguardando} aguardando ({moeda(rqa.valorAguardando)})
          </p>
        </div>
        <div className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Comissão de vendas</p>
          <p className="mt-1 text-2xl font-semibold text-stone-100">{moeda(comissaoVendas)}</p>
          <p className="text-xs text-stone-500">regra padrão, detalhe abaixo</p>
        </div>
        <div className="rounded-lg border border-gold/40 bg-imperium-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Total do mês</p>
          <p className="mt-1 text-2xl font-semibold text-gold-bright">{moeda(rqa.valorValidado + comissaoVendas)}</p>
          <p className="text-xs text-stone-500">+ {moeda(rqa.valorAguardando)} se as RQA pendentes forem validadas</p>
        </div>
      </div>
      )}

      {!closer && (
      <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Reuniões realizadas no mês · RQA</p>
          {atualizadoEm && <p className="text-[10px] text-stone-600">CRM lido em {new Date(atualizadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>}
        </div>
        {!reunioes || reunioes.realizadas.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">{reunioes ? "Nenhuma reunião sua foi realizada neste mês." : "Não achamos você no CRM; as RQA não puderam ser lidas."}</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm [&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0 [&_td.num]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-stone-500">
                  <th className="py-1 text-left font-normal">Lead</th>
                  <th className="py-1 text-left font-normal">Canal</th>
                  <th className="py-1 text-left font-normal">Agendada</th>
                  <th className="py-1 text-left font-normal">Realizada</th>
                  <th className="py-1 text-left font-normal">Closer</th>
                  <th className="py-1 text-left font-normal">Status</th>
                  <th className="py-1 text-right font-normal">Valor</th>
                </tr>
              </thead>
              <tbody>
                {reunioes.realizadas.map((r) => (
                  <tr key={r.id} className="border-t border-imperium-line/60">
                    <td className="py-1.5 text-stone-200">
                      {r.nome}
                      {r.empresa && r.empresa !== r.nome && <span className="text-stone-500"> · {r.empresa}</span>}
                    </td>
                    <td className="py-1.5 text-stone-400">{CANAL[r.canal] ?? r.canal}</td>
                    <td className="py-1.5 text-stone-400">{dataCurta(r.agendadaEm)}</td>
                    <td className="py-1.5 text-stone-400">{dataCurta(r.realizadaEm)}</td>
                    <td className="py-1.5 text-stone-400">{r.closer ?? "—"}</td>
                    <td className="py-1.5">
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] ${SELO[r.rqa].classe}`}>{SELO[r.rqa].texto}</span>
                    </td>
                    <td className={`py-1.5 text-right tabular-nums ${r.rqa === "validada" ? "text-stone-100" : "text-stone-600"}`}>{moeda(r.valorRqa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {itens && hoje && <TabelaComissaoMes itens={itens} hoje={hoje} detectarPrepago={detectarPrepago} />}

      <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Minha carteira · recorrência</p>
          <p className="text-xs text-stone-400">
            {ativos.length} {ativos.length === 1 ? "contrato ativo" : "contratos ativos"} · <span className="text-gold-bright">{moeda(ativos.reduce((s, c) => s + c.porMes, 0))}</span> por mês
            {antecipados.length > 0 && <span className="text-stone-500"> · {antecipados.length} pago{antecipados.length === 1 ? "" : "s"} antecipado{antecipados.length === 1 ? "" : "s"}</span>}
          </p>
        </div>
        {carteira.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">Nenhum contrato com MRR na sua carteira ainda.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm [&_th]:px-3 [&_td]:px-3 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0 [&_td.num]:whitespace-nowrap [&_th]:whitespace-nowrap">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-stone-500">
                  <th className="py-1 text-left font-normal">Cliente</th>
                  <th className="py-1 text-left font-normal">Desde</th>
                  <th className="py-1 text-left font-normal">Último lançamento</th>
                  <th className="py-1 text-right font-normal">MRR</th>
                  <th className="py-1 text-right font-normal">Seu %</th>
                  <th className="py-1 text-right font-normal">Por mês</th>
                  <th className="py-1 text-right font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {carteira.map((c) => (
                  <tr key={c.chave} className={`border-t border-imperium-line/60 ${c.ativo || c.antecipado || c.sinal ? "" : "opacity-50"}`}>
                    <td className="py-1.5 text-stone-200">
                      {c.cliente} <span className="text-[11px] text-stone-500">· {c.papel === "sdr" ? "você agendou" : "você fechou"}</span>
                    </td>
                    <td className="py-1.5 text-stone-400">{c.desde.slice(8)}/{c.desde.slice(5, 7)}/{c.desde.slice(0, 4)}</td>
                    <td className="py-1.5 text-stone-400">{dataCurta(c.ultimo)}</td>
                    <td className="num py-1.5 text-right tabular-nums text-stone-300">{moeda(c.mrr)}</td>
                    <td className="num py-1.5 text-right tabular-nums text-stone-400">{c.pct}%</td>
                    <td className="num py-1.5 text-right tabular-nums text-stone-100">{c.antecipado || c.sinal ? "—" : moeda(c.porMes)}</td>
                    <td className={`max-w-[240px] py-1.5 text-right text-xs leading-snug ${c.ativo ? "text-success-bright" : c.antecipado || c.sinal ? "text-amber-400" : "text-stone-500"}`}>
                      {c.antecipado && c.pagoAte
                        ? `Pago ${c.mesesPagos} meses · recorrência a partir de ${c.pagoAte.slice(5, 7)}/${c.pagoAte.slice(0, 4)}`
                        : c.sinal
                          ? "Sinal pago · aguarda o restante"
                          : c.ativo
                          ? "Ativo"
                          : "Sem lançamento"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-stone-500">Ativo = contrato com recebimento lançado neste mês ou no anterior. &quot;Por mês&quot; = MRR × o seu %. Plano semestral ou anual pago de uma vez (Match Sales) já está pago no recebimento da venda: a recorrência só começa depois do período pago, se o cliente renovar.</p>
      </section>
    </div>
  );
}
