"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarToqueRecuperacao } from "@/app/(app)/leads/actions";
import { cobrancaDoLead, diasEntre, DIAS_ATE_ROTACIONAR } from "@/lib/leads-cobranca";
import type { Lead } from "./LeadsView";

const ETAPA_LABEL: Record<string, string> = {
  validacao_entrevista: "Validação de Entrevista",
  entrevista_validada: "Entrevista Validada",
  fechamento: "Fechamento",
  subido: "Subido",
  ccb_enviada: "CCB Enviada",
};

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

// Leads parados há 30+ dias que foram redistribuídos (pedido do Diretor,
// 2026-10-09): o closer que recebe faz primeiro um pitch de DIAGNÓSTICO (por
// que não fechou?) e depois tenta recuperar; se não virar em 30 dias, volta
// pro closer original, e assim por diante.
export default function RecuperacaoView({
  leads,
  nomePorId,
  hoje,
  viewerId,
  onAbrirLead,
}: {
  leads: Lead[];
  nomePorId: Map<string, string>;
  hoje: string;
  viewerId: string;
  onAbrirLead: (id: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const ordenados = useMemo(
    () =>
      [...leads].sort((a, b) => {
        const minhaA = a.rot_responsavel_id === viewerId ? 0 : 1;
        const minhaB = b.rot_responsavel_id === viewerId ? 0 : 1;
        if (minhaA !== minhaB) return minhaA - minhaB;
        return (a.rot_desde ?? "").localeCompare(b.rot_desde ?? "");
      }),
    [leads, viewerId]
  );

  function registrar(l: Lead) {
    setErro(null);
    const fd = new FormData();
    fd.set("lead_id", l.id);
    fd.set("nota", nota);
    startTransition(async () => {
      try {
        await registrarToqueRecuperacao(fd);
        setAbertoId(null);
        setNota("");
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao salvar.");
      }
    });
  }

  if (ordenados.length === 0) {
    return (
      <p className="rounded-lg border border-imperium-line px-4 py-8 text-center text-sm text-stone-600">
        Nenhum lead em recuperação. Lead parado há {DIAS_ATE_ROTACIONAR} dias sem movimento cai aqui automaticamente.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {ordenados.map((l) => {
        const meu = l.rot_responsavel_id === viewerId;
        const diasNaFase = l.rot_desde ? diasEntre(l.rot_desde, hoje) : 0;
        const restantes = Math.max(0, DIAS_ATE_ROTACIONAR - diasNaFase);
        const cobranca = cobrancaDoLead(l, hoje);
        const aberto = abertoId === l.id;
        return (
          <div key={l.id} className={`rounded-lg border p-4 ${meu ? "border-gold/50 bg-gold/5" : "border-imperium-line bg-imperium-surface/60"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <button type="button" onClick={() => onAbrirLead(l.id)} className="font-display text-base text-stone-100 hover:text-gold-bright">
                  {l.lead_nome}
                </button>
                <p className="text-xs text-stone-500">
                  Parado em {ETAPA_LABEL[l.status_followup] ?? l.status_followup}
                  {l.valor_credito != null && ` · ${moeda(l.valor_credito)}`}
                  {l.closer_profile_id && ` · closer original ${nomePorId.get(l.closer_profile_id) ?? "—"}`}
                </p>
              </div>
              <div className="text-right text-xs">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white ${
                    l.rot_fase === "diagnostico" ? "bg-purpura" : "bg-sky-600"
                  }`}
                >
                  {l.rot_fase === "diagnostico" ? "Diagnóstico" : "Retorno ao closer original"}
                </span>
                <p className="mt-1 text-stone-400">
                  Com <span className="text-stone-100">{l.rot_responsavel_id ? nomePorId.get(l.rot_responsavel_id) ?? "—" : "—"}</span>
                </p>
                <p className="text-stone-600">
                  dia {diasNaFase} de {DIAS_ATE_ROTACIONAR} · {restantes === 0 ? "passa pro próximo hoje" : `passa pro próximo em ${restantes}d`}
                </p>
              </div>
            </div>

            {cobranca?.tipo === "recuperacao_nova" && meu && (
              <p className="mt-2 text-xs text-warning-bright">
                Lead novo na sua carteira — faça o primeiro contato e registre o que apurou.
              </p>
            )}
            {l.rot_fase === "diagnostico" && (
              <p className="mt-2 text-[11px] text-stone-500">
                Pitch de diagnóstico: entenda por que a venda não fechou antes de tentar vender. Depois, chegue junto pra recuperar.
              </p>
            )}

            {meu && (
              <div className="mt-3">
                {aberto ? (
                  <div className="space-y-2">
                    <textarea
                      value={nota}
                      onChange={(e) => setNota(e.target.value)}
                      rows={3}
                      placeholder="O que o lead disse? Por que não fechou? Próximo passo?"
                      className="input-imp w-full max-w-xl text-sm"
                    />
                    <div className="flex items-center gap-3">
                      <button type="button" disabled={isPending || !nota.trim()} onClick={() => registrar(l)} className="btn-outline px-3 py-1.5 text-xs">
                        {isPending ? "..." : "Registrar contato"}
                      </button>
                      <button type="button" onClick={() => setAbertoId(null)} className="text-xs text-stone-500 hover:text-stone-300">
                        Cancelar
                      </button>
                      {erro && <span className="text-xs text-wine-bright">{erro}</span>}
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setAbertoId(l.id)} className="btn-outline px-3 py-1.5 text-xs">
                      Registrar contato
                    </button>
                    <button type="button" onClick={() => onAbrirLead(l.id)} className="rounded border border-imperium-line px-3 py-1.5 text-xs text-stone-300 hover:border-gold/40">
                      Mover de etapa / perder
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
