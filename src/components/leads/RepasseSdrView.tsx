"use client";

import { moverRepasse } from "@/app/(app)/leads/actions";
import { diasEntre } from "@/lib/leads-cobranca";
import RepasseKanban, { type EtapaRepasse, type RepasseLeadBase } from "./RepasseKanban";

export type LeadRepasse = RepasseLeadBase & {
  sdr_profile_id: string | null;
  closer_profile_id: string | null;
  origem: string | null;
  canal: string | null;
  dores: string | null;
  recusa_motivo: string | null;
  recusada_em: string | null;
  repasse_sdr_id: string | null;
  repasse_etapa: string | null;
  repasse_desde: string | null;
  repasse_nota: string | null;
};

// Funil "Repasse Entrevistas" (pedido do Diretor, 2026-10-09): entrevistas
// recusadas pelo closer chegam aqui em D+15, atribuídas a um SDR de outro
// Exército. Cada SDR só vê o que está no nome dele.
export const ETAPAS_REPASSE_SDR: EtapaRepasse[] = [
  { valor: "base_repasses", label: "Base de Repasses", cor: "#8b8fa3", dica: "Entrevistas recusadas chegam aqui em D+15." },
  { valor: "tentando_reativacao", label: "Tentando Reativação", cor: "#38bdf8" },
  {
    valor: "entrevista_recuperada",
    label: "Entrevista Recuperada",
    cor: "#34d399",
    dica: "Volta pro funil do closer pra ele validar.",
    travada: true,
  },
  {
    valor: "nao_faz_sentido",
    label: "Não faz sentido recuperar",
    cor: "#f87171",
    travada: true,
    notaObrigatoria: "por que não faz sentido recuperar esse lead",
  },
];

export default function RepasseSdrView({
  leads,
  nomePorId,
  hoje,
  viewerId,
}: {
  leads: LeadRepasse[];
  nomePorId: Map<string, string>;
  hoje: string;
  viewerId: string;
}) {
  return (
    <RepasseKanban
      etapas={ETAPAS_REPASSE_SDR}
      leads={leads}
      getEtapa={(l) => l.repasse_etapa ?? "base_repasses"}
      podeMover={(l) => l.repasse_sdr_id === viewerId}
      mover={moverRepasse}
      vazio="Nenhuma entrevista no seu repasse ainda. Quando um closer recusa uma entrevista, ela chega aqui em D+15."
      linhas={(l) => {
        const out: { texto: string; destaque?: "alerta" | "ok" }[] = [];
        if (l.recusa_motivo) out.push({ texto: `Motivo da recusa: ${l.recusa_motivo}`, destaque: "alerta" });
        out.push({ texto: `SDR original: ${l.sdr_profile_id ? nomePorId.get(l.sdr_profile_id) ?? "—" : "—"}` });
        out.push({ texto: `Closer: ${l.closer_profile_id ? nomePorId.get(l.closer_profile_id) ?? "—" : "—"}` });
        if (l.repasse_sdr_id && l.repasse_sdr_id !== viewerId) {
          out.push({ texto: `👤 Com ${nomePorId.get(l.repasse_sdr_id) ?? "—"}` });
        }
        if (l.repasse_desde && l.repasse_etapa !== "entrevista_recuperada" && l.repasse_etapa !== "nao_faz_sentido") {
          out.push({ texto: `No repasse há ${diasEntre(l.repasse_desde, hoje)}d` });
        }
        return out;
      }}
      tags={(l) => [l.origem ?? "", l.canal ?? ""].filter(Boolean)}
      detalhe={(l) => (
        <>
          {l.recusa_motivo && (
            <p>
              <span className="text-stone-500">Motivo da recusa:</span> <span className="text-wine-bright">{l.recusa_motivo}</span>
            </p>
          )}
          <p>
            <span className="text-stone-500">SDR original:</span> {l.sdr_profile_id ? nomePorId.get(l.sdr_profile_id) ?? "—" : "—"}
          </p>
          <p>
            <span className="text-stone-500">Closer:</span> {l.closer_profile_id ? nomePorId.get(l.closer_profile_id) ?? "—" : "—"}
          </p>
          {l.dores && (
            <p>
              <span className="text-stone-500">Dores:</span> {l.dores}
            </p>
          )}
          {l.origem && (
            <p>
              <span className="text-stone-500">Origem:</span> {l.origem}
            </p>
          )}
          {l.repasse_nota && <p className="text-wine-bright">Não faz sentido: {l.repasse_nota}</p>}
        </>
      )}
    />
  );
}
