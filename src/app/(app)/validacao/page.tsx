import { createClient } from "@/lib/supabase/server";
import { RANK_LABELS } from "@/lib/labels";
import { decidirEvidencia, decidirPromocao } from "./actions";

export default async function ValidacaoPage() {
  const supabase = await createClient();

  const { data: pendentes } = await supabase
    .from("promotion_evidence")
    .select(
      "id, valor_atual, evidencia_url, created_at, profile:profiles!promotion_evidence_profile_id_fkey(full_name), criterio:promotion_criteria(texto, bloco, transicao)"
    )
    .eq("status", "pendente")
    .order("created_at", { ascending: true });

  const { data: pedidosPromocao } = await supabase
    .from("promotion_requests")
    .select("id, transicao, created_at, profile:profiles!promotion_requests_profile_id_fkey(full_name)")
    .eq("status", "pendente")
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Fila de Validação</h1>
        <p className="mt-1 text-xs text-stone-400">Evidências dos critérios de promoção (Blocos 3 e 4)</p>
      </div>

      {pedidosPromocao && pedidosPromocao.length > 0 && (
        <section className="card-imp border-gold/40">
          <h2 className="kicker mb-4 text-gold">🔔 Pedidos de promoção</h2>
          <ul className="space-y-4">
            {pedidosPromocao.map((p) => {
              const autor = p.profile as unknown as { full_name: string } | null;
              const [, proximoRank] = p.transicao.split("_");
              return (
                <li key={p.id} className="border-b border-imperium-line pb-4 last:border-0">
                  <p className="text-sm text-stone-100">{autor?.full_name}</p>
                  <p className="text-xs text-stone-400">
                    Pronto pra virar <span className="text-gold">{RANK_LABELS[proximoRank] ?? proximoRank}</span> — todos os
                    critérios do sistema já batem OK, falta sua confirmação final
                  </p>
                  <form action={decidirPromocao} className="mt-2 flex gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      name="status"
                      value="aprovado"
                      className="rounded border border-success/50 px-3 py-1 text-xs text-success-bright hover:bg-success/10"
                    >
                      Aprovar e promover
                    </button>
                    <button
                      type="submit"
                      name="status"
                      value="rejeitado"
                      className="rounded border border-wine/50 px-3 py-1 text-xs text-wine-bright hover:bg-wine/10"
                    >
                      Ainda não
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card-imp">
        <h2 className="kicker mb-4">Evidências de critérios</h2>
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
                  {p.evidencia_url && (
                    <p className="mt-1 text-xs text-stone-500">
                      Evidência:{" "}
                      <a href={p.evidencia_url} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
                        {p.evidencia_url}
                      </a>
                    </p>
                  )}
                  <form action={decidirEvidencia} className="mt-2 flex gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <button
                      type="submit"
                      name="status"
                      value="aprovado"
                      className="rounded border border-success/50 px-3 py-1 text-xs text-success-bright hover:bg-success/10"
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
