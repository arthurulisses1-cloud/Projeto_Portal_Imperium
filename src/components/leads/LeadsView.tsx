"use client";

import { Fragment, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  salvarStatusLead,
  salvarPerdaLead,
  criarLembreteDeLead,
  enviarParaReanalise,
  resolverReanalise,
  registrarAtualizacaoLead,
} from "@/app/(app)/leads/actions";
import { IconCheck } from "@/components/ui/icons";
import { BALDE_LABELS, type Balde } from "@/lib/forecast";
import { hojeBR } from "@/lib/data-br";
import { createClient } from "@/lib/supabase/client";
import { cobrancaDoLead, responsavelDoLead, diasEntre, type Cobranca } from "@/lib/leads-cobranca";
import { ETAPAS_REPASSE, dataDoRepasse } from "@/lib/leads-repasse";
import SubidosView from "./SubidosView";
import RecuperacaoView from "./RecuperacaoView";
import RepasseSdrView from "./RepasseSdrView";

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
  // De qual etapa o lead saiu quando foi marcado Perdido (migration 0059,
  // pedido do Diretor, 2026-08-28) — define quais motivos aparecem pra
  // escolher, e fica registrado pra sempre pra análise depois.
  motivo_perda_etapa: string | null;
  temperatura: "frio" | "morno" | "quente" | null;
  valor_credito: number | null;
  // Mesma classificação do Forecast (aguardando pagamento, pendência,
  // jurídico, esfriou, reanálise, já pago...), calculada ao vivo em
  // leads/page.tsx pra quem já chegou em Assinado/Pago — pedido do Diretor
  // (2026-08-27). null pra quem ainda não chegou lá, ou não achou match.
  classificacao: Balde | null;
  // Segundo funil (migration 0062, pedido do Diretor, 2026-08-28) — quando
  // true, o lead some do funil principal e aparece no funil de Reanálise
  // (mesma tela, um toggle). status_followup nunca muda por causa disso.
  em_reanalise: boolean;
  reanalise_data: string | null;
  // Subidos + compliance + cobrança + rotação (migration 0089).
  status_em: string | null;
  subido_em: string | null;
  subido_obs: string | null;
  compliance_resultado_id: string | null;
  compliance_comportamento: string | null;
  compliance_obs: string | null;
  compliance_atualizado_em: string | null;
  pendencia_prazo: string | null;
  ultima_atualizacao_em: string | null;
  ultimo_movimento_em: string | null;
  rot_responsavel_id: string | null;
  rot_fase: string | null;
  rot_etapa: string | null;
  rot_nota: string | null;
  rot_desde: string | null;
  rot_primeiro_toque_em: string | null;
  rot_ciclos: number;
  // Entrevista recusada + repasse pra SDR (migration 0090).
  recusada_em: string | null;
  recusa_motivo: string | null;
  repasse_sdr_id: string | null;
  repasse_etapa: string | null;
  repasse_desde: string | null;
  repasse_nota: string | null;
};
export type ComplianceResultado = { id: string; nome: string; comportamento: string; ativo: boolean };
// etapa null = motivo universal, aparece em qualquer etapa (migration 0059).
export type MotivoPerda = { id: string; nome: string; ativo: boolean; etapa: string | null };

// Etapas de onde um lead pode "cair" — tudo antes de Perdido/Pago, que já
// são saídas em si. Mesma lista de ETAPAS_DE_PERDA_VALIDAS em actions.ts.
const ETAPAS_DE_PERDA = [
  { valor: "validacao_entrevista", label: "Validação de Entrevista" },
  { valor: "entrevista_validada", label: "Entrevista Validada" },
  { valor: "fechamento", label: "Fechamento" },
  { valor: "subido", label: "Subido" },
  { valor: "ccb_enviada", label: "CCB Enviada" },
  { valor: "assinado", label: "Assinado" },
] as const;

const BALDE_CORES: Record<Balde, string> = {
  pago: "bg-success-bright",
  aguardando: "bg-success",
  pendencia: "bg-warning",
  juridico: "bg-purpura",
  esfriou: "bg-stone-500",
  reanalise: "bg-gold",
  naoClassificado: "bg-stone-600",
};

// A partir de Fechamento (inclusive), o lead precisa estar qualificado —
// pedido do Diretor (2026-08-27). Cobre as etapas seguintes também (CCB
// Enviada, Assinado, Pago), senão dava pra arrastar direto pra lá sem qualificar.
const ETAPAS_QUE_EXIGEM_QUALIFICACAO = new Set(["fechamento", "subido", "ccb_enviada", "assinado", "pago"]);

// Reanálise (migration 0062) só faz sentido a partir de onde o
// compliance/jurídico entra em cena — mesmo corte de ETAPAS_QUE_PODEM_IR_PARA_REANALISE em actions.ts.
const ETAPAS_QUE_PODEM_IR_PARA_REANALISE = new Set(["subido", "ccb_enviada", "assinado"]);

const TEMPERATURAS = [
  { valor: "frio", label: "Frio", cor: "bg-sky-500" },
  { valor: "morno", label: "Morno", cor: "bg-warning" },
  { valor: "quente", label: "Quente", cor: "bg-wine" },
] as const;

function formatarMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

// Funil real da operação (migration 0055) — "Perdido" fica fora da
// esteira principal, é uma saída que precisa de motivo. "Pago" (migration
// 0058) vem depois de Assinado: o sync distingue sozinho, pela aba
// Assinado, entre operação só assinada e já paga.
const COLUNAS = [
  { valor: "validacao_entrevista", label: "Validação de Entrevista", cor: "bg-warning", hex: "#f59e0b" },
  { valor: "entrevista_recusada", label: "Entrevista Recusada", cor: "bg-wine", hex: "#fb7185" },
  { valor: "entrevista_validada", label: "Entrevista Validada", cor: "bg-gold", hex: "#d4af37" },
  { valor: "fechamento", label: "Fechamento", cor: "bg-purpura", hex: "#a78bfa" },
  { valor: "subido", label: "Subido", cor: "bg-stone-400", hex: "#38bdf8" },
  { valor: "ccb_enviada", label: "CCB Enviada", cor: "bg-gold-bright", hex: "#f4d77a" },
  { valor: "assinado", label: "Assinado", cor: "bg-success", hex: "#34d399" },
  { valor: "pago", label: "Pago", cor: "bg-success-bright", hex: "#10b981" },
  { valor: "perdido", label: "Perdido", cor: "bg-wine", hex: "#be123c" },
] as const;

function iniciais(nome: string) {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function dbr(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR");
}

// Cor da tag de data de reanálise conforme a urgência — mesma lógica visual
// de "Atrasada"/"Hoje" já usada no widget de tarefas do Mural.
function corReanalise(dataStr: string) {
  const hoje = hojeBR();
  if (dataStr < hoje) return "bg-wine";
  if (dataStr === hoje) return "bg-gold";
  return "bg-stone-500";
}

export default function LeadsView({
  leads,
  nomePorId,
  motivosPerda,
  exercitoPorProfileId,
  resultadosCompliance,
  viewerId,
  hoje,
  modo = "completo",
  verRepasseSdr = false,
  visaoInicial,
  adminSubidos,
  adminPerdas,
}: {
  leads: Lead[];
  nomePorId: Map<string, string>;
  motivosPerda: MotivoPerda[];
  exercitoPorProfileId: Map<string, string | null>;
  resultadosCompliance: ComplianceResultado[];
  viewerId: string;
  hoje: string;
  // "sdr": só o funil de Repasse de Entrevistas (SDR não vê o resto).
  modo?: "completo" | "sdr";
  verRepasseSdr?: boolean;
  visaoInicial?: string;
  // Catálogo de resultados do compliance (só Diretor) — aparece dentro da visão Subidos.
  adminSubidos?: ReactNode;
  // Catálogo de motivos de perda (só Diretor) — aparece dentro do Funil Principal.
  adminPerdas?: ReactNode;
}) {
  const [leadsState, setLeadsState] = useState(leads);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<string | null>(null);
  const [leadAberto, setLeadAberto] = useState<string | null>(null);
  const [statusPretendido, setStatusPretendido] = useState<string | null>(null);
  // Segundo funil (migration 0062, pedido do Diretor, 2026-08-28: "não
  // crie outra aba, basta em Meus Leads termos a opção de ver esse segundo
  // funil") — toggle simples em vez de rota nova, reaproveita o board
  // inteiro (colunas, filtros, modal), só troca qual recorte de leads entra.
  type Visao = "principal" | "subidos" | "recuperacao" | "reanalise" | "repasse";
  const visoesPermitidas: Visao[] =
    modo === "sdr" ? ["repasse"] : ["principal", "subidos", "recuperacao", "reanalise", ...(verRepasseSdr ? (["repasse"] as Visao[]) : [])];
  const [visao, setVisao] = useState<Visao>(
    visoesPermitidas.includes(visaoInicial as Visao) ? (visaoInicial as Visao) : visoesPermitidas[0]
  );
  // Multi-seleção (pedido do Diretor, 2026-08-27: "tire da forma de filtro
  // único, coloque de forma que eu possa selecionar vários") — vazio = sem
  // filtro (mostra tudo), cada Set guarda os valores marcados.
  const [filtroExercitos, setFiltroExercitos] = useState<Set<string>>(new Set());
  const [filtroClosers, setFiltroClosers] = useState<Set<string>>(new Set());
  const [filtroTemperaturas, setFiltroTemperaturas] = useState<Set<string>>(new Set());
  const [filtroClassificacoes, setFiltroClassificacoes] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [, startTransition] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);

  // Recorte da visão atual — o board inteiro (colunas, filtros, contagens)
  // roda em cima disso. status_followup nunca muda por causa da reanálise,
  // então "voltar pro funil" é literalmente só trocar em_reanalise de volta.
  const leadsDaVisao = useMemo(
    () => leadsState.filter((l) => (visao === "reanalise" ? l.em_reanalise : !l.em_reanalise && !l.rot_fase)),
    [leadsState, visao]
  );
  const totalReanalise = useMemo(() => leadsState.filter((l) => l.em_reanalise).length, [leadsState]);
  const totalPrincipal = useMemo(() => leadsState.filter((l) => !l.em_reanalise && !l.rot_fase).length, [leadsState]);
  const leadsSubidos = useMemo(
    () => leadsState.filter((l) => l.status_followup === "subido" && !l.em_reanalise),
    [leadsState]
  );
  const leadsRepasseSdr = useMemo(() => leadsState.filter((l) => !!l.repasse_etapa), [leadsState]);
  const totalRepasseSdrAtivo = leadsRepasseSdr.filter((l) => l.repasse_etapa === "base_repasses" || l.repasse_etapa === "tentando_reativacao").length;
  const leadsRecuperacao = useMemo(() => leadsState.filter((l) => !!l.rot_etapa && !l.em_reanalise), [leadsState]);

  // Cobranças pendentes (selo vermelho nas abas) — só do que está sob
  // responsabilidade de quem está olhando.
  const cobrancaPorLead = useMemo(() => {
    const mapa = new Map<string, Cobranca>();
    for (const l of leadsState) {
      const c = cobrancaDoLead(l, hoje);
      if (c) mapa.set(l.id, c);
    }
    return mapa;
  }, [leadsState, hoje]);
  const minhasPendentes = (lista: Lead[]) =>
    lista.filter((l) => cobrancaPorLead.has(l.id) && responsavelDoLead(l) === viewerId).length;
  const pendSubidos = minhasPendentes(leadsSubidos);
  const pendRecuperacao = minhasPendentes(leadsRecuperacao.filter((l) => !!l.rot_fase));
  const totalRecuperacaoAtiva = leadsRecuperacao.filter((l) => !!l.rot_fase && l.rot_etapa !== "nao_faz_sentido").length;
  const pendPrincipal = minhasPendentes(leadsState.filter((l) => !l.rot_fase && l.status_followup !== "subido"));

  const exercitos = useMemo(
    () => Array.from(new Set(leadsDaVisao.map((l) => (l.closer_profile_id ? exercitoPorProfileId.get(l.closer_profile_id) : null)).filter((x): x is string => !!x))).sort(),
    [leadsDaVisao, exercitoPorProfileId]
  );
  const closers = useMemo(() => {
    const ids = Array.from(new Set(leadsDaVisao.map((l) => l.closer_profile_id).filter((x): x is string => !!x)));
    return ids.map((id) => ({ id, nome: nomePorId.get(id) ?? "—" })).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [leadsDaVisao, nomePorId]);

  const buscaNormalizada = busca.trim().toLowerCase();

  const leadsFiltrados = useMemo(() => {
    return leadsDaVisao.filter((l) => {
      if (filtroExercitos.size > 0) {
        const ex = l.closer_profile_id ? exercitoPorProfileId.get(l.closer_profile_id) : null;
        if (!ex || !filtroExercitos.has(ex)) return false;
      }
      if (filtroClosers.size > 0 && (!l.closer_profile_id || !filtroClosers.has(l.closer_profile_id))) return false;
      if (filtroTemperaturas.size > 0 && (!l.temperatura || !filtroTemperaturas.has(l.temperatura))) return false;
      if (filtroClassificacoes.size > 0 && (!l.classificacao || !filtroClassificacoes.has(l.classificacao))) return false;
      if (buscaNormalizada) {
        const alvo = `${l.lead_nome} ${l.lead_telefone ?? ""}`.toLowerCase();
        if (!alvo.includes(buscaNormalizada)) return false;
      }
      return true;
    });
  }, [leadsDaVisao, filtroExercitos, filtroClosers, filtroTemperaturas, filtroClassificacoes, buscaNormalizada, exercitoPorProfileId]);

  const porColuna = useMemo(() => {
    const mapa = new Map<string, Lead[]>();
    for (const c of COLUNAS) mapa.set(c.valor, []);
    for (const l of leadsFiltrados) mapa.get(l.status_followup)?.push(l);
    return mapa;
  }, [leadsFiltrados]);

  function moverStatus(leadId: string, novoStatus: string) {
    const lead = leadsState.find((l) => l.id === leadId);
    if (!lead || lead.status_followup === novoStatus) return;
    setAviso(null);
    if (lead.status_followup === "entrevista_recusada" && (lead.repasse_sdr_id || lead.repasse_etapa)) {
      setAviso("Esse lead já está em repasse com um SDR — ele volta pra você quando a entrevista for recuperada.");
      return;
    }
    if (novoStatus === "entrevista_recusada") {
      if (lead.status_followup !== "validacao_entrevista") {
        setAviso("Só dá pra recusar uma entrevista que ainda está em Validação de Entrevista.");
        return;
      }
      // Poka-yoke: abre o card pra confirmar a recusa e informar o motivo.
      setStatusPretendido(novoStatus);
      setLeadAberto(leadId);
      return;
    }
    if (novoStatus === "perdido") {
      // Perda precisa de motivo — não move sozinho, abre o card pra
      // preencher o motivo em vez de silenciosamente marcar como perdido
      // sem explicação nenhuma.
      setLeadAberto(leadId);
      return;
    }
    if (
      (ETAPAS_QUE_EXIGEM_QUALIFICACAO.has(novoStatus) && !(lead.temperatura && lead.valor_credito)) ||
      (novoStatus === "subido" && !lead.subido_em)
    ) {
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
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["principal", `Funil Principal (${totalPrincipal})`, pendPrincipal],
            ["subidos", `📤 Subidos (${leadsSubidos.length})`, pendSubidos],
            ["recuperacao", `🔁 Repasse Closers (${totalRecuperacaoAtiva})`, pendRecuperacao],
            ["reanalise", `⚖️ Funil de Reanálise (${totalReanalise})`, 0],
            ["repasse", `📨 Repasse Entrevistas (${totalRepasseSdrAtivo})`, 0],
          ] as const
        )
          .filter(([valor]) => visoesPermitidas.includes(valor))
          .map(([valor, label, pend]) => (
          <button
            key={valor}
            type="button"
            onClick={() => setVisao(valor)}
            className={`relative rounded-md px-3 py-1.5 text-sm font-medium transition ${
              visao === valor ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-400 hover:border-gold/40"
            }`}
          >
            {label}
            {pend > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-wine px-1 text-[10px] font-bold text-white">
                {pend}
              </span>
            )}
          </button>
        ))}
      </div>

      {visao === "repasse" && <RepasseSdrView leads={leadsRepasseSdr} nomePorId={nomePorId} hoje={hoje} viewerId={viewerId} />}
      {visao === "subidos" && (
        <SubidosView
          leads={leadsSubidos}
          resultados={resultadosCompliance}
          nomePorId={nomePorId}
          hoje={hoje}
          viewerId={viewerId}
          onAbrirLead={setLeadAberto}
        />
      )}
      {visao === "subidos" && adminSubidos}
      {visao === "recuperacao" && (
        <RecuperacaoView leads={leadsRecuperacao} nomePorId={nomePorId} hoje={hoje} viewerId={viewerId} onAbrirLead={setLeadAberto} />
      )}

      {(visao === "principal" || visao === "reanalise") && (
      <>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Pesquisar por nome ou telefone..."
          className="input-imp w-60 text-sm"
        />
        {exercitos.length > 1 && (
          <MultiSelectFiltro
            label="Exército"
            opcoes={exercitos.map((ex) => ({ valor: ex, label: ex }))}
            selecionados={filtroExercitos}
            onChange={setFiltroExercitos}
          />
        )}
        {closers.length > 1 && (
          <MultiSelectFiltro
            label="Closer"
            opcoes={closers.map((c) => ({ valor: c.id, label: c.nome }))}
            selecionados={filtroClosers}
            onChange={setFiltroClosers}
          />
        )}
        <MultiSelectFiltro
          label="Forecast"
          opcoes={TEMPERATURAS.map((t) => ({ valor: t.valor, label: t.label }))}
          selecionados={filtroTemperaturas}
          onChange={setFiltroTemperaturas}
        />
        <MultiSelectFiltro
          label="Classificação"
          opcoes={(Object.keys(BALDE_LABELS) as Balde[]).map((b) => ({ valor: b, label: BALDE_LABELS[b] }))}
          selecionados={filtroClassificacoes}
          onChange={setFiltroClassificacoes}
        />
        {(filtroExercitos.size > 0 ||
          filtroClosers.size > 0 ||
          filtroTemperaturas.size > 0 ||
          filtroClassificacoes.size > 0 ||
          busca) && (
          <button
            type="button"
            onClick={() => {
              setFiltroExercitos(new Set());
              setFiltroClosers(new Set());
              setFiltroTemperaturas(new Set());
              setFiltroClassificacoes(new Set());
              setBusca("");
            }}
            className="text-xs text-stone-500 underline hover:text-stone-300"
          >
            limpar filtros
          </button>
        )}
      </div>

      {aviso && (
        <div className="flex items-center justify-between rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-bright">
          <span>{aviso}</span>
          <button type="button" onClick={() => setAviso(null)} className="text-stone-400 hover:text-stone-200">
            ✕
          </button>
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUNAS.map((c) => {
          const itens = porColuna.get(c.valor) ?? [];
          const totalValor = itens.reduce((soma, l) => soma + (l.valor_credito ?? 0), 0);
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
              style={{ borderTop: `3px solid ${c.hex}` }}
              className={`flex w-80 shrink-0 flex-col rounded-xl border bg-imperium-surface/50 transition ${
                emDrop ? "border-gold/60 bg-gold/5" : "border-imperium-line"
              }`}
            >
              <div className="flex items-center justify-between gap-2 px-4 pt-3">
                <h2 className="truncate text-sm font-semibold text-stone-100">{c.label}</h2>
                <span className="shrink-0 rounded-full bg-imperium-bg/70 px-2 py-0.5 text-xs text-stone-400">{itens.length}</span>
              </div>
              <p className="px-4 pb-2 text-xs text-stone-500">{totalValor > 0 ? formatarMoeda(totalValor) : "R$ 0"}</p>

              <div className="max-h-[75vh] flex-1 space-y-2.5 overflow-y-auto px-3 pb-3">
                {itens.length === 0 && <p className="py-4 text-center text-xs text-stone-600">Vazio.</p>}
                {itens.map((l) => {
                  const dias = diasEntre(l.data, hoje);
                  const aberto = !["assinado", "pago", "perdido"].includes(l.status_followup);
                  const quando = dias <= 0 ? "hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`;
                  const chips = [l.origem, l.canal, l.estado_civil, l.decisor].filter((x): x is string => !!x).slice(0, 4);
                  const pend = cobrancaPorLead.get(l.id);
                  return (
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
                      style={{ borderLeft: `4px solid ${c.hex}` }}
                      className={`cursor-grab rounded-lg border border-imperium-line bg-imperium-bg/80 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing ${
                        arrastando === l.id ? "opacity-40" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                          style={{ background: `${c.hex}33`, color: c.hex }}
                        >
                          {iniciais(l.lead_nome)}
                          {pend && (
                            <span
                              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-imperium-bg bg-wine"
                              title={pend.tipo === "pendencia_vencida" ? "Pendência vencida" : "Precisa de atualização de status"}
                            />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-medium text-stone-100">{l.lead_nome}</p>
                            {l.valor_credito != null && <span className="shrink-0 text-xs font-medium text-gold-bright">{formatarMoeda(l.valor_credito)}</span>}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {/* No funil de Reanálise a tag vira a data que o
                                Jurídico deu — é a informação que importa lá. */}
                            {visao === "reanalise" && l.reanalise_data ? (
                              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white ${corReanalise(l.reanalise_data)}`}>
                                {dbr(l.reanalise_data)}
                              </span>
                            ) : l.status_followup === "assinado" || l.status_followup === "pago" ? (
                              l.classificacao && (
                                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white ${BALDE_CORES[l.classificacao]}`}>
                                  {BALDE_LABELS[l.classificacao]}
                                </span>
                              )
                            ) : (
                              l.temperatura && (
                                <span
                                  className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white ${
                                    TEMPERATURAS.find((t) => t.valor === l.temperatura)?.cor ?? ""
                                  }`}
                                >
                                  {TEMPERATURAS.find((t) => t.valor === l.temperatura)?.label}
                                </span>
                              )
                            )}
                            {l.rot_etapa === "recuperado" && (
                              <span className="rounded-full bg-success/80 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white">Recuperado</span>
                            )}
                            {l.repasse_etapa === "entrevista_recuperada" && (
                              <span className="rounded-full bg-success/80 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white">
                                Recuperada por {l.repasse_sdr_id ? (nomePorId.get(l.repasse_sdr_id) ?? "SDR").split(" ")[0] : "SDR"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2.5 space-y-1 text-xs text-stone-400">
                        {l.lead_telefone && <p>📞 {l.lead_telefone}</p>}
                        {l.sdr_profile_id && (
                          <p>
                            <span className="text-stone-600">SDR</span> {nomePorId.get(l.sdr_profile_id) ?? "—"}
                          </p>
                        )}
                        {l.closer_profile_id && (
                          <p>
                            <span className="text-stone-600">Closer</span> {nomePorId.get(l.closer_profile_id) ?? "—"}
                          </p>
                        )}
                        <p className={aberto && dias >= 14 ? "text-wine-bright" : ""}>🕒 {quando}</p>
                      </div>

                      {l.status_followup === "subido" && l.subido_em && (
                        <p className="mt-1.5 text-xs text-sky-300">
                          Subido há {diasEntre(l.subido_em, hoje)}d
                          {l.compliance_comportamento && l.compliance_comportamento !== "aguardando" && ` · ${resultadosCompliance.find((r) => r.id === l.compliance_resultado_id)?.nome ?? l.compliance_comportamento}`}
                        </p>
                      )}
                      {l.status_followup === "entrevista_recusada" && (
                        <div className="mt-1.5 space-y-0.5 text-xs">
                          {l.recusa_motivo && <p className="line-clamp-2 text-wine-bright">Recusa: {l.recusa_motivo}</p>}
                          <p className="text-stone-500">
                            {l.repasse_sdr_id
                              ? `Em repasse com ${nomePorId.get(l.repasse_sdr_id) ?? "SDR"} · ${ETAPAS_REPASSE.find((e) => e.valor === l.repasse_etapa)?.label ?? ""}`
                              : l.recusada_em
                                ? `Vai pra um SDR em ${dbr(dataDoRepasse(l.recusada_em))}`
                                : ""}
                          </p>
                        </div>
                      )}

                      {chips.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1 border-t border-imperium-line pt-2">
                          {chips.map((chip) => (
                            <span key={chip} className="rounded bg-imperium-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-stone-400">
                              {chip}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      </>
      )}
      {visao === "principal" && adminPerdas}

      {leadAberto && (
        <LeadModal
          lead={leadsState.find((l) => l.id === leadAberto)!}
          statusPretendido={statusPretendido}
          nomePorId={nomePorId}
          motivosPerda={motivosPerda}
          hoje={hoje}
          cobranca={cobrancaPorLead.get(leadAberto) ?? null}
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

// Dropdown de multi-seleção reaproveitado pelos 3 filtros (Exército,
// Closer, Forecast) — pedido do Diretor (2026-08-27) de trocar filtro
// único por vários selecionados ao mesmo tempo.
function MultiSelectFiltro({
  label,
  opcoes,
  selecionados,
  onChange,
}: {
  label: string;
  opcoes: { valor: string; label: string }[];
  selecionados: Set<string>;
  onChange: (novo: Set<string>) => void;
}) {
  return (
    <details className="group relative">
      <summary className="input-imp flex cursor-pointer list-none items-center gap-1.5 text-sm [&::-webkit-details-marker]:hidden">
        {label}
        {selecionados.size > 0 && <span className="rounded-full bg-gold/20 px-1.5 text-[10px] text-gold-bright">{selecionados.size}</span>}
        <span className="text-[9px] text-stone-500 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="absolute z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-imperium-line bg-imperium-surface p-1.5 shadow-lg">
        {opcoes.map((o) => (
          <label key={o.valor} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-stone-300 hover:bg-imperium-bg/60">
            <input
              type="checkbox"
              checked={selecionados.has(o.valor)}
              onChange={(e) => {
                const novo = new Set(selecionados);
                if (e.target.checked) novo.add(o.valor);
                else novo.delete(o.valor);
                onChange(novo);
              }}
            />
            {o.label}
          </label>
        ))}
      </div>
    </details>
  );
}

function LeadModal({
  lead,
  statusPretendido,
  nomePorId,
  motivosPerda,
  hoje,
  cobranca,
  onFechar,
  onAtualizarLocal,
}: {
  lead: Lead;
  statusPretendido: string | null;
  nomePorId: Map<string, string>;
  motivosPerda: MotivoPerda[];
  hoje: string;
  cobranca: Cobranca | null;
  onFechar: () => void;
  onAtualizarLocal: (l: Lead) => void;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(statusPretendido ?? lead.status_followup);
  const [observacao, setObservacao] = useState(lead.observacao ?? "");
  const [motivoId, setMotivoId] = useState(lead.motivo_perda_id ?? "");
  const [motivoObs, setMotivoObs] = useState(lead.motivo_perda_obs ?? "");
  // Etapa de onde o lead saiu quando foi perdido — por padrão, a etapa em
  // que ele estava ANTES de abrir esse modal (lead.status_followup ainda
  // não mudou pra "perdido" nesse ponto, é literalmente de onde ele caiu),
  // editável se a pessoa quiser corrigir.
  const [etapaPerdida, setEtapaPerdida] = useState(
    lead.motivo_perda_etapa ?? (ETAPAS_DE_PERDA.some((e) => e.valor === lead.status_followup) ? lead.status_followup : "")
  );
  const motivosDaEtapa = motivosPerda.filter((m) => !m.etapa || m.etapa === etapaPerdida);
  const [temperatura, setTemperatura] = useState(lead.temperatura ?? "");
  const [valorCredito, setValorCredito] = useState(lead.valor_credito != null ? String(lead.valor_credito) : "");
  const [isPending, startTransition] = useTransition();
  const [salvo, setSalvo] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [lembreteCriado, setLembreteCriado] = useState(false);
  // Segundo funil de Reanálise (migration 0062) — enviar pede a data que o
  // Jurídico deu; resolver pergunta se liberou (volta pro funil) ou segue
  // com um novo prazo (mesmo padrão dos outros toggles inline do modal).
  const [enviandoReanalise, setEnviandoReanalise] = useState(false);
  const [reanaliseDataInput, setReanaliseDataInput] = useState("");
  const [decisaoReanalise, setDecisaoReanalise] = useState<"resolvida" | "nova_data" | null>(null);
  const [novaDataReanalise, setNovaDataReanalise] = useState("");

  // Subido (migration 0089): ao entrar nessa etapa pela primeira vez pede a
  // data em que a documentação subiu pro compliance.
  const [subidoData, setSubidoData] = useState(lead.subido_em ?? hoje);
  const [subidoObs, setSubidoObs] = useState(lead.subido_obs ?? "");
  const precisaRegistrarSubido = status === "subido" && !lead.subido_em;
  // Entrevista Recusada (migration 0090): poka-yoke — confirmar que o lead
  // realmente está negando + motivo. Em D+15 o lead vai pra um SDR de outro
  // Exército tentar recuperar.
  const registrandoRecusa = status === "entrevista_recusada" && lead.status_followup !== "entrevista_recusada";
  const [recusaConfirmada, setRecusaConfirmada] = useState(false);
  const [recusaMotivo, setRecusaMotivo] = useState(lead.recusa_motivo ?? "");
  const [historico, setHistorico] = useState<{ id: string; tipo: string; nota: string | null; criado_em: string; autor_id: string | null }[]>([]);
  useEffect(() => {
    let ativo = true;
    createClient()
      .from("lead_atualizacoes")
      .select("id, tipo, nota, criado_em, autor_id")
      .eq("lead_id", lead.id)
      .order("criado_em", { ascending: false })
      .limit(15)
      .then(({ data }) => {
        if (ativo) setHistorico(data ?? []);
      });
    return () => {
      ativo = false;
    };
  }, [lead.id]);

  const precisaQualificar = ETAPAS_QUE_EXIGEM_QUALIFICACAO.has(status);
  const qualificacaoIncompleta =
    (precisaQualificar && !(temperatura && Number(valorCredito) > 0)) ||
    (precisaRegistrarSubido && !subidoData) ||
    (registrandoRecusa && !(recusaConfirmada && recusaMotivo.trim().length >= 3));

  function salvarStatus() {
    if (status === "perdido") {
      if (!etapaPerdida || !motivoId) return;
      const fd = new FormData();
      fd.set("lead_id", lead.id);
      fd.set("motivo_perda_id", motivoId);
      fd.set("motivo_perda_obs", motivoObs);
      fd.set("motivo_perda_etapa", etapaPerdida);
      startTransition(async () => {
        await salvarPerdaLead(fd);
        onAtualizarLocal({
          ...lead,
          status_followup: "perdido",
          motivo_perda_id: motivoId,
          motivo_perda_obs: motivoObs || null,
          motivo_perda_etapa: etapaPerdida,
        });
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
    if (precisaRegistrarSubido) {
      fd.set("subido_data", subidoData);
      fd.set("subido_obs", subidoObs);
    }
    if (registrandoRecusa) {
      fd.set("recusa_confirmada", String(recusaConfirmada));
      fd.set("recusa_motivo", recusaMotivo);
    }
    setErroSalvar(null);
    startTransition(async () => {
      try {
        await salvarStatusLead(fd);
      } catch (e) {
        setErroSalvar(e instanceof Error ? e.message : "Erro ao salvar.");
        return;
      }
      onAtualizarLocal({
        ...lead,
        recusada_em: registrandoRecusa ? hoje : lead.recusada_em,
        recusa_motivo: registrandoRecusa ? recusaMotivo : lead.recusa_motivo,
        subido_em: precisaRegistrarSubido ? subidoData : lead.subido_em,
        subido_obs: precisaRegistrarSubido ? subidoObs || null : lead.subido_obs,
        compliance_comportamento: precisaRegistrarSubido ? "aguardando" : lead.compliance_comportamento,
        ultima_atualizacao_em: new Date().toISOString(),
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

  function enviarReanalise() {
    if (!reanaliseDataInput) return;
    const fd = new FormData();
    fd.set("lead_id", lead.id);
    fd.set("lead_nome", lead.lead_nome);
    fd.set("reanalise_data", reanaliseDataInput);
    startTransition(async () => {
      await enviarParaReanalise(fd);
      onAtualizarLocal({ ...lead, em_reanalise: true, reanalise_data: reanaliseDataInput });
      onFechar();
      router.refresh();
    });
  }

  function resolverComoResolvida() {
    const fd = new FormData();
    fd.set("lead_id", lead.id);
    fd.set("resolvida", "true");
    startTransition(async () => {
      await resolverReanalise(fd);
      onAtualizarLocal({ ...lead, em_reanalise: false, reanalise_data: null });
      onFechar();
      router.refresh();
    });
  }

  function seguirEmReanalise() {
    if (!novaDataReanalise) return;
    const fd = new FormData();
    fd.set("lead_id", lead.id);
    fd.set("lead_nome", lead.lead_nome);
    fd.set("resolvida", "false");
    fd.set("nova_data", novaDataReanalise);
    startTransition(async () => {
      await resolverReanalise(fd);
      onAtualizarLocal({ ...lead, reanalise_data: novaDataReanalise });
      onFechar();
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

        {cobranca && !lead.em_reanalise && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-wine/50 bg-wine/10 px-3 py-2">
            <p className="text-xs text-wine-bright">
              {cobranca.tipo === "pendencia_vencida"
                ? `Pendência do compliance vencida há ${cobranca.dias}d — resolva ou atualize o resultado.`
                : cobranca.tipo === "recuperacao_nova"
                  ? "Lead novo na sua carteira — registre o primeiro contato na aba Recuperação."
                  : "Esse lead precisa de atualização de status."}
            </p>
            {cobranca.tipo === "atualizar_status" && (
              <button
                type="button"
                disabled={isPending}
                className="rounded border border-wine/50 px-2.5 py-1 text-[11px] text-stone-200 hover:border-wine"
                onClick={() => {
                  const fd = new FormData();
                  fd.set("lead_id", lead.id);
                  startTransition(async () => {
                    await registrarAtualizacaoLead(fd);
                    onAtualizarLocal({ ...lead, ultima_atualizacao_em: new Date().toISOString() });
                    router.refresh();
                  });
                }}
              >
                Conferi, sem novidade
              </button>
            )}
          </div>
        )}

        {lead.em_reanalise ? (
          // Em reanálise: essa é a ÚNICA ação disponível até resolver — não
          // faz sentido editar etapa/qualificação com o lead parado
          // esperando o Jurídico (pedido do Diretor, 2026-08-28).
          <div className="space-y-2 border-t border-imperium-line pt-3">
            <p className="text-sm text-stone-300">
              ⚖️ Em reanálise, prazo do Jurídico: <span className="text-gold-bright">{lead.reanalise_data ? dbr(lead.reanalise_data) : "—"}</span>
            </p>
            {decisaoReanalise === "nova_data" ? (
              <div className="space-y-2">
                <label className="mb-1 block text-[10px] uppercase tracking-wide text-stone-500">Nova data que o Jurídico deu</label>
                <input
                  type="date"
                  value={novaDataReanalise}
                  onChange={(e) => setNovaDataReanalise(e.target.value)}
                  className="input-imp w-full text-sm"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={seguirEmReanalise}
                    disabled={isPending || !novaDataReanalise}
                    className="btn-outline px-3 py-1.5 text-xs"
                  >
                    {isPending ? "..." : "Confirmar nova data"}
                  </button>
                  <button type="button" onClick={() => setDecisaoReanalise(null)} className="text-[11px] text-stone-500 hover:text-stone-300">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={resolverComoResolvida} disabled={isPending} className="btn-outline px-3 py-1.5 text-xs">
                  {isPending ? "..." : "✅ Resolvida — voltar pro funil"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDecisaoReanalise("nova_data");
                    setNovaDataReanalise(lead.reanalise_data ?? "");
                  }}
                  disabled={isPending}
                  className="rounded border border-imperium-line px-3 py-1.5 text-xs text-stone-300 hover:border-gold/40"
                >
                  🔁 Segue em reanálise, novo prazo
                </button>
              </div>
            )}
          </div>
        ) : (
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
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wide text-stone-500">De qual etapa foi perdido?</label>
                <select
                  value={etapaPerdida}
                  onChange={(e) => {
                    const novaEtapa = e.target.value;
                    setEtapaPerdida(novaEtapa);
                    // Motivo escolhido pode não pertencer mais à nova etapa
                    // (ou era universal e continua valendo) — só limpa se de
                    // fato não bater mais.
                    const aindaValido = motivosPerda.some((m) => m.id === motivoId && (!m.etapa || m.etapa === novaEtapa));
                    if (!aindaValido) setMotivoId("");
                  }}
                  className="input-imp w-full text-sm"
                >
                  <option value="" disabled>
                    Escolha a etapa...
                  </option>
                  {ETAPAS_DE_PERDA.map((e) => (
                    <option key={e.valor} value={e.valor}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </div>

              {etapaPerdida && (
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wide text-stone-500">Motivo da perda</label>
                  {motivosDaEtapa.length === 0 ? (
                    <p className="text-[11px] text-warning-bright">
                      Nenhum motivo cadastrado pra essa etapa ainda — peça pro Diretor cadastrar em &quot;Motivos de Perda&quot;.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {motivosDaEtapa.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setMotivoId(m.id)}
                          className={`rounded-full px-2.5 py-1 text-xs transition ${
                            motivoId === m.id ? "bg-wine text-white" : "border border-imperium-line text-stone-400 hover:border-wine/50"
                          }`}
                        >
                          {motivoId === m.id ? "✓ " : ""}
                          {m.nome}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <textarea
                value={motivoObs}
                onChange={(e) => setMotivoObs(e.target.value)}
                placeholder="Observação sobre a perda (opcional)"
                rows={2}
                className="input-imp w-full text-sm"
              />
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
              {registrandoRecusa && (
                <div className="space-y-2 rounded-md border border-wine/50 bg-wine/10 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-wine-bright">Recusar entrevista</p>
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-stone-200">
                    <input type="checkbox" checked={recusaConfirmada} onChange={(e) => setRecusaConfirmada(e.target.checked)} className="mt-1" />
                    <span>Confirmo: o lead realmente está negando a entrevista?</span>
                  </label>
                  <textarea
                    value={recusaMotivo}
                    onChange={(e) => setRecusaMotivo(e.target.value)}
                    placeholder="Motivo da recusa (obrigatório)"
                    rows={2}
                    className="input-imp w-full text-sm"
                  />
                  <p className="text-[11px] text-stone-500">
                    Em D+15 o lead é enviado pra um SDR de outro Exército tentar gerar uma nova entrevista.
                  </p>
                </div>
              )}
              {precisaRegistrarSubido && (
                <div className="space-y-2 rounded-md border border-gold/30 bg-gold/5 p-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-gold-bright">Registrar subido pro compliance</p>
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wide text-stone-500">Data em que foi subido</label>
                    <input
                      type="date"
                      value={subidoData}
                      max={hoje}
                      onChange={(e) => setSubidoData(e.target.value)}
                      className="input-imp w-full text-sm"
                    />
                  </div>
                  <textarea
                    value={subidoObs}
                    onChange={(e) => setSubidoObs(e.target.value)}
                    placeholder="O que foi enviado / já assinou junto? (opcional)"
                    rows={2}
                    className="input-imp w-full text-sm"
                  />
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

          {historico.length > 0 && (
            <details className="rounded-md border border-imperium-line p-2.5 text-xs">
              <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-stone-500">
                Histórico ({historico.length})
              </summary>
              <ul className="mt-2 space-y-1.5">
                {historico.map((h) => (
                  <li key={h.id} className="text-stone-400">
                    <span className="text-stone-600">{new Date(h.criado_em).toLocaleDateString("pt-BR")}</span>{" "}
                    <span className="uppercase text-stone-500">{h.tipo}</span>
                    {h.autor_id && ` · ${nomePorId.get(h.autor_id) ?? ""}`}
                    {h.nota && <span className="block text-stone-300">{h.nota}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {ETAPAS_QUE_PODEM_IR_PARA_REANALISE.has(lead.status_followup) &&
            (enviandoReanalise ? (
              <div className="space-y-2 rounded-md border border-gold/30 bg-gold/5 p-2.5">
                <label className="mb-1 block text-[10px] uppercase tracking-wide text-gold-bright">Data que o Jurídico deu pra reanálise</label>
                <input
                  type="date"
                  value={reanaliseDataInput}
                  onChange={(e) => setReanaliseDataInput(e.target.value)}
                  className="input-imp w-full text-sm"
                />
                <div className="flex items-center gap-2">
                  <button type="button" onClick={enviarReanalise} disabled={isPending || !reanaliseDataInput} className="btn-outline px-3 py-1.5 text-xs">
                    {isPending ? "..." : "Confirmar envio"}
                  </button>
                  <button type="button" onClick={() => setEnviandoReanalise(false)} className="text-[11px] text-stone-500 hover:text-stone-300">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEnviandoReanalise(true)}
                className="w-full rounded border border-imperium-line px-3 py-1.5 text-xs text-stone-300 hover:border-gold/40"
              >
                ⚖️ Enviar para Reanálise
              </button>
            ))}

          {erroSalvar && <p className="text-xs text-wine-bright">{erroSalvar}</p>}
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={criarLembrete} disabled={isPending} className="text-[11px] text-stone-500 hover:text-gold-bright">
              {lembreteCriado ? "✓ Lembrete criado" : "🔔 Criar lembrete"}
            </button>
            <button
              type="button"
              onClick={salvarStatus}
              disabled={isPending || (status === "perdido" && (!etapaPerdida || !motivoId)) || qualificacaoIncompleta}
              className="btn-outline px-3 py-1.5 text-xs"
            >
              {isPending ? "..." : salvo ? <IconCheck className="mx-auto h-3 w-3" /> : "Salvar"}
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
