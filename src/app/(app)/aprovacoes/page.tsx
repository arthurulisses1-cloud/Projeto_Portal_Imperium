import { createClient } from "@/lib/supabase/server";
import { RANK_LABELS } from "@/lib/labels";
import { NEXT_RANK, type Rank } from "@/lib/carreira";
import { decidirPromocao } from "./actions";

export default async function AprovacoesPage() {
  const supabase = await createClient();

  const { data: pendentes } = await supabase
    .from("promotion_requests")
    .select(
      "id, transicao, praetorium_aprovado, created_at, profile:profiles!promotion_requests_profile_id_fkey(id, full_name, rank)"
    )
    .eq("status", "pendente")
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Aprovações de Carreira</h1>
        <p className="mt-1 text-xs text-stone-400">Subidas de nível pendentes de aprovação</p>
      </div>

      <section className="card-imp">
        {pendentes && pendentes.length > 0 ? (
          <ul className="space-y-4">
            {pendentes.map((p) => {
              const perfil = p.profile as unknown as { id: string; full_name: string; rank: Rank } | null;
              if (!perfil) return null;
              const proximo = NEXT_RANK[perfil.rank];
              return (
                <li key={p.id} className="border-b border-imperium-line pb-4 last:border-0">
                  <p className="text-sm text-stone-100">{perfil.full_name}</p>
                  <p className="text-xs text-stone-400">
                    {RANK_LABELS[perfil.rank]} → {proximo ? RANK_LABELS[proximo] : "—"}
                  </p>
                  <form action={decidirPromocao} className="mt-2 flex gap-2">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="profile_id" value={perfil.id} />
                    <input type="hidden" name="rank_atual" value={perfil.rank} />
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
                      Rejeitar
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">Nenhuma promoção pendente.</p>
        )}
      </section>
    </main>
  );
}
