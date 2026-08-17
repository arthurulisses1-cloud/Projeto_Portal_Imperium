import { createClient } from "@/lib/supabase/server";
import { decidirEvidencia } from "./actions";

export default async function ValidacaoPage() {
  const supabase = await createClient();

  const { data: pendentes } = await supabase
    .from("promotion_evidence")
    .select(
      "id, valor_atual, evidencia_url, created_at, profile:profiles!promotion_evidence_profile_id_fkey(full_name), criterio:promotion_criteria(texto, bloco, transicao)"
    )
    .eq("status", "pendente")
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Fila de Validação</h1>
        <p className="mt-1 text-xs text-stone-400">Evidências dos critérios de promoção (Blocos 3 e 4)</p>
      </div>

      <section className="card-imp">
        {pendentes && pendentes.length > 0 ? (
          <ul className="space-y-4">
            {pendentes.map((p) => {
              const autor = p.profile as unknown as { full_name: string } | null;
              const criterio = p.criterio as unknown as { texto: string; bloco: number } | null;
              return (
                <li key={p.id} className="border-b border-imperium-line pb-4 last:border-0">
                  <p className="text-sm text-stone-100">{autor?.full_name}</p>
                  <p className="text-xs text-stone-400">
                    Bloco {criterio?.bloco} — {criterio?.texto}
                  </p>
                  {p.valor_atual && (
                    <p className="mt-1 text-xs text-stone-500">Valor informado: {p.valor_atual}</p>
                  )}
                  <form action={decidirEvidencia} className="mt-2 flex gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      name="status"
                      value="aprovado"
                      className="rounded border border-emerald-500/50 px-3 py-1 text-xs text-emerald-400 hover:bg-emerald-500/10"
                    >
                      Aprovar
                    </button>
                    <button
                      type="submit"
                      name="status"
                      value="rejeitado"
                      className="rounded border border-wine/50 px-3 py-1 text-xs text-wine-bright hover:bg-wine/10"
                    >
                      Rejeitar
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">Nenhuma evidência pendente.</p>
        )}
      </section>
    </main>
  );
}
