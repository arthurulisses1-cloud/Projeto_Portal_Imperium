// "Seu mês": o fixo, a comissão (vendas e recorrência) e o bônus de conduta de quem vê a tela, para ele saber quanto ganha no mês no total.
import type { MeuFixo } from "@/lib/dre-negocios";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

export default function ResumoMesPessoal({
  mesLabel,
  fixo,
  vendas,
  recorrencia,
  jaPago,
}: {
  mesLabel: string;
  fixo: MeuFixo;
  /** Comissão das vendas do mês (todos os negócios em que participou). */
  vendas: number;
  /** Recorrência por mês dos contratos ativos da carteira. */
  recorrencia: number;
  /** Parte da comissão que já foi paga antecipadamente. */
  jaPago: number;
}) {
  const variavel = vendas + recorrencia;
  const total = fixo.totalFixo + variavel + fixo.bonusAplicado;
  const potencial = fixo.bonusEmAberto;
  const temBonus = fixo.itens.some((i) => i.bonus > 0);
  return (
    <section className="rounded-lg border border-gold/40 bg-imperium-surface p-4">
      <p className="text-[10px] uppercase tracking-widest text-stone-500">Seu mês · {mesLabel} · fixo + variável</p>
      <p className="mt-1 text-2xl font-semibold text-gold-bright">{moeda(total)}</p>
      <p className="text-xs text-stone-500">{potencial > 0 ? `com o bônus de conduta liberado, até ${moeda(total + potencial)}` : "o que você ganha no mês somando o fixo e a comissão"}</p>

      <ul className="mt-3 divide-y divide-imperium-line text-sm">
        {fixo.itens.length === 0 ? (
          <li className="flex justify-between py-1.5">
            <span className="text-stone-400">Fixo</span>
            <span className="text-stone-500">sem fixo cadastrado</span>
          </li>
        ) : (
          fixo.itens.map((i) => (
            <li key={i.negocio} className="flex justify-between py-1.5">
              <span className="text-stone-300">
                Fixo{fixo.itens.length > 1 ? ` · ${i.negocio}` : ""} <span className="text-[11px] text-stone-500">pago no dia 5</span>
              </span>
              <span className="text-stone-100">{moeda(i.fixo)}</span>
            </li>
          ))
        )}
        <li className="flex justify-between py-1.5">
          <span className="text-stone-300">
            Comissão das vendas <span className="text-[11px] text-stone-500">paga no dia 15 do mês seguinte</span>
          </span>
          <span className="text-stone-100">{moeda(vendas)}</span>
        </li>
        {recorrencia > 0 && (
          <li className="flex justify-between py-1.5">
            <span className="text-stone-300">
              Recorrência da carteira <span className="text-[11px] text-stone-500">contratos ativos, por mês</span>
            </span>
            <span className="text-stone-100">{moeda(recorrencia)}</span>
          </li>
        )}
        {temBonus && (
          <li className="flex justify-between gap-3 py-1.5">
            <span className="text-stone-300">
              Bônus de conduta <span className="text-[11px] text-stone-500">liberado no fim do mês, depois da análise de conduta, horários e faltas</span>
            </span>
            <span className={`shrink-0 ${fixo.bonusAplicado > 0 ? "text-success-bright" : fixo.bonusNaoLiberado > 0 && fixo.bonusEmAberto === 0 ? "text-stone-600 line-through" : "text-amber-400"}`}>
              {fixo.bonusAplicado > 0 ? `+ ${moeda(fixo.bonusAplicado)} liberado` : fixo.bonusNaoLiberado > 0 && fixo.bonusEmAberto === 0 ? `${moeda(fixo.bonusNaoLiberado)} não liberado` : `até ${moeda(fixo.bonusEmAberto)}`}
            </span>
          </li>
        )}
      </ul>
      {jaPago > 0 && <p className="mt-2 text-[11px] text-stone-500">Já recebido antecipadamente: {moeda(jaPago)} (está dentro da comissão das vendas).</p>}
    </section>
  );
}
