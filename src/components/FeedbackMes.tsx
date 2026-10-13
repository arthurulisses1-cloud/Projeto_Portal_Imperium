import { Badge } from "@/components/ui/Badge";
import type { Feedback, Nivel } from "@/lib/feedback-mes";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const TOM: Record<Nivel, "success" | "warning" | "wine" | "neutral"> = {
  ritmo: "success",
  atencao: "warning",
  abaixo: "wine",
  inicio: "neutral",
  sem_base: "neutral",
};

export type ItemFeedback = { chave: string; nome: string; detalheNome?: string; feedback: Feedback };

// "Como está no mês" (pedido do Diretor, 2026-10-13). Uma linha por pessoa/Tribo
// com o selo e o principal gargalo; o detalhe (meta, volume, conversões) fica
// recolhido — a leitura rápida é "quem está bem e quem precisa de atenção".
export default function FeedbackMes({ titulo, itens }: { titulo: string; itens: ItemFeedback[] }) {
  if (itens.length === 0) return null;
  // Quem mais precisa de atenção primeiro (só quando há mais de um)
  const ordem: Record<Nivel, number> = { abaixo: 0, atencao: 1, sem_base: 2, inicio: 3, ritmo: 4 };
  const lista = itens.length > 1 ? [...itens].sort((a, b) => ordem[a.feedback.nivel] - ordem[b.feedback.nivel]) : itens;

  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-stone-500">{titulo}</p>
      <ul className="space-y-1.5">
        {lista.map((item) => (
          <ItemLinha key={item.chave} item={item} unico={itens.length === 1} />
        ))}
      </ul>
    </div>
  );
}

function ItemLinha({ item, unico }: { item: ItemFeedback; unico: boolean }) {
  const f = item.feedback;
  const temDetalhe = f.meta !== null || f.volume.length > 0 || f.conversoes.length > 0;
  return (
    <li className="rounded border border-imperium-line bg-imperium-bg/40">
      <details className="group/fb" open={unico && temDetalhe}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 [&::-webkit-details-marker]:hidden">
          {!unico && <span className="text-sm text-stone-200">{item.nome}</span>}
          <Badge tone={TOM[f.nivel]}>{f.titulo}</Badge>
          {f.meta && (
            <span className="text-xs text-stone-400">
              {moeda(f.meta.pago)} de {moeda(f.meta.total)} da meta
            </span>
          )}
          {temDetalhe && <span className="ml-auto text-[10px] text-stone-600 transition group-open/fb:rotate-180">▾</span>}
        </summary>
        {f.gargalo && (
          <p className="px-3 pb-2 text-xs text-stone-400">
            Ponto de atenção: <span className="text-stone-200">{f.gargalo}</span>
          </p>
        )}
        {temDetalhe && (
          <div className="space-y-3 border-t border-imperium-line px-3 py-2.5 text-xs">
            {f.meta && (
              <div className="flex items-center justify-between">
                <span className="text-stone-400">Crédito pago até ontem</span>
                <span className="text-stone-200">
                  {moeda(f.meta.pago)} · esperado {moeda(f.meta.esperado)} ({Math.round(f.meta.pct * 100)}%)
                </span>
              </div>
            )}
            {f.volume.length > 0 && (
              <div>
                <p className="mb-1 uppercase tracking-wide text-stone-500">Volume (feito / esperado até ontem)</p>
                <ul className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
                  {f.volume.map((v) => (
                    <li key={v.etapa} className="flex items-center justify-between">
                      <span className="text-stone-400">{v.label}</span>
                      <span className={v.pct >= 0.95 ? "text-success-bright" : v.pct >= 0.7 ? "text-warning-bright" : "text-wine-bright"}>
                        {Math.round(v.real)}/{Math.round(v.esperado)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {f.conversoes.length > 0 && (
              <div>
                <p className="mb-1 uppercase tracking-wide text-stone-500">Conversões (feito / esperado)</p>
                <ul className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
                  {f.conversoes.map((c) => (
                    <li key={c.label} className="flex items-center justify-between">
                      <span className="text-stone-400">{c.label}</span>
                      <span className={c.pct >= 0.95 ? "text-success-bright" : c.pct >= 0.7 ? "text-warning-bright" : "text-wine-bright"}>
                        {Math.round(c.real * 100)}% / {Math.round(c.meta * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </details>
    </li>
  );
}
