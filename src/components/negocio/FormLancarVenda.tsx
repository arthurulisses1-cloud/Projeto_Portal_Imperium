import { CARGO_LABEL, type CargoNegocio } from "@/lib/negocios";
import { lancarVenda } from "@/app/(app)/lancar-vendas/actions";

export type VendedorOpcao = { id: string; nome: string; cargo: CargoNegocio };
export type PessoaOpcao = { id: string; full_name: string };

const campo =
  "w-full rounded border border-imperium-line bg-imperium-raised px-2 py-1.5 text-sm text-stone-100 focus:border-gold focus:outline-none";

/** Formulário de lançamento de venda/recebimento de um negócio (usado em Lançar vendas e no Mural). */
export default function FormLancarVenda({
  slug,
  vendedores,
  todos,
  hoje,
  retorno,
}: {
  slug: string;
  vendedores: VendedorOpcao[];
  todos: PessoaOpcao[];
  hoje: string;
  /** "mural": depois de lançar, volta para o Mural em vez de Lançar vendas. */
  retorno?: "mural";
}) {
  const atual = { slug };
  return (
        <form action={lancarVenda} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="negocio_slug" value={atual.slug} />
          {retorno && <input type="hidden" name="retorno" value={retorno} />}
          <label className="text-xs text-stone-400">
            Vendedor
            <select name="vendedor_id" required className={campo} defaultValue="">
              <option value="" disabled>
                Escolha…
              </option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome} · {CARGO_LABEL[v.cargo] ?? v.cargo}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-stone-400">
            Valor recebido (R$)
            <input name="valor" required inputMode="decimal" placeholder="Ex.: 12.500,00" className={campo} />
          </label>
          <label className="text-xs text-stone-400">
            Data do recebimento
            <input name="data" type="date" max={hoje} defaultValue={hoje} className={campo} />
          </label>
          <label className="text-xs text-stone-400">
            Cliente
            <input name="cliente" className={campo} />
          </label>
          <label className="text-xs text-stone-400">
            Produto
            <input name="produto" placeholder="Ex.: Consultoria, Sunne, Cessão…" className={campo} />
          </label>
          <label className="text-xs text-stone-400">
            Canal da venda
            <select name="canal" required className={campo} defaultValue="">
              <option value="" disabled>
                Escolha…
              </option>
              <option value="outbound">Outbound</option>
              <option value="inbound">Inbound</option>
              <option value="indicacao">Indicação</option>
            </select>
          </label>
          <label className="text-xs text-stone-400">
            SDR / BDR / indicador (opcional)
            <select name="indicador_id" className={campo} defaultValue="">
              <option value="">Ninguém (venda sem SDR/BDR)</option>
              {todos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>
          {atual.slug === "vorp" && (
            <fieldset className="grid gap-3 rounded border border-imperium-line p-3 sm:col-span-2 sm:grid-cols-3">
              <legend className="px-1 text-[10px] uppercase tracking-widest text-stone-500">Contrato (Vorp)</legend>
              <label className="text-xs text-stone-400">
                MRR do contrato (R$)
                <input name="mrr" required inputMode="decimal" placeholder="Ex.: 3.000,00" className={campo} />
              </label>
              <label className="text-xs text-stone-400">
                Valor total do contrato (R$)
                <input name="valor_total_contrato" inputMode="decimal" className={campo} />
              </label>
              <label className="text-xs text-stone-400">
                Valor antecipado (R$)
                <input name="valor_antecipado" inputMode="decimal" placeholder="0 se não antecipou" className={campo} />
              </label>
              <label className="flex items-center gap-2 text-xs text-stone-400 sm:col-span-3">
                <input type="checkbox" name="primeiro_contrato" defaultChecked />
                Primeiro contrato do cliente (só ele paga comissão)
              </label>
              <p className="text-[11px] text-stone-500 sm:col-span-3">
                Com valor antecipado, a comissão incide sobre no máximo 3 meses de MRR.
              </p>
            </fieldset>
          )}
          {atual.slug === "matchsales" && (
            <label className="text-xs text-stone-400 sm:col-span-2">
              MRR do contrato (R$, opcional)
              <input name="mrr" inputMode="decimal" placeholder="Mensalidade do contrato, para a meta de MRR" className={campo} />
            </label>
          )}
          {atual.slug === "vorp-finance" && (
            <fieldset className="grid gap-3 rounded border border-imperium-line p-3 sm:col-span-2">
              <legend className="px-1 text-[10px] uppercase tracking-widest text-stone-500">Precatório (Vorp Finance)</legend>
              <label className="text-xs text-stone-400">
                Valor pago ao cliente (R$)
                <input name="valor_cliente" required inputMode="decimal" placeholder="Ex.: 100.000,00" className={campo} />
              </label>
              <p className="text-[11px] text-stone-500">
                O campo &quot;Valor recebido&quot; acima é a comissão recebida. Margem base = 6% do pago ao cliente (25% dela vira comissão); o que a comissão exceder a margem é deságio.
              </p>
            </fieldset>
          )}
          {atual.slug === "vorp-energy" && (
            <fieldset className="grid gap-3 rounded border border-imperium-line p-3 sm:col-span-2 sm:grid-cols-2">
              <legend className="px-1 text-[10px] uppercase tracking-widest text-stone-500">Recorrência (Maximus Energy)</legend>
              <label className="flex items-center gap-2 text-xs text-stone-400">
                <input type="checkbox" name="recorrencia" />
                Este lançamento é recorrência (não a primeira fatura)
              </label>
              <label className="text-xs text-stone-400">
                % da recorrência negociado (3 a 15, opcional)
                <input name="recorrencia_pct" inputMode="decimal" placeholder="Ex.: 4,5" className={campo} />
              </label>
              <label className="text-xs text-stone-400">
                kWh vendidos (opcional)
                <input name="kwh" inputMode="decimal" placeholder="Ex.: 10.500 (conta nova, não recorrência)" className={campo} />
              </label>
              <p className="text-[11px] text-stone-500 sm:col-span-2">
                Informe o valor realmente recebido: ele se divide em 30% executivos, 25% lideranças e 45% Vorp.
              </p>
            </fieldset>
          )}
          <label className="text-xs text-stone-400 sm:col-span-2">
            Observação
            <input name="observacao" className={campo} />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="rounded border border-gold/50 bg-gold/10 px-4 py-2 text-sm text-gold-bright hover:bg-gold/20">
              Lançar
            </button>
          </div>
        </form>
  );
}
