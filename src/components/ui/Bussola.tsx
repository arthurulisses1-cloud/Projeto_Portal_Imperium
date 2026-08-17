type Item = { label: string; value: string; sub?: string; tone?: "gold" | "muted" | "warn" | "good" };

const TONE: Record<NonNullable<Item["tone"]>, string> = {
  gold: "text-gold-bright",
  muted: "text-stone-300",
  warn: "text-wine-bright",
  good: "text-emerald-400",
};

// As 3 perguntas que o executivo deveria responder num olhar: onde estou,
// onde deveria estar, e pra onde vou. Usado no topo do Mural e em telas de
// produção/comissão como resumo imediato de status.
export default function Bussola({ items }: { items: [Item, Item, Item] }) {
  return (
    <div className="grid grid-cols-3 divide-x divide-imperium-line">
      {items.map((item, i) => (
        <div key={i} className="px-4 text-center first:pl-0 last:pr-0">
          <p className="kicker mb-2">{item.label}</p>
          <p className={`font-display text-2xl ${TONE[item.tone ?? "muted"]}`}>{item.value}</p>
          {item.sub && <p className="mt-1 text-xs text-stone-500">{item.sub}</p>}
        </div>
      ))}
    </div>
  );
}
