"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moverTarefa } from "@/app/(app)/tarefas/actions";

// Checkbox de concluir direto no Mural (pedido do Diretor, 2026-08-27) —
// reaproveita moverTarefa (mesma Server Action do Kanban), só que jogando
// a tarefa pra coluna "concluido" com um clique, sem precisar abrir
// /tarefas. Otimista: some da lista assim que marcada, sem esperar o
// round-trip (a revalidatePath do server action já garante que o próximo
// carregamento real bate com o banco de qualquer forma).
export default function TarefasMuralItem({
  id,
  titulo,
  prioridade,
  situacao,
  prazoLabel,
}: {
  id: string;
  titulo: string;
  prioridade: string;
  situacao: "atrasada" | "hoje";
  prazoLabel: string;
}) {
  const router = useRouter();
  const [concluida, setConcluida] = useState(false);
  const [, startTransition] = useTransition();

  if (concluida) return null;

  function concluir() {
    setConcluida(true);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("coluna", "concluido");
    startTransition(async () => {
      await moverTarefa(fd);
      router.refresh();
    });
  }

  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <label className="flex min-w-0 cursor-pointer items-center gap-2">
        <input type="checkbox" onChange={concluir} className="h-3.5 w-3.5 shrink-0 accent-gold" />
        <span className="truncate text-stone-200">
          {prioridade === "critica" && "🔥 "}
          {titulo}
        </span>
      </label>
      <span className={`shrink-0 ${situacao === "atrasada" ? "text-wine-bright" : "text-gold"}`}>{prazoLabel}</span>
    </li>
  );
}
