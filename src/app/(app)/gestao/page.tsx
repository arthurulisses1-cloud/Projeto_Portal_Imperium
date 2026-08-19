import { createClient } from "@/lib/supabase/server";
import { RANK_LABELS, ROLE_LABELS } from "@/lib/labels";
import { RANK_ORDER } from "@/lib/carreira";
import { atualizarCargo, atualizarTribo, atualizarLegado } from "./actions";
import Card from "@/components/ui/Card";
import SincronizarPlanilha from "@/components/ui/SincronizarPlanilha";

const ROLES = ["sdr", "closer", "lider", "diretor"] as const;
const RANKS = [...RANK_ORDER, "diretor"] as const;

export default async function GestaoPage() {
  const supabase = await createClient();

  const { data: pessoas } = await supabase
    .from("profiles")
    .select("id, full_name, role, rank, tribo_id")
    .order("full_name");

  const { data: tribos } = await supabase
    .from("tribos")
    .select("id, nome, exercito:exercitos(nome)")
    .order("nome");

  const { data: exercitos } = await supabase
    .from("exercitos")
    .select("id, nome, legado_id")
    .order("nome");

  const lideres = (pessoas ?? []).filter((p) => p.role === "lider");

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Gestão de Pessoas</h1>
        <p className="kicker mt-1">Cargo, Tribo e Exército de cada membro — acesso total do Diretor</p>
      </div>

      <Card title="Sincronização com a Planilha">
        <SincronizarPlanilha />
      </Card>

      <Card title="Exércitos e seus Legados">
        <div className="grid gap-3 sm:grid-cols-2">
          {(exercitos ?? []).map((e) => (
            <form key={e.id} action={atualizarLegado} className="flex items-end gap-2 rounded border border-imperium-line p-3">
              <input type="hidden" name="exercito_id" value={e.id} />
              <div className="flex-1">
                <p className="mb-1 text-sm text-stone-200">{e.nome}</p>
                <select name="legado_id" defaultValue={e.legado_id ?? ""} className="input-imp text-sm">
                  <option value="">— sem Legado —</option>
                  {lideres.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn-outline px-3 py-2 text-xs">
                Salvar
              </button>
            </form>
          ))}
        </div>
      </Card>

      <Card title="Todos os membros">
        <div className="space-y-3">
          {(pessoas ?? [])
            .filter((p) => p.role !== "diretor")
            .map((p) => {
              const tribo = (tribos ?? []).find((t) => t.id === p.tribo_id);
              return (
                <div key={p.id} className="rounded border border-imperium-line bg-imperium-bg/40 p-3">
                  <p className="mb-2 text-sm text-stone-100">{p.full_name}</p>
                  <div className="flex flex-wrap items-end gap-3">
                    <form action={atualizarCargo} className="flex items-end gap-2">
                      <input type="hidden" name="profile_id" value={p.id} />
                      <div>
                        <label className="mb-1 block text-[10px] uppercase text-stone-500">Papel</label>
                        <select name="role" defaultValue={p.role} className="input-imp text-xs">
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r] ?? r}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] uppercase text-stone-500">Cargo</label>
                        <select name="rank" defaultValue={p.rank} className="input-imp text-xs">
                          {RANKS.map((r) => (
                            <option key={r} value={r}>
                              {RANK_LABELS[r] ?? r}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button type="submit" className="btn-outline px-3 py-1.5 text-xs">
                        Salvar
                      </button>
                    </form>

                    <form action={atualizarTribo} className="flex items-end gap-2">
                      <input type="hidden" name="profile_id" value={p.id} />
                      <div>
                        <label className="mb-1 block text-[10px] uppercase text-stone-500">Tribo</label>
                        <select name="tribo_id" defaultValue={p.tribo_id ?? ""} className="input-imp text-xs">
                          <option value="">— sem Tribo —</option>
                          {(tribos ?? []).map((t) => {
                            const ex = t.exercito as unknown as { nome: string } | null;
                            return (
                              <option key={t.id} value={t.id}>
                                {ex?.nome ? `${ex.nome} · ` : ""}
                                {t.nome}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <button type="submit" className="btn-outline px-3 py-1.5 text-xs">
                        Salvar
                      </button>
                    </form>

                    {tribo && (
                      <span className="text-xs text-stone-500">
                        atual: {(tribo.exercito as unknown as { nome: string } | null)?.nome} · {tribo.nome}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </Card>
    </main>
  );
}
