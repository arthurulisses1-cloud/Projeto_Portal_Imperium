import type { Confronto } from "@/lib/guerra";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

// Comparação tipo "batalha" entre grupos (Exércitos ou Tribos) por crédito
// do mês — quem lidera, e a barra proporcional de cada um. `crests` é opcional
// (mapa nome -> caminho da imagem), usado na Guerra Civil pros brasões reais.
export default function ConfrontoWidget({
  dados,
  crests,
}: {
  dados: Confronto[];
  crests?: Record<string, string>;
}) {
  if (dados.length === 0) {
    return <p className="text-sm text-stone-500">Sem produção registrada neste mês ainda.</p>;
  }
  const max = Math.max(...dados.map((d) => d.valor), 1);

  return (
    <div className="space-y-3">
      {dados.map((d, i) => (
        <div key={d.nome}>
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className={`flex items-center gap-1.5 ${i === 0 ? "text-gold-bright" : "text-stone-300"}`}>
              {crests?.[d.nome] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={crests[d.nome]} alt={d.nome} className="h-5 w-5 rounded-full object-cover" />
              )}
              {i === 0 && "👑 "}
              {d.nome}
            </span>
            <span className={i === 0 ? "text-gold-bright" : "text-stone-400"}>{moeda(d.valor)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-imperium-line">
            <div
              className={`h-full rounded-full ${i === 0 ? "bg-gradient-to-r from-gold to-gold-bright" : "bg-wine"}`}
              style={{ width: `${(d.valor / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
