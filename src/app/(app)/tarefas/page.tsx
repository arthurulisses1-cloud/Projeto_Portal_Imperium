import { createClient } from "@/lib/supabase/server";
import { criarFollowup, concluirFollowup, excluirFollowup } from "./actions";
import Card from "@/components/ui/Card";

export default async function TarefasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: tarefas } = await supabase
    .from("tasks")
    .select("id, titulo, due_date, coluna")
    .eq("profile_id", user.id)
    .order("due_date", { ascending: true, nullsFirst: false });

  const pendentes = (tarefas ?? []).filter((t) => t.coluna !== "concluido");
  const concluidas = (tarefas ?? []).filter((t) => t.coluna === "concluido");
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Follow-ups</h1>
        <p className="kicker mt-1">Retomas e pendências — lembretes pessoais, não substitui o CRM</p>
      </div>

      <Card>
        <form action={criarFollowup} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs text-stone-400">O que retomar</label>
            <input name="titulo" required placeholder="Ex: ligar pro lead da Tribo X" className="input-imp text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-400">Retomar em</label>
            <input type="date" name="due_date" className="input-imp text-sm" />
          </div>
          <button type="submit" className="btn-gold">
            Adicionar
          </button>
        </form>
      </Card>

      <Card title="Pendentes" right={<span className="text-xs text-stone-500">{pendentes.length}</span>}>
        {pendentes.length > 0 ? (
          <ul className="space-y-2">
            {pendentes.map((t) => {
              const atrasado = t.due_date && t.due_date < hoje;
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 border-b border-imperium-line pb-2 text-sm last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-stone-200">{t.titulo}</p>
                    {t.due_date && (
                      <p className={`text-xs ${atrasado ? "text-wine-bright" : "text-stone-500"}`}>
                        {atrasado ? "Atrasado — " : "Retomar em "}
                        {new Date(t.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={concluirFollowup}>
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" className="text-xs text-success-bright hover:underline">
                        Concluir
                      </button>
                    </form>
                    <form action={excluirFollowup}>
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" className="text-xs text-stone-600 hover:text-wine-bright">
                        Excluir
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">Nenhum follow-up pendente.</p>
        )}
      </Card>

      {concluidas.length > 0 && (
        <Card title="Concluídos">
          <ul className="space-y-1.5">
            {concluidas.map((t) => (
              <li key={t.id} className="flex items-center justify-between text-xs text-stone-600">
                <span className="truncate line-through">{t.titulo}</span>
                <form action={excluirFollowup}>
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="hover:text-wine-bright">
                    Excluir
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
