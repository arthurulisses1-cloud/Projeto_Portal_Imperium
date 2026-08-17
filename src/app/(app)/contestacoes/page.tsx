import { createClient } from "@/lib/supabase/server";
import { resolverContestacao } from "./actions";

function moeda(v: number | null) {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function ContestacoesPage() {
  const supabase = await createClient();

  const { data: abertas } = await supabase
    .from("contestacoes")
    .select(
      "id, referencia, valor_contestado, motivo, created_at, profile:profiles!contestacoes_profile_id_fkey(full_name)"
    )
    .eq("status", "aberto")
    .order("created_at", { ascending: true });

  const { data: resolvidas } = await supabase
    .from("contestacoes")
    .select(
      "id, referencia, resposta, resolvido_em, profile:profiles!contestacoes_profile_id_fkey(full_name)"
    )
    .eq("status", "resolvido")
    .order("resolvido_em", { ascending: false })
    .limit(10);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Fila de Contestação</h1>
        <p className="mt-1 text-xs text-stone-400">Comissão — visão do Diretor</p>
      </div>

      <section className="card-imp">
        <h2 className="kicker mb-4">Abertas ({abertas?.length ?? 0})</h2>
        {abertas && abertas.length > 0 ? (
          <ul className="space-y-4">
            {abertas.map((c) => {
              const autor = c.profile as unknown as { full_name: string } | null;
              return (
                <li key={c.id} className="border-b border-imperium-line pb-4 last:border-0">
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-stone-100">{autor?.full_name ?? "—"}</span>
                    <span className="text-stone-400">{c.referencia ?? "Sem referência"}</span>
                  </div>
                  <p className="mb-2 text-sm text-stone-300">{c.motivo}</p>
                  <p className="mb-3 text-xs text-stone-500">
                    Valor contestado: {moeda(c.valor_contestado)}
                  </p>
                  <form action={resolverContestacao} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="id" value={c.id} />
                    <div>
                      <label className="mb-1 block text-xs text-stone-400">Decisão</label>
                      <select name="decisao" className="input-imp text-sm">
                        <option value="aceita">Aceitar</option>
                        <option value="rejeitada">Rejeitar</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="mb-1 block text-xs text-stone-400">Justificativa</label>
                      <input name="justificativa" required className="input-imp text-sm" />
                    </div>
                    <button type="submit" className="btn-gold">
                      Resolver
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">Nenhuma contestação em aberto.</p>
        )}
      </section>

      <section className="card-imp">
        <h2 className="kicker mb-4">Resolvidas recentemente</h2>
        {resolvidas && resolvidas.length > 0 ? (
          <ul className="space-y-2">
            {resolvidas.map((c) => {
              const autor = c.profile as unknown as { full_name: string } | null;
              return (
                <li key={c.id} className="border-t border-imperium-line pt-2 text-sm">
                  <span className="text-stone-300">{autor?.full_name ?? "—"}</span>{" "}
                  <span className="text-stone-500">— {c.resposta}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">Nenhuma resolvida ainda.</p>
        )}
      </section>
    </main>
  );
}
