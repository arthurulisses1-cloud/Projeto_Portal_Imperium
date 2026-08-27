"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarStatusLead, salvarPerdaLead, criarLembreteDeLead } from "@/app/(app)/leads/actions";
import { IconCheck } from "@/components/ui/icons";

export type Lead = {
  id: string;
  data: string;
  lead_nome: string;
  lead_telefone: string | null;
  sdr_profile_id: string | null;
  closer_profile_id: string | null;
  canal: string | null;
  origem: string | null;
  entrevistado: string | null;
  estado_civil: string | null;
  decisor: string | null;
  dores: string | null;
  documentacao_ciente: string | null;
  valores_apresentados: string | null;
  status_followup: string;
  observacao: string | null;
  motivo_perda_id: string | null;
  motivo_perda_obs: string | null;
};
export type MotivoPerda = { id: string; nome: string; ativo: boolean };

const COLUNAS = [
  { valor: "a_contatar", label: "A Contatar", cor: "bg-warning" },
  { valor: "em_negociacao", label: "Em Negociação", cor: "bg-gold" },
  { valor: "proposta_enviada", label: "Proposta Enviada", cor: "bg-purpura" },
  { valor: "aguardando_documentos", label: "Aguardando Docs", cor: "bg-stone-400" },
  { valor: "convertido", label: "Convertido", cor: "bg-success" },
  { valor: "perdido", label: "Perdido", cor: "bg-wine" },
  { valor: "esfriou", label: "Esfriou", cor: "bg-stone-600" },
] as const;

function dbr(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function LeadsView({
  leads,
  nomePorId,
  motivosPerda,
}: {
  leads: Lead[];
  nomePorId: Map<string, string>;
  motivosPerda: MotivoPerda[];
}) {
  const [leadsState, setLeadsState] = useState(leads);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
  const [leadAberto, setLeadAberto] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const porColuna = useMemo(() => {
    const mapa = new Map<string, Lead[]>();
    for (const c of COLUNAS) mapa.set(c.valor, []);
    for (const l of leadsState) mapa.get(l.status_followup)?.push(l);
    return mapa;
  }, [leadsState]);

  function moverStatus(leadId: string, novoStatus: string) {
    const lead = leadsState.find((l) => l.id === leadId);
    if (!lead || lead.status_followup === novoStatus) return;
    if (novoStatus === "perdido") {
      // Perda precisa de motivo — não move sozinho, abre o card pra
      // preencher o motivo em vez de silenciosamente marcar como perdido
      // sem explicação nenhuma.
      setLeadAberto(leadId);
      return;
    }
    const anterior = lead.status_followup;
    setLeadsState((prev) => prev.map((l) => (l.id === leadId ? { ...l, status_followup: novoStatus } : l)));
    startTransition(async () => {
      const fd = new FormData();
      fd.set("lead_id", leadId);
      fd.set("status_followup", novoStatus);
      fd.set("observacao", lead.observacao ?? "");
      try {
        await salvarStatusLead(fd);
      } catch {
        setLeadsState((prev) => prev.map((l) => (l.id === leadId ? { ...l, status_followup: anterior } : l)));
      }
    });
  }

  return (
    <div className="flex gap-4">
      {COLUNAS.map((c) => {
        const itens = porColuna.get(c.valor) ?? [];
        const emDrop = colunaAlvo === c.valor;
        return (
          <div
            key={c.valor}
            onDragOver={(e) => {
              e.preventDefault();
              setColunaAlvo(c.valor);
            }}
            onDragLeave={() => setColunaAlvo((cur) => (cur === c.valor ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              setColunaAlvo(null);
              const id = arrastando;
              setArrastando(null);
              if (id) moverStatus(id, c.valor);
            }}
            className={`flex min-w-0 flex-1 flex-col rounded-lg border bg-imperium-surface/60 transition ${
              emDrop ? "border-gold/60 bg-gold/5" : "border-imperium-line"
            }`}
          >
            <div className="flex items-center justify-between gap-2 border-b border-imperium-line px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${c.cor}`} />
                <h2 className="truncate text-sm font-medium text-stone-200">{c.label}</h2>
              </div>
              <span className="shrink-0 rounded-full bg-imperium-bg/60 px-2 py-0.5 text-[11px] text-stone-500">{itens.length}</span>
            </div>

            <div className="flex-1 space-y-2 p-2.5">
              {itens.length === 0 && <p className="text-center text-xs text-stone-600">Vazio.</p>}
              {itens.map((l) => (
                <div
                  key={l.id}
                  draggable
                  onDragStart={(e) => {
                    setArrastando(l.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setArrastando(null);
                    setColunaAlvo(null);
                  }}
                  onClick={() => setLeadAberto(l.id)}
                  className={`cursor-grab rounded-md border border-imperium-line bg-imperium-bg/70 p-2.5 text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${
                    arrastando === l.id ? "opacity-40" : ""
                  }`}
                >
                  <p className="text-stone-100">{l.lead_nome}</p>
                  <p className="mt-0.5 text-[10px] text-stone-500">{dbr(l.data)}</p>
                  {l.closer_profile_id && (
                    <p className="mt-1 text-[10px] text-stone-600">{nomePorId.get(l.closer_profile_id) ?? "—"}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {leadAberto && (
        <LeadModal
          lead={leadsState.find((l) => l.id === leadAberto)!}
          nomePorId={nomePorId}
          motivosPerda={motivosPerda}
          onFechar={() => setLeadAberto(null)}
          onAtualizarLocal={(atualizado) => setLeadsState((prev) => prev.map((l) => (l.id === atualizado.id ? atualizado : l)))}
        />
      )}
    </div>
  );
}

function LeadModal({
  lead,
  nomePorId,
  motivosPerda,
  onFechar,
  onAtualizarLocal,
}: {
  lead: Lead;
  nomePorId: Map<string, string>;
  motivosPerda: MotivoPerda[];
  onFechar: () => void;
  onAtualizarLocal: (l: Lead) => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(lead.status_followup);
  const [observacao, setObservacao] = useState(lead.observacao ?? "");
  const [motivoId, setMotivoId] = useState(lead.motivo_perda_id ?? "");
  const [motivoObs, setMotivoObs] = useState(lead.motivo_perda_obs ?? "");
  const [isPending, startTransition] = useTransition();
  const [salvo, setSalvo] = useState(false);
  const [lembreteCriado, setLembreteCriado] = useState(false);

  function salvarStatus() {
    if (status === "perdido") {
      if (!motivoId) return;
      const fd = new FormData();
      fd.set("lead_id", lead.id);
      fd.set("motivo_perda_id", motivoId);
      fd.set("motivo_perda_obs", motivoObs);
      startTransition(async () => {
        await salvarPerdaLead(fd);
        onAtualizarLocal({ ...lead, status_followup: "perdido", motivo_perda_id: motivoId, motivo_perda_obs: motivoObs || null });
        setSalvo(true);
        setTimeout(() => setSalvo(false), 1500);
        router.refresh();
      });
      return;
    }
    const fd = new FormData();
    fd.set("lead_id", lead.id);
    fd.set("status_followup", status);
    fd.set("observacao", observacao);
    startTransition(async () => {
      await salvarStatusLead(fd);
      onAtualizarLocal({ ...lead, status_followup: status, observacao: observacao || null });
      setSalvo(true);
      setTimeout(() => setSalvo(false), 1500);
      router.refresh();
    });
  }

  function criarLembrete() {
    const fd = new FormData();
    fd.set("lead_id", lead.id);
    fd.set("lead_nome", lead.lead_nome);
    startTransition(async () => {
      await criarLembreteDeLead(fd);
      setLembreteCriado(true);
      setTimeout(() => setLembreteCriado(false), 2000);
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="card-imp my-8 w-full max-w-lg space-y-4 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg text-gold-bright">{lead.lead_nome}</h3>
            <p className="text-xs text-stone-500">{dbr(lead.data)}</p>
          </div>
          <button type="button" onClick={onFechar} className="text-stone-500 hover:text-stone-200">
            ✕
          </button>
        </div>

        <div className="space-y-0.5 text-xs text-stone-400">
          {lead.lead_telefone && <p>📞 {lead.lead_telefone}</p>}
          <p>
            SDR {lead.sdr_profile_id ? nomePorId.get(lead.sdr_profile_id) ?? "—" : "—"} · Closer{" "}
            {lead.closer_profile_id ? nomePorId.get(lead.closer_profile_id) ?? "—" : "—"}
          </p>
          {lead.canal && <p>Canal: {lead.canal}</p>}
          {lead.origem && <p>Origem: {lead.origem}</p>}
          {lead.entrevistado && <p>Entrevistado: {lead.entrevistado}</p>}
          {lead.estado_civil && <p>Estado civil: {lead.estado_civil}</p>}
          {lead.decisor && <p>Decisor: {lead.decisor}</p>}
          {lead.dores && <p className="text-stone-300">Dores: {lead.dores}</p>}
          {lead.documentacao_ciente && <p>Documentação ciente: {lead.documentacao_ciente}</p>}
          {lead.valores_apresentados && <p>Valores apresentados: {lead.valores_apresentados}</p>}
        </div>

        <div className="space-y-2 border-t border-imperium-line pt-3">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-imp w-full text-sm">
            {COLUNAS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.label}
              </option>
            ))}
          </select>

          {status === "perdido" ? (
            <>
              <select value={motivoId} onChange={(e) => setMotivoId(e.target.value)} className="input-imp w-full text-sm">
                <option value="" disabled>
                  Motivo da perda...
                </option>
                {motivosPerda.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
              <textarea
                value={motivoObs}
                onChange={(e) => setMotivoObs(e.target.value)}
                placeholder="Observação sobre a perda (opcional)"
                rows={2}
                className="input-imp w-full text-sm"
              />
              {motivosPerda.length === 0 && (
                <p className="text-[11px] text-warning-bright">Nenhum motivo cadastrado ainda — peça pro Diretor cadastrar em &quot;Motivos de Perda&quot;.</p>
              )}
            </>
          ) : (
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Observação (follow-up, proposta enviada, etc.)"
              rows={2}
              className="input-imp w-full text-sm"
            />
          )}

          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={criarLembrete} disabled={isPending} className="text-[11px] text-stone-500 hover:text-gold-bright">
              {lembreteCriado ? "✓ Lembrete criado" : "🔔 Criar lembrete"}
            </button>
            <button
              type="button"
              onClick={salvarStatus}
              disabled={isPending || (status === "perdido" && !motivoId)}
              className="btn-outline px-3 py-1.5 text-xs"
            >
              {isPending ? "..." : salvo ? <IconCheck className="mx-auto h-3 w-3" /> : "Salvar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
