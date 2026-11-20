import type { LeadEtapa } from "@/lib/funil-negocio";

/** Nome de cada valor do campo "Origem do lead" do CRM. */
const ORIGEM: Record<string, string> = {
  trafego: "Tráfego Pago",
  // Galáticos: lead antigo de tráfego da Vorp (listas "Base Vorp"), separado do tráfego da própria Match Sales.
  trafego_vorp: "Tráfego Pago Vorp",
  base_fria: "Base fria",
  indicacao: "Indicação",
  evento: "Evento",
};
const nomeOrigem = (o: string) => ORIGEM[o] ?? o;

/** Número do realizado; com leads, mostra a lista (data, lead, responsável e pré-vendas) ao passar o mouse.
 *  Lead com "Origem do lead" preenchida (ex.: lead antigo de tráfego prospectado pelo Outbound) ganha uma
 *  etiqueta, e o topo da lista diz quantos vieram de cada origem. */
/** Realizado de cada pré-vendas numa etapa que não tem lista de leads (tentativas, alôs e conexões do 3C). */
export type RealizadoPorPessoa = { rotulo: string; total: number; fonte: string; pessoas: { nome: string; quantidade: number }[] };

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

export function RealizadoComLeads({
  valor,
  leads,
  porPessoa,
  alinhar = "direita",
}: {
  valor: string;
  leads?: LeadEtapa[];
  /** Sem lista de leads: a quantidade de cada pré-vendas ao passar o mouse. */
  porPessoa?: RealizadoPorPessoa;
  /** Lado em que a lista abre (número à esquerda do cartão: "esquerda"). */ alinhar?: "direita" | "esquerda";
}) {
  if ((!leads || leads.length === 0) && porPessoa && porPessoa.pessoas.length > 0) {
    const somaPessoas = porPessoa.pessoas.reduce((s, p) => s + p.quantidade, 0);
    const resto = porPessoa.total - somaPessoas;
    const linhas = resto > 0 ? [...porPessoa.pessoas, { nome: "Sem pré-vendas identificado", quantidade: resto }] : porPessoa.pessoas;
    return (
      <span className="group relative text-right text-stone-100" tabIndex={0}>
        <span className="cursor-help underline decoration-stone-500 decoration-dotted underline-offset-4">{valor}</span>
        <span className={`pointer-events-none invisible absolute ${alinhar === "esquerda" ? "left-0" : "right-0"} top-full z-30 mt-1 w-64 rounded-md border border-imperium-line bg-imperium-surface p-2 text-left opacity-0 shadow-xl transition-opacity group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-focus:pointer-events-auto group-focus:visible group-focus:opacity-100 font-normal`}>
          <span className="mb-1 block text-[10px] uppercase tracking-widest text-stone-500">
            {fmt(porPessoa.total)} {porPessoa.rotulo} por pré-vendas
          </span>
          <span className="mb-1.5 block text-[10px] text-stone-500">{porPessoa.fonte}</span>
          <span className="block space-y-1">
            {linhas.map((p) => (
              <span key={p.nome} className="flex items-baseline justify-between gap-2 text-[11px] leading-tight">
                <span className="min-w-0 truncate text-stone-100">{p.nome}</span>
                <span className="shrink-0 tabular-nums text-stone-300">
                  {fmt(p.quantidade)}
                  <span className="ml-1.5 text-stone-500">{porPessoa.total > 0 ? `${Math.round((p.quantidade / porPessoa.total) * 100)}%` : ""}</span>
                </span>
              </span>
            ))}
          </span>
        </span>
      </span>
    );
  }
  if (!leads || leads.length === 0) return <span className="text-right text-stone-100">{valor}</span>;
  const porOrigem = new Map<string, number>();
  for (const l of leads) if (l.origem) porOrigem.set(l.origem, (porOrigem.get(l.origem) ?? 0) + 1);
  return (
    <span className="group relative text-right text-stone-100" tabIndex={0}>
      <span className="cursor-help underline decoration-stone-500 decoration-dotted underline-offset-4">{valor}</span>
      <span className={`pointer-events-none invisible absolute ${alinhar === "esquerda" ? "left-0" : "right-0"} top-full z-30 mt-1 w-80 rounded-md border border-imperium-line bg-imperium-surface p-2 text-left opacity-0 shadow-xl transition-opacity group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-focus:pointer-events-auto group-focus:visible group-focus:opacity-100 font-normal`}>
        <span className="mb-1 block text-[10px] uppercase tracking-widest text-stone-500">
          {leads.length} {leads.length === 1 ? "lead" : "leads"}
          {Array.from(porOrigem.entries()).map(([o, n]) => (
            <span key={o} className="normal-case tracking-normal text-sky-300">
              {" "}
              · {n} de origem {nomeOrigem(o)}
            </span>
          ))}
        </span>
        <span className="block max-h-72 space-y-1.5 overflow-y-auto">
          {leads.map((l, i) => (
            <span key={i} className="block text-[11px] leading-tight">
              <span className="text-stone-500">{l.data.slice(8, 10)}/{l.data.slice(5, 7)}</span> <span className="text-stone-100">{l.nome}</span>
              {l.origem ? (
                <span className="ml-1.5 rounded border border-sky-400/40 bg-sky-400/10 px-1 text-[10px] text-sky-300">{nomeOrigem(l.origem)}</span>
              ) : null}
              <span className="block text-stone-400">
                {l.responsavel ?? "—"}
                {l.preVendas ? <span className="text-stone-500"> · pré-vendas: {l.preVendas}</span> : null}
              </span>
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}
