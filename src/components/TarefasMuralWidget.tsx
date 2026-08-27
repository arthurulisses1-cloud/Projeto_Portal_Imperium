import { createClient } from "@/lib/supabase/server";

// Widget próprio do Mural pras suas tarefas de hoje/atrasadas — pedido do
// Diretor (2026-08-27): fora da Central de Notificações de propósito (é
// individual, não faz sentido misturar com o resumo de time/firma que a
// Central mostra), e minimizável (<details>, mesmo padrão colapsável já
// usado em CentralNotificacoes/Comissão/etc).
export default async function TarefasMuralWidget({ userId }: { userId: string }) {
  const supabase = await createClient();
  const hoje = new Date().toISOString().slice(0, 10);

  const { data: tarefasRaw } = await supabase
    .from("tasks")
    .select("id, titulo, due_date, prioridade")
    .eq("profile_id", userId)
    .neq("coluna", "concluido")
    .lte("due_date", hoje)
    .order("due_date", { ascending: true });

  const tarefas = tarefasRaw ?? [];
  if (tarefas.length === 0) return null;

  const atrasadas = tarefas.filter((t) => t.due_date && t.due_date < hoje);
  const deHoje = tarefas.filter((t) => t.due_date === hoje);

  return (
    <details open className="card-imp group">
      <summary className="flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
        <h2 className="kicker">⚔️ Suas Tarefas em Aberto</h2>
        <span className="flex items-center gap-2 text-xs text-stone-500">
          {atrasadas.length > 0 && <span className="text-wine-bright">{atrasadas.length} atrasada{atrasadas.length > 1 ? "s" : ""}</span>}
          {deHoje.length > 0 && <span className="text-gold">{deHoje.length} hoje</span>}
          <span className="text-[10px] transition group-open:rotate-180">▾</span>
        </span>
      </summary>
      <ul className="mt-4 space-y-1.5">
        {atrasadas.map((t) => (
          <li key={t.id} className="flex items-center justify-between text-sm">
            <span className="text-stone-200">
              {t.prioridade === "critica" && "🔥 "}
              {t.titulo}
            </span>
            <span className="text-wine-bright">Atrasada — {new Date(t.due_date! + "T00:00:00").toLocaleDateString("pt-BR")}</span>
          </li>
        ))}
        {deHoje.map((t) => (
          <li key={t.id} className="flex items-center justify-between text-sm">
            <span className="text-stone-200">
              {t.prioridade === "critica" && "🔥 "}
              {t.titulo}
            </span>
            <span className="text-gold">Hoje</span>
          </li>
        ))}
      </ul>
      <a href="/tarefas" className="mt-3 inline-block text-[11px] text-stone-500 hover:text-gold-bright hover:underline">
        Ver todas as tarefas →
      </a>
    </details>
  );
}
