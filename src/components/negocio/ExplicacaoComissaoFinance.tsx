import { FINANCE } from "@/lib/comissao-negocio";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** "Como é calculada a sua comissão" do Vorp Finance. Os percentuais vêm da mesma regra que calcula o pagamento. */
export default function ExplicacaoComissaoFinance({ completo = false }: { completo?: boolean }) {
  const { margemBase, base, desagio } = FINANCE;
  // Exemplo: desembolso (valor pago ao cliente) de R$ 100.000 e comissão recebida de R$ 10.000.
  const desembolso = 100000;
  const comissaoRecebida = 10000;
  const margem = (desembolso * margemBase) / 100;
  const sobra = Math.max(0, comissaoRecebida - margem);
  const baseExec = (margem * base.comExecutivo.executivo) / 100;
  const desagioExec = (sobra * desagio.comExecutivo.executivo) / 100;

  return (
    <details className="rounded-lg border border-imperium-line bg-imperium-surface p-4" open>
      <summary className="cursor-pointer text-sm font-semibold text-gold-bright">Como sua comissão é calculada · Vorp Finance</summary>
      <div className="mt-3 space-y-4 text-sm text-stone-300">
        <p>
          A comissão sai do valor que a Vorp <strong>recebe</strong> na venda e é paga no <strong>dia 15 do mês seguinte</strong>. Ela tem duas partes: a{" "}
          <strong>comissão base</strong>, sobre a margem padrão, e o <strong>deságio</strong>, sobre o que passar dela.
        </p>

        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">1 · Margem base</p>
          <p className="mt-1">
            A margem é <strong>{margemBase}% do valor de desembolso</strong> (o que pagamos ao cliente). Essa é a margem que a empresa quer em toda operação, e ela não muda.
          </p>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">2 · Comissão base</p>
          {completo ? (
            <p className="mt-1">
              Da margem, <strong>25%</strong> é dividido entre o time: <strong>{base.comExecutivo.executivo}% para o executivo</strong>, {base.comExecutivo.lider}% para o líder e{" "}
              {base.comExecutivo.diretor}% para o diretor. Quando o próprio líder vende, ele fica com {base.liderVendendo.lider}% e o diretor com {base.liderVendendo.diretor}%.
            </p>
          ) : (
            <p className="mt-1">
              A sua comissão base é de <strong>{base.comExecutivo.executivo}% da margem</strong> de cada venda sua.
            </p>
          )}
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-widest text-stone-500">3 · Deságio</p>
          {completo ? (
            <p className="mt-1">
              Tudo o que a comissão recebida <strong>passar dos {margemBase}%</strong> de margem é deságio, e ele paga melhor:{" "}
              <strong>{desagio.comExecutivo.executivo}% para o executivo</strong>, {desagio.comExecutivo.lider}% para o líder e {desagio.comExecutivo.diretor}% para o diretor (líder
              vendendo: {desagio.liderVendendo.lider}% para ele e {desagio.liderVendendo.diretor}% para o diretor). Se a comissão ficar <strong>igual ou abaixo</strong> de {margemBase}%,
              não há deságio.
            </p>
          ) : (
            <p className="mt-1">
              Tudo o que a comissão recebida <strong>passar dos {margemBase}%</strong> de margem é deságio, e ele paga melhor: você recebe{" "}
              <strong>{desagio.comExecutivo.executivo}% do deságio</strong>. Se a comissão ficar <strong>igual ou abaixo</strong> de {margemBase}%, não há deságio.
            </p>
          )}
        </div>

        <div className="rounded border border-imperium-line/70 bg-imperium-bg/40 p-3">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Exemplo</p>
          <ul className="mt-1.5 space-y-1 text-xs text-stone-400">
            <li>
              Desembolso de <span className="text-stone-200">{moeda(desembolso)}</span> → margem base de {margemBase}% = <span className="text-stone-200">{moeda(margem)}</span>
            </li>
            <li>
              Comissão recebida: <span className="text-stone-200">{moeda(comissaoRecebida)}</span> → deságio = {moeda(comissaoRecebida)} − {moeda(margem)} ={" "}
              <span className="text-stone-200">{moeda(sobra)}</span>
            </li>
            <li>
              Executivo: {base.comExecutivo.executivo}% de {moeda(margem)} = {moeda(baseExec)} (base) + {desagio.comExecutivo.executivo}% de {moeda(sobra)} = {moeda(desagioExec)} (deságio) ={" "}
              <span className="font-semibold text-gold-bright">{moeda(baseExec + desagioExec)}</span>
            </li>
          </ul>
        </div>

        <p className="text-xs text-stone-500">
          Para chegar nesses números, a venda precisa estar aprovada pelo Head. Se você participou de uma venda do Finance sendo de outra equipe, o valor aparece abaixo como &quot;a receber do Vorp Finance&quot;.
        </p>
      </div>
    </details>
  );
}
