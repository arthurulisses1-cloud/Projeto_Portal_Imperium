"use client";

import { useMemo, useState, useTransition } from "react";
import { salvarStatusLead, criarLembreteDeLead } from "@/app/(app)/leads/actions";
import Card from "@/components/ui/Card";
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
};

const STATUS_ORDEM = ["a_contatar", "em_negociacao", "proposta_enviada", "aguardando_documentos", "esfriou", "convertido"] as const;
const STATUS_LABEL: Record<string, string> = {
  a_contatar: "A Contatar",
  em_negociacao: "Em Negociação",
  proposta_enviada: "Proposta Enviada",
  aguardando_documentos: "Aguardando Documentos",
  esfriou: "Esfriou",
  convertido: "Convertido",
};
const STATUS_COR: Record<string, string> = {
  a_contatar: "text-warning-bright",
  em_negociacao: "text-gold-bright",
  proposta_enviada: "text-gold-bright",
  aguardando_documentos: "text-stone-300",
  esfriou: "text-stone-500",
  convertido: "text-success-bright",
};

function dbr(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function LeadsView({ leads, nomePorId }: { leads: Lead[]; nomePorId: Map<string, string> }) {
  const [aba, setAba] = useState<string>("a_contatar");

  const porStatus = useMemo(() => {
    const mapa = new Map<string, Lead[]>();
    for (const s of STATUS_ORDEM) mapa.set(s, []);
    for (const l of leads) mapa.get(l.status_followup)?.push(l);
    return mapa;
  }, [leads]);

  const leadsDaAba = porStatus.get(aba) ?? [];

  return (
    <Card
      title={STATUS_LABEL[aba]}
      right={
        <div className="flex flex-wrap gap-1.5">
          {STATUS_ORDEM.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setAba(s)}
              className={`rounded px-2.5 py-1 text-[10px] uppercase transition ${
                aba === s ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-400 hover:border-gold"
              }`}
            >
              {STATUS_LABEL[s]} ({(porStatus.get(s) ?? []).length})
            </button>
          ))}
        </div>
      }
    >
      {leadsDaAba.length === 0 ? (
        <p className="text-sm text-stone-500">Nenhum lead neste status.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {leadsDaAba.map((l) => (
            <LeadCard key={l.id} lead={l} nomePorId={nomePorId} />
          ))}
        </div>
      )}
    </Card>
  );
}

function LeadCard({ lead, nomePorId }: { lead: Lead; nomePorId: Map<string, string> }) {
  const [status, setStatus] = useState(lead.status_followup);
  const [observacao, setObservacao] = useState(lead.observacao ?? "");
  const [isPending, startTransition] = useTransition();
  const [salvo, setSalvo] = useState(false);
  const [lembreteCriado, setLembreteCriado] = useState(false);

  function salvar() {
    const fd = new FormData();
    fd.set("lead_id", lead.id);
    fd.set("status_followup", status);
    fd.set("observacao", observacao);
    startTransition(async () => {
      await salvarStatusLead(fd);
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2000);
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
    });
  }

  return (
    <div className="rounded-lg border border-imperium-line bg-imperium-bg/40 p-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-stone-100">{lead.lead_nome}</p>
          <p className="text-[11px] text-stone-500">{dbr(lead.data)}</p>
        </div>
        <span className={`text-[11px] uppercase ${STATUS_COR[lead.status_followup] ?? "text-stone-400"}`}>{STATUS_LABEL[lead.status_followup]}</span>
      </div>

      <div className="mt-2 space-y-0.5 text-[11px] text-stone-500">
        {lead.lead_telefone && <p>📞 {lead.lead_telefone}</p>}
        <p>
          SDR {lead.sdr_profile_id ? nomePorId.get(lead.sdr_profile_id) ?? "—" : "—"} · Closer{" "}
          {lead.closer_profile_id ? nomePorId.get(lead.closer_profile_id) ?? "—" : "—"}
        </p>
        {lead.canal && <p>Canal: {lead.canal}</p>}
        {lead.decisor && <p>Decisor: {lead.decisor}</p>}
        {lead.dores && <p className="text-stone-400">Dores: {lead.dores}</p>}
        {lead.documentacao_ciente && <p>Documentação ciente: {lead.documentacao_ciente}</p>}
        {lead.valores_apresentados && <p>Valores apresentados: {lead.valores_apresentados}</p>}
      </div>

      <div className="mt-3 space-y-1.5 border-t border-imperium-line pt-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="input-imp w-full text-xs">
          {STATUS_ORDEM.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Observação (follow-up, proposta enviada, etc.)"
          rows={2}
          className="input-imp w-full text-xs"
        />
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={criarLembrete} disabled={isPending} className="text-[11px] text-stone-500 hover:text-gold-bright">
            {lembreteCriado ? "✓ Lembrete criado" : "🔔 Criar lembrete"}
          </button>
          <button type="button" onClick={salvar} disabled={isPending} className="btn-outline px-3 py-1 text-[11px]">
            {isPending ? "..." : salvo ? <IconCheck className="mx-auto h-3 w-3" /> : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
