"use client";

import { moverRepasseCloser } from "@/app/(app)/leads/actions";
import { cobrancaDoLead, diasEntre, DIAS_ATE_ROTACIONAR } from "@/lib/leads-cobranca";
import RepasseKanban, { type EtapaRepasse } from "./RepasseKanban";
import type { Lead } from "./LeadsView";

// Funil de Repasse dos closers (pedido do Diretor, 2026-10-09): lead parado há
// 30+ dias sem movimento vai pro próximo closer da fila, que faz primeiro um
// pitch de DIAGNÓSTICO (por que não fechou?) e depois tenta recuperar; sem
// virar em 30 dias, volta pro closer original, e assim por diante. Mesma
// estrutura do funil de Repasse de Entrevistas dos SDRs.
export const ETAPAS_REPASSE_CLOSER: EtapaRepasse[] = [
  { valor: "base_repasses", label: "Base de Repasses", cor: "#8b8fa3", dica: "Leads parados chegam aqui." },
  {
    valor: "diagnostico",
    label: "Diagnóstico",
    cor: "#a78bfa",
    dica: "Entenda por que a venda não fechou.",
    notaObrigatoria: "o que o lead disse sobre por que não fechou",
  },
  { valor: "tentando_recuperar", label: "Tentando Recuperar", cor: "#38bdf8" },
  { valor: "recuperado", label: "Recuperado", cor: "#34d399", dica: "Voltou pro funil principal.", travada: true },
  {
    valor: "nao_faz_sentido",
    label: "Não faz sentido recuperar",
    cor: "#f87171",
    travada: true,
    notaObrigatoria: "por que não faz sentido recuperar esse lead",
  },
];

const ETAPA_LABEL: Record<string, string> = {
  entrevista_validada: "Entrevista Validada",
  fechamento: "Fechamento",
  subido: "Subido",
  ccb_enviada: "CCB Enviada",
};

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
  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500">
        Lead sem movimento por {DIAS_ATE_ROTACIONAR} dias passa pro próximo closer da fila (pitch de diagnóstico), depois volta pro closer
        original, e o ciclo segue. &quot;Não faz sentido recuperar&quot; trava o lead — ele não é mais repassado.
      </p>
      <RepasseKanban
        etapas={ETAPAS_REPASSE_CLOSER}
        leads={leads}
        getEtapa={(l) => l.rot_etapa ?? "base_repasses"}
        podeMover={(l) => l.rot_responsavel_id === viewerId}
        mover={moverRepasseCloser}
        vazio={`Nenhum lead em repasse. Lead parado há ${DIAS_ATE_ROTACIONAR} dias sem movimento cai aqui automaticamente.`}
        linhas={(l) => {
          const out: { texto: string; destaque?: "alerta" | "ok" }[] = [];
          out.push({ texto: `Parado em ${ETAPA_LABEL[l.status_followup] ?? l.status_followup}` });
          if (l.rot_responsavel_id) out.push({ texto: `👤 Com ${nomePorId.get(l.rot_responsavel_id) ?? "—"}` });
          if (l.closer_profile_id && l.closer_profile_id !== l.rot_responsavel_id) {
            out.push({ texto: `Closer original: ${nomePorId.get(l.closer_profile_id) ?? "—"}` });
          }
          if (l.rot_etapa && l.rot_etapa !== "recuperado" && l.rot_etapa !== "nao_faz_sentido" && l.rot_desde) {
            const dias = diasEntre(l.rot_desde, hoje);
            const rest = Math.max(0, DIAS_ATE_ROTACIONAR - dias);
            out.push({
              texto: `🕒 dia ${dias} de ${DIAS_ATE_ROTACIONAR} · ${rest === 0 ? "passa pro próximo hoje" : `próximo em ${rest}d`}`,
              destaque: rest <= 5 ? "alerta" : undefined,
            });
          }
          const c = cobrancaDoLead(l, hoje);
          if (c?.tipo === "recuperacao_nova" && l.rot_responsavel_id === viewerId) {
            out.push({ texto: "Novo na sua carteira — faça o primeiro contato", destaque: "alerta" });
          }
          return out;
        }}
        tags={(l) => [l.rot_fase === "diagnostico" ? "Outro closer" : l.rot_fase === "retorno_original" ? "Voltou ao original" : "", l.temperatura ?? ""].filter(Boolean)}
        detalhe={(l) => (
          <>
            {l.dores && <p>Dores: {l.dores}</p>}
            {l.observacao && <p>Obs: {l.observacao}</p>}
            {l.rot_nota && <p className="text-wine-bright">Não faz sentido: {l.rot_nota}</p>}
            <button type="button" onClick={() => onAbrirLead(l.id)} className="mt-2 text-xs text-gold-bright underline">
              Abrir card completo (mover de etapa no funil / perder)
            </button>
          </>
        )}
      />
    </div>
  );
}
