import { createClient } from "@/lib/supabase/server";
import { criarTarefa, moverTarefa, alternarPrivado, excluirTarefa } from "./actions";
import Card from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const COLUNAS = [
  { valor: "backlog", label: "Backlog" },
  { valor: "afazer", label: "A Fazer" },
  { valor: "andamento", label: "Em Andamento" },
  { valor: "bloqueado", label: "Bloqueado" },
  { valor: "concluido", label: "Concluído" },
] as const;

const PRIORIDADE_TONE = { alta: "wine", media: "warning", baixa: "neutral" } as const;
const PRIORIDADE_LABEL: Record<string, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

type Tarefa = {
  id: string;
  titulo: string;
  due_date: string | null;
  coluna: string;
  prioridade: string;
  privado: boolean;
  profile_id: string;
  atribuido_por: string | null;
};

export default async function TarefasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role, tribo_id").eq("id", user.id).single();
  if (!profile) return null;

  // Liderados: quem essa pessoa pode ver/atribuir tarefa, além de si mesma
  // — mesmo recorte de time já usado em falta/strike/PDI (MembroCard) e no
  // Forecast por Exército.
  let liderados: { id: string; full_name: string }[] = [];
  if (profile.role === "closer" && profile.tribo_id) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("tribo_id", profile.tribo_id)
      .eq("role", "sdr")
      .order("full_name");
    liderados = data ?? [];
  } else if (profile.role === "lider") {
    const { data: exercito } = await supabase.from("exercitos").select("id").eq("legado_id", user.id).maybeSingle();
    if (exercito) {
      const { data: tribos } = await supabase.from("tribos").select("id, closer_id").eq("exercito_id", exercito.id);
      const idsTribos = (tribos ?? []).map((t) => t.id);
      const closerIds = (tribos ?? []).map((t) => t.closer_id).filter((x): x is string => !!x);
      const [{ data: sdrs }, { data: closers }] = await Promise.all([
        idsTribos.length > 0
          ? supabase.from("profiles").select("id, full_name").in("tribo_id", idsTribos).eq("role", "sdr")
          : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
        closerIds.length > 0
          ? supabase.from("profiles").select("id, full_name").in("id", closerIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      ]);
      liderados = [...(closers ?? []), ...(sdrs ?? [])].sort((a, b) => a.full_name.localeCompare(b.full_name));
    }
  } else if (profile.role === "diretor") {
    const { data } = await supabase.from("profiles").select("id, full_name").in("role", ["sdr", "closer", "lider"]).order("full_name");
    liderados = data ?? [];
  }

  const idsVisiveis = Array.from(new Set([user.id, ...liderados.map((l) => l.id)]));
  const { data: tarefasRaw } = await supabase
    .from("tasks")
    .select("id, titulo, due_date, coluna, prioridade, privado, profile_id, atribuido_por")
    .in("profile_id", idsVisiveis)
    .order("due_date", { ascending: true, nullsFirst: false });

  const tarefas = (tarefasRaw ?? []) as Tarefa[];
  const nomePorId = new Map<string, string>([[user.id, "Você"], ...liderados.map((l) => [l.id, l.full_name] as const)]);
  const hoje = new Date().toISOString().slice(0, 10);

  const porColuna = new Map<string, Tarefa[]>();
  for (const c of COLUNAS) porColuna.set(c.valor, []);
  for (const t of tarefas) porColuna.get(t.coluna)?.push(t);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Tarefas</h1>
        <p className="kicker mt-1">Rotina, lembretes e demandas do time</p>
      </div>

      <Card title="Nova tarefa">
        <form action={criarTarefa} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs text-stone-400">O que fazer</label>
            <input name="titulo" required placeholder="Ex: Falar com lead tal às 15h" className="input-imp text-sm" />
          </div>
          {liderados.length > 0 && (
            <div>
              <label className="mb-1 block text-xs text-stone-400">Para quem</label>
              <select name="profile_id" defaultValue={user.id} className="input-imp text-sm">
                <option value={user.id}>Eu mesmo</option>
                {liderados.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-stone-400">Prioridade</label>
            <select name="prioridade" defaultValue="media" className="input-imp text-sm">
              <option value="alta">Alta</option>
              <option value="media">Média</option>
              <option value="baixa">Baixa</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-400">Prazo (opcional)</label>
            <input type="date" name="due_date" className="input-imp text-sm" />
          </div>
          <button type="submit" className="btn-gold">
            Adicionar
          </button>
        </form>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        {COLUNAS.map((c, i) => {
          const itens = porColuna.get(c.valor) ?? [];
          const anterior = COLUNAS[i - 1]?.valor;
          const proxima = COLUNAS[i + 1]?.valor;
          return (
            <div key={c.valor} className="space-y-3">
              <h2 className="kicker">
                {c.label} <span className="text-stone-600">· {itens.length}</span>
              </h2>
              <div className="space-y-2">
                {itens.map((t) => {
                  const atrasada = !!t.due_date && t.due_date < hoje && t.coluna !== "concluido";
                  const souDono = t.profile_id === user.id;
                  return (
                    <div key={t.id} className="rounded border border-imperium-line bg-imperium-bg/40 p-3 text-sm">
                      <p className="text-stone-100">{t.titulo}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone={PRIORIDADE_TONE[t.prioridade as keyof typeof PRIORIDADE_TONE] ?? "neutral"} variant="tag">
                          {PRIORIDADE_LABEL[t.prioridade] ?? t.prioridade}
                        </Badge>
                        {t.due_date && (
                          <span className={`text-[11px] ${atrasada ? "text-wine-bright" : "text-stone-500"}`}>
                            {atrasada ? "Atrasada — " : ""}
                            {new Date(t.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                      {!souDono && <p className="mt-1 text-[11px] text-stone-600">{nomePorId.get(t.profile_id) ?? "—"}</p>}
                      {souDono && t.atribuido_por && (
                        <p className="mt-1 text-[11px] text-stone-600">Atribuída por {nomePorId.get(t.atribuido_por) ?? "—"}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        {anterior && (
                          <form action={moverTarefa}>
                            <input type="hidden" name="id" value={t.id} />
                            <input type="hidden" name="coluna" value={anterior} />
                            <button type="submit" className="text-stone-500 hover:text-gold-bright" title={`Mover pra ${anterior}`}>
                              ◀
                            </button>
                          </form>
                        )}
                        {proxima && (
                          <form action={moverTarefa}>
                            <input type="hidden" name="id" value={t.id} />
                            <input type="hidden" name="coluna" value={proxima} />
                            <button type="submit" className="text-stone-500 hover:text-gold-bright" title={`Mover pra ${proxima}`}>
                              ▶
                            </button>
                          </form>
                        )}
                        {souDono && (
                          <form action={alternarPrivado}>
                            <input type="hidden" name="id" value={t.id} />
                            <input type="hidden" name="privado" value={String(t.privado)} />
                            <button type="submit" className={`hover:underline ${t.privado ? "text-gold-bright" : "text-stone-600"}`}>
                              {t.privado ? "Oculta dos superiores" : "Ocultar dos superiores"}
                            </button>
                          </form>
                        )}
                        <form action={excluirTarefa}>
                          <input type="hidden" name="id" value={t.id} />
                          <button type="submit" className="text-stone-600 hover:text-wine-bright">
                            Excluir
                          </button>
                        </form>
                      </div>
                    </div>
                  );
                })}
                {itens.length === 0 && <p className="text-xs text-stone-600">Vazio.</p>}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
