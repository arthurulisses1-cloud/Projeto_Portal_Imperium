"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarMotivoPerda, alternarMotivoPerdaAtivo } from "@/app/(app)/leads/actions";
import Card from "@/components/ui/Card";

export type MotivoPerdaLinha = { id: string; nome: string; ativo: boolean; etapa: string | null };

// Mesma lista de ETAPAS_DE_PERDA_VALIDAS em actions.ts / ETAPAS_DE_PERDA em
// LeadsView.tsx — motivo de perda específico por etapa (migration 0059,
// pedido do Diretor, 2026-08-28).
const ETAPAS_DE_PERDA = [
  { valor: "validacao_entrevista", label: "Validação de Entrevista" },
  { valor: "entrevista_validada", label: "Entrevista Validada" },
  { valor: "fechamento", label: "Fechamento" },
  { valor: "subido", label: "Subido" },
  { valor: "ccb_enviada", label: "CCB Enviada" },
  { valor: "assinado", label: "Assinado" },
] as const;

function etapaLabel(etapa: string | null) {
  if (!etapa) return "Qualquer etapa";
  return ETAPAS_DE_PERDA.find((e) => e.valor === etapa)?.label ?? etapa;
}

export default function MotivosPerdaForm({ motivos }: { motivos: MotivoPerdaLinha[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onAlternar(m: MotivoPerdaLinha) {
    const fd = new FormData();
    fd.set("id", m.id);
    fd.set("ativo", String(m.ativo));
    startTransition(async () => {
      await alternarMotivoPerdaAtivo(fd);
      router.refresh();
    });
  }

  return (
    <details className="card-imp group">
      <summary className="kicker flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
        <span>Motivos de Perda (só você vê isso)</span>
        <span className="text-[10px] normal-case text-stone-500 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-4 space-y-4">
        <Card title="Cadastrados">
          {motivos.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhum motivo cadastrado ainda.</p>
          ) : (
            <ul className="space-y-1.5">
              {motivos.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0">
                    <span className={m.ativo ? "text-stone-200" : "text-stone-600 line-through"}>{m.nome}</span>
                    <span className="ml-2 rounded-full bg-imperium-bg px-1.5 py-0.5 text-[10px] text-stone-500">{etapaLabel(m.etapa)}</span>
                  </span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => onAlternar(m)}
                    className="shrink-0 text-[11px] text-stone-500 hover:text-gold-bright"
                  >
                    {m.ativo ? "Desativar" : "Reativar"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              await criarMotivoPerda(fd);
              e.currentTarget.reset();
              router.refresh();
            });
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex-1">
            <label className="mb-1 block text-xs text-stone-400">Novo motivo</label>
            <input name="nome" required placeholder="Ex: Sem interesse no momento" className="input-imp" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-400">Etapa</label>
            <select name="etapa" defaultValue="" className="input-imp w-48">
              <option value="">Qualquer etapa</option>
              {ETAPAS_DE_PERDA.map((e) => (
                <option key={e.valor} value={e.valor}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={isPending} className="btn-gold">
            Adicionar
          </button>
        </form>
      </div>
    </details>
  );
}
