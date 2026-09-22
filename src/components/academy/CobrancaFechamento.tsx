import type { AulaComCobranca } from "@/lib/academy";
import { visualDaTrilha } from "@/lib/academy-visual";

function fmtData(iso: string | null) {
  if (!iso) return "sem data";
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", weekday: "short" });
}

// Cobrança de fechamento — pedido do Diretor, 2026-09-22: "me dê um lugar
// onde posso ver as aulas dos outros professores pra poder cobrar eles de
// fazer o fechamento". Só aulas já vencidas e ainda sem fechar (ver
// buscarAulasCobranca em src/lib/academy.ts) — somente leitura, quem fecha
// é o próprio instrutor. Reaproveitado em Academy Geral/Aulas para
// Ministrar (Diretor) e no Mural do RH (Alana/Letícia).
export default function CobrancaFechamento({ aulas }: { aulas: AulaComCobranca[] }) {
  if (aulas.length === 0) {
    return (
      <section className="card-imp">
        <h2 className="font-display text-lg text-gold-bright">Cobrança de fechamento</h2>
        <p className="mt-1 text-xs text-success-bright">✓ Nenhuma aula vencida sem fechar — todo mundo em dia.</p>
      </section>
    );
  }

  return (
    <section className="card-imp space-y-3">
      <div>
        <h2 className="font-display text-lg text-gold-bright">Cobrança de fechamento</h2>
        <p className="text-xs text-stone-400">
          Aulas já dadas (data passada) que o professor ainda não fechou — {aulas.length} pendente{aulas.length > 1 ? "s" : ""}.
        </p>
      </div>
      <div className="space-y-1.5">
        {aulas.map((aula) => {
          const visual = visualDaTrilha(aula.trilhaNome);
          return (
            <div key={aula.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-imperium-line p-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span style={{ color: visual.cor }}>{visual.icone}</span>
                <div>
                  <p className="text-stone-100">
                    {aula.tema} <span className="text-stone-500">— {aula.trilhaNome}</span>
                  </p>
                  <p className="text-[10px] text-stone-500">
                    {aula.instrutorNome ?? "sem instrutor"} · {fmtData(aula.data)}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-wine/20 px-2 py-0.5 text-[10px] text-wine-bright">
                falta {!aula.temMaterial && "material"}
                {!aula.temMaterial && !aula.temPresenca && " e "}
                {!aula.temPresenca && "presença"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
