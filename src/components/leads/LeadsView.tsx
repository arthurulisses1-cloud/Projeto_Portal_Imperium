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
  temperatura: "frio" | "morno" | "quente" | null;
  valor_credito: number | null;
};
export type MotivoPerda = { id: string; nome: string; ativo: boolean };

// A partir de Fechamento (inclusive), o lead precisa estar qualificado —
// pedido do Diretor (2026-08-27). Cobre as etapas seguintes também (CCB
// Enviada, Assinado), senão dava pra arrastar direto pra lá sem qualificar.
const ETAPAS_QUE_EXIGEM_QUALIFICACAO = new Set(["fechamento", "subido", "ccb_enviada", "assinado"]);

const TEMPERATURAS = [
  { valor: "frio", label: "Frio", cor: "bg-sky-500" },
  { valor: "morno", label: "Morno", cor: "bg-warning" },
  { valor: "quente", label: "Quente", cor: "bg-wine" },
] as const;

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

// Funil real da operação (migration 0055) — "Perdido" fica fora da
// esteira principal, é uma saída que precisa de motivo.
const COLUNAS = [
  { valor: "validacao_entrevista", label: "Validação de Entrevista", cor: "bg-warning" },
  { valor: "entrevista_validada", label: "Entrevista Validada", cor: "bg-gold" },
  { valor: "fechamento", label: "Fechamento", cor: "bg-purpura" },
  { valor: "subido", label: "Subido", cor: "bg-stone-400" },
  { valor: "ccb_enviada", label: "CCB Enviada", cor: "bg-gold-bright" },
  { valor: "assinado", label: "Assinado", cor: "bg-success" },
  { valor: "perdido", label: "Perdido", cor: "bg-wine" },
] as const;

function dbr(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function LeadsView({
  leads,
  nomePorId,
  motivosPerda,
  exercitoPorProfileId,
}: {
  leads: Lead[];
  nomePorId: Map<string, string>;
  motivosPerda: MotivoPerda[];
  exercitoPorProfileId: Map<string, string | null>;
}) {
  const [leadsState, setLeadsState] = useState(leads);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
  const [leadAberto, setLeadAberto] = useState<string | null>(null);
  const [statusPretendido, setStatusPretendido] = useState<string | null>(null);
  const [filtroExercito, setFiltroExercito] = useState("");
  const [filtroCloser, setFiltroCloser] = useState("");
  const [, startTransition] = useTransition();

  const exercitos = useMemo(
    () => Array.from(new Set(leadsState.map((l) => (l.closer_profile_id ? exercitoPorProfileId.get(l.closer_profile_id) : null)).filter((x): x is string => !!x))).sort(),
    [leadsState, exercitoPorProfileId]
  );
  const closers = useMemo(() => {
    const ids = Array.from(new Set(leadsState.map((l) => l.closer_profile_id).filter((x): x is string => !!x)));
    return ids.map((id) => ({ id, nome: nomePorId.get(id) ?? "—" })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [leadsState, nomePorId]);

  const leadsFiltrados = useMemo(() => {
    return leadsState.filter((l) => {
      if (filtroExercito && (!l.closer_profile_id || exercitoPorProfileId.get(l.closer_profile_id) !== filtroExercito)) return false;
      if (filtroCloser && l.closer_profile_id !== filtroCloser) return false;
      return true;
    });
  }, [leadsState, filtroExercito, filtroCloser, exercitoPorProfileId]);

  const porColuna = useMemo(() => {
    const mapa = new Map<string, Lead[]>();
    for (const c of COLUNAS) mapa.set(c.valor, []);
    for (const l of leadsFiltrados) mapa.get(l.status_followup)?.push(l);
    return mapa;
  }, [leadsFiltrados]);

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
    if (ETAPAS_QUE_EXIGEM_QUALIFICACAO.has(novoStatus) && !(lead.temperatura && lead.valor_credito)) {
      // Mesma lógica: sem Forecast (temperatura) + Valor do Crédito
      // preenchidos, não move sozinho — abre o card já com a etapa alvo
      // selecionada, só falta a pessoa completar e salvar.
      setStatusPretendido(novoStatus);
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
    <div className="space-y-4">
      {(exercitos.length > 1 || closers.length > 1) && (
        <div className="flex flex-wrap items-center gap-3">
          {exercitos.length > 1 && (
            <select value={filtroExercito} onChange={(e) => setFiltroExercito(e.target.value)} className="input-imp text-sm">
              <option value="">Todos os Exércitos</option>
              {exercitos.map((ex) => (
                <option key={ex} value={ex}>
                  {ex}
                </option>
              ))}
            </select>
          )}
          {closers.length > 1 && (
            <select value={filtroCloser} onChange={(e) => setFiltroCloser(e.target.value)} className="input-imp text-sm">
              <option value="">Todos os Closers</option>
              {closers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          )}
          {(filtroExercito || filtroCloser) && (
            <button
              type="button"
              onClick={() => {
                setFiltroExercito("");
                setFiltroCloser("");
              }}
              className="text-xs text-stone-500 underline hover:text-stone-300"
            >
              limpar filtros
            </button>
          )}
        </div>
      )}

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
                  <h2 className="truncate text-xs font-medium text-stone-200">{c.label}</h2>
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
                    className={`cursor-grab space-y-1 rounded-md border border-imperium-line bg-imperium-bg/70 p-2.5 text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${
                      arrastando === l.id ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-stone-100">{l.lead_nome}</p>
                      {l.temperatura && (
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white ${
                            TEMPERATURAS.find((t) => t.valor === l.temperatura)?.cor ?? ""
                          }`}
                        >
                          {TEMPERATURAS.find((t) => t.valor === l.temperatura)?.label}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-stone-500">{dbr(l.data)}</p>
                    {l.valor_credito != null && <p className="text-[11px] font-medium text-gold-bright">{formatarMoeda(l.valor_credito)}</p>}
                    {l.closer_profile_id && (
                      <p className="text-[10px] text-stone-500">
                        {nomePorId.get(l.closer_profile_id) ?? "—"}
                        {exercitoPorProfileId.get(l.closer_profile_id) ? ` · ${exercitoPorProfileId.get(l.closer_profile_id)}` : ""}
                      </p>
                    )}
                    <div className="space-y-0.5 border-t border-imperium-line pt-1 text-[10px] text-stone-500">
                      {l.lead_telefone && <p>📞 {l.lead_telefone}</p>}
                      {l.canal && <p>Canal: {l.canal}</p>}
                      {l.origem && <p>Origem: {l.origem}</p>}
                      {l.entrevistado && <p>Entrevistado: {l.entrevistado}</p>}
                      {l.estado_civil && <p>Est. civil: {l.estado_civil}</p>}
                      {l.decisor && <p>Decisor: {l.decisor}</p>}
                      {l.dores && <p className="line-clamp-2 text-stone-400">Dores: {l.dores}</p>}
                      {l.documentacao_ciente && <p>Doc. ciente: {l.documentacao_ciente}</p>}
                      {l.valores_apresentados && <p>Valores apresentados: {l.valores_apresentados}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {leadAberto && (
        <LeadModal
          lead={leadsState.find((l) => l.id === leadAberto)!}
          statusPretendido={statusPretendido}
          nomePorId={nomePorId}
          motivosPerda={motivosPerda}
          onFechar={() => {
            setLeadAberto(null);
            setStatusPretendido(null);
          }}
          onAtualizarLocal={(atualizado) => setLeadsState((prev) => prev.map((l) => (l.id === atualizado.id ? atualizado : l)))}
        />
      )}
    </div>
  );
}

function LeadModal({
  lead,
  statusPretendido,
  nomePorId,
  motivosPerda,
  onFechar,
  onAtualizarLocal,
}: {
  lead: Lead;
  statusPretendido: string | null;
  nomePorId: Map<string, string>;
  motivosPerda: MotivoPerda[];
  onFechar: () => void;
  onAtualizarLocal: (l: Lead) => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(statusPretendido ?? lead.status_followup);
  const [observacao, setObservacao] = useState(lead.observacao ?? "");
  const [motivoId, setMotivoId] = useState(lead.motivo_perda_id ?? "");
  const [motivoObs, setMotivoObs] = useState(lead.motivo_perda_obs ?? "");
  const [temperatura, setTemperatura] = useState(lead.temperatura ?? "");
  const [valorCredito, setValorCredito] = useState(lead.valor_credito != null ? String(lead.valor_credito) : "");
  const [isPending, startTransition] = useTransition();
  const [salvo, setSalvo] = useState(false);
  const [lembreteCriado, setLembreteCriado] = useState(false);

  const precisaQualificar = ETAPAS_QUE_EXIGEM_QUALIFICACAO.has(status);
  const qualificacaoIncompleta = precisaQualificar && !(temperatura && Number(valorCredito) > 0);

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
    if (qualificacaoIncompleta) return;
    const fd = new FormData();
    fd.set("lead_id", lead.id);
    fd.set("status_followup", status);
    fd.set("observacao", observacao);
    if (temperatura) fd.set("temperatura", temperatura);
    if (valorCredito) fd.set("valor_credito", valorCredito);
    startTransition(async () => {
      await salvarStatusLead(fd);
      onAtualizarLocal({
        ...lead,
        status_followup: status,
        observacao: observacao || null,
        temperatura: (temperatura || lead.temperatura) as Lead["temperatura"],
        valor_credito: valorCredito ? Number(valorCredito) : lead.valor_credito,
      });
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
            <>
              {precisaQualificar && (
                <div className="space-y-2 rounded-md border border-gold/30 bg-gold/5 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-gold-bright">
                    Qualificação obrigatória a partir de Fechamento
                  </p>
                  <div className="flex gap-1.5">
                    {TEMPERATURAS.map((t) => (
                      <button
                        key={t.valor}
                        type="button"
                        onClick={() => setTemperatura(t.valor)}
                        className={`flex-1 rounded-md py-1.5 text-[11px] font-medium uppercase tracking-wide transition ${
                          temperatura === t.valor ? `${t.cor} text-white` : "border border-imperium-line text-stone-400 hover:border-gold/40"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={valorCredito}
                    onChange={(e) => setValorCredito(e.target.value)}
                    placeholder="Valor do crédito (R$)"
                    className="input-imp w-full text-sm"
                  />
                  {qualificacaoIncompleta && (
                    <p className="text-[11px] text-warning-bright">Selecione o Forecast e preencha o Valor do Crédito pra salvar.</p>
                  )}
                </div>
              )}
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Observação (follow-up, proposta enviada, etc.)"
                rows={2}
                className="input-imp w-full text-sm"
              />
            </>
          )}

          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={criarLembrete} disabled={isPending} className="text-[11px] text-stone-500 hover:text-gold-bright">
              {lembreteCriado ? "✓ Lembrete criado" : "🔔 Criar lembrete"}
            </button>
            <button
              type="button"
              onClick={salvarStatus}
              disabled={isPending || (status === "perdido" && !motivoId) || qualificacaoIncompleta}
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
