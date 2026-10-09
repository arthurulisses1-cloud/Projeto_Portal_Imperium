"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { atualizarComplianceLead, registrarAtualizacaoLead } from "@/app/(app)/leads/actions";
import { cobrancaDoLead, diasEntre, dataBR, DIAS_PRAZO_PENDENCIA, type Cobranca } from "@/lib/leads-cobranca";
import type { Lead, ComplianceResultado } from "./LeadsView";

const COR_COMPORTAMENTO: Record<string, string> = {
  aguardando: "bg-stone-500",
  aprovado: "bg-success",
  pendencia: "bg-warning",
  reanalise: "bg-gold",
  queda: "bg-wine",
};

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function dbr(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("pt-BR");
}
function somar(data: string, dias: number) {
  const d = new Date(data + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function rotuloCobranca(c: Cobranca): string {
  if (c.tipo === "pendencia_vencida") return `Pendência vencida há ${c.dias}d`;
  if (c.tipo === "recuperacao_nova") return "Lead novo na carteira";
  return c.dias <= 1 ? "Atualizar status" : `Sem atualização há ${c.dias}d`;
}

// Visão "Subidos" (pedido do Diretor, 2026-10-09): o resultado do compliance
// sai de um sistema próprio da empresa, então o consultor lança aqui. Mesma
// ideia de tabela do Forecast.
export default function SubidosView({
  leads,
  resultados,
  nomePorId,
  hoje,
  viewerId,
  onAbrirLead,
}: {
  leads: Lead[];
  resultados: ComplianceResultado[];
  nomePorId: Map<string, string>;
  hoje: string;
  viewerId: string;
  onAbrirLead: (id: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [resultadoId, setResultadoId] = useState("");
  const [obs, setObs] = useState("");
  const [prazo, setPrazo] = useState("");
  const [reanaliseData, setReanaliseData] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "atualizar" | "meus">("todos");

  const linhas = useMemo(() => {
    const com = leads.map((l) => ({ lead: l, cobranca: cobrancaDoLead(l, hoje) }));
    const filtradas = com.filter(({ lead, cobranca }) => {
      if (filtro === "atualizar") return !!cobranca;
      if (filtro === "meus") return (lead.rot_responsavel_id ?? lead.closer_profile_id) === viewerId;
      return true;
    });
    // Quem precisa de atenção primeiro; depois os subidos mais antigos.
    return filtradas.sort((a, b) => {
      const ca = a.cobranca ? 0 : 1;
      const cb = b.cobranca ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return (a.lead.subido_em ?? "").localeCompare(b.lead.subido_em ?? "");
    });
  }, [leads, hoje, filtro, viewerId]);

  const resumo = useMemo(() => {
    const por = (c: string) => leads.filter((l) => l.compliance_comportamento === c);
    return {
      total: leads.length,
      valor: leads.reduce((s, l) => s + (l.valor_credito ?? 0), 0),
      aguardando: por("aguardando").length,
      pendencia: por("pendencia").length,
      aprovado: por("aprovado").length,
      atualizar: leads.filter((l) => cobrancaDoLead(l, hoje)).length,
    };
  }, [leads, hoje]);

  const resultadoEscolhido = resultados.find((r) => r.id === resultadoId);

  function abrir(l: Lead) {
    setAbertoId(l.id);
    setResultadoId(l.compliance_resultado_id ?? "");
    setObs("");
    setPrazo(l.pendencia_prazo ?? somar(hoje, DIAS_PRAZO_PENDENCIA));
    setReanaliseData("");
    setErro(null);
  }

  function salvar(l: Lead) {
    if (!resultadoId) return;
    setErro(null);
    const fd = new FormData();
    fd.set("lead_id", l.id);
    fd.set("lead_nome", l.lead_nome);
    fd.set("resultado_id", resultadoId);
    fd.set("obs", obs);
    if (resultadoEscolhido?.comportamento === "pendencia") fd.set("pendencia_prazo", prazo);
    if (resultadoEscolhido?.comportamento === "reanalise") fd.set("reanalise_data", reanaliseData);
    startTransition(async () => {
      try {
        await atualizarComplianceLead(fd);
        setAbertoId(null);
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao salvar.");
      }
    });
  }

  function semNovidade(l: Lead) {
    const fd = new FormData();
    fd.set("lead_id", l.id);
    startTransition(async () => {
      await registrarAtualizacaoLead(fd);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Kpi label="Subidos em aberto" valor={String(resumo.total)} sub={moeda(resumo.valor)} />
        <Kpi label="Aguardando análise" valor={String(resumo.aguardando)} />
        <Kpi label="Com pendência" valor={String(resumo.pendencia)} />
        <Kpi label="Aprovados" valor={String(resumo.aprovado)} />
        <Kpi label="Precisam de atualização" valor={String(resumo.atualizar)} alerta={resumo.atualizar > 0} />
      </div>

      <div className="flex gap-2 text-xs">
        {(
          [
            ["todos", "Todos"],
            ["atualizar", "Precisam de atualização"],
            ["meus", "Sob minha responsabilidade"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setFiltro(v)}
            className={`rounded-full px-3 py-1 transition ${
              filtro === v ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-400 hover:border-gold/40"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-imperium-line">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-imperium-line text-left text-[10px] uppercase tracking-wide text-stone-500">
              <th className="px-3 py-2">Lead</th>
              <th className="px-3 py-2">Closer</th>
              <th className="px-3 py-2 text-right">Crédito</th>
              <th className="px-3 py-2">Subido em</th>
              <th className="px-3 py-2">Resultado da análise</th>
              <th className="px-3 py-2">Última atualização</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-xs text-stone-600">
                  Nenhum subido nesse recorte.
                </td>
              </tr>
            )}
            {linhas.map(({ lead: l, cobranca }) => {
              const aberto = abertoId === l.id;
              const resp = l.rot_responsavel_id ?? l.closer_profile_id;
              const resultado = resultados.find((r) => r.id === l.compliance_resultado_id);
              const diasSubido = l.subido_em ? diasEntre(l.subido_em, hoje) : null;
              const ultima = l.ultima_atualizacao_em ? dataBR(l.ultima_atualizacao_em) : null;
              return (
                <Fragment key={l.id}>
                  <tr className="border-b border-imperium-line/50 align-top">
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => onAbrirLead(l.id)} className="text-left text-stone-100 hover:text-gold-bright">
                        {l.lead_nome}
                      </button>
                      {cobranca && (
                        <span
                          className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white ${
                            cobranca.tipo === "pendencia_vencida" ? "bg-wine" : "bg-gold text-imperium-bg"
                          }`}
                        >
                          {rotuloCobranca(cobranca)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-stone-400">{resp ? nomePorId.get(resp) ?? "—" : "—"}</td>
                    <td className="px-3 py-2 text-right text-stone-300">{l.valor_credito != null ? moeda(l.valor_credito) : "—"}</td>
                    <td className="px-3 py-2 text-stone-400">
                      {l.subido_em ? dbr(l.subido_em) : "—"}
                      {diasSubido != null && <span className="block text-[10px] text-stone-600">há {diasSubido}d</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white ${
                          COR_COMPORTAMENTO[l.compliance_comportamento ?? "aguardando"] ?? "bg-stone-500"
                        }`}
                      >
                        {resultado?.nome ?? "Aguardando análise"}
                      </span>
                      {l.compliance_comportamento === "pendencia" && l.pendencia_prazo && (
                        <span className={`mt-1 block text-[10px] ${l.pendencia_prazo < hoje ? "text-wine-bright" : "text-stone-500"}`}>
                          prazo {dbr(l.pendencia_prazo)}
                        </span>
                      )}
                      {l.compliance_obs && <span className="mt-1 block max-w-xs truncate text-[10px] text-stone-600">{l.compliance_obs}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-stone-500">{ultima ? dbr(ultima) : "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => (aberto ? setAbertoId(null) : abrir(l))} className="btn-outline px-2.5 py-1 text-xs">
                          {aberto ? "Fechar" : "Atualizar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {aberto && (
                    <tr className="border-b border-imperium-line/50 bg-imperium-bg/40">
                      <td colSpan={7} className="space-y-3 px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {resultados.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => setResultadoId(r.id)}
                              className={`rounded-full px-3 py-1 text-xs transition ${
                                resultadoId === r.id
                                  ? `${COR_COMPORTAMENTO[r.comportamento] ?? "bg-stone-500"} text-white`
                                  : "border border-imperium-line text-stone-400 hover:border-gold/40"
                              }`}
                            >
                              {resultadoId === r.id ? "✓ " : ""}
                              {r.nome}
                            </button>
                          ))}
                        </div>
                        {resultadoEscolhido?.comportamento === "pendencia" && (
                          <div>
                            <label className="mb-1 block text-[10px] uppercase tracking-wide text-stone-500">Prazo pra resolver a pendência</label>
                            <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="input-imp text-sm" />
                          </div>
                        )}
                        {resultadoEscolhido?.comportamento === "reanalise" && !l.em_reanalise && (
                          <div>
                            <label className="mb-1 block text-[10px] uppercase tracking-wide text-stone-500">Data que o Jurídico deu pra reanálise</label>
                            <input type="date" value={reanaliseData} onChange={(e) => setReanaliseData(e.target.value)} className="input-imp text-sm" />
                          </div>
                        )}
                        {resultadoEscolhido?.comportamento === "queda" && (
                          <p className="text-[11px] text-warning-bright">Queda move o lead pra Perdido e tira ele das cobranças.</p>
                        )}
                        <textarea
                          value={obs}
                          onChange={(e) => setObs(e.target.value)}
                          rows={2}
                          placeholder="O que o compliance apontou / próximo passo"
                          className="input-imp w-full max-w-xl text-sm"
                        />
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            disabled={isPending || !resultadoId || (resultadoEscolhido?.comportamento === "reanalise" && !l.em_reanalise && !reanaliseData)}
                            onClick={() => salvar(l)}
                            className="btn-outline px-3 py-1.5 text-xs"
                          >
                            {isPending ? "..." : "Salvar resultado"}
                          </button>
                          <button type="button" disabled={isPending} onClick={() => semNovidade(l)} className="text-xs text-stone-500 hover:text-gold-bright">
                            Conferi, sem novidade
                          </button>
                          {erro && <span className="text-xs text-wine-bright">{erro}</span>}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, valor, sub, alerta }: { label: string; valor: string; sub?: string; alerta?: boolean }) {
  return (
    <div className={`min-w-36 rounded-lg border px-4 py-2.5 ${alerta ? "border-wine/60 bg-wine/10" : "border-imperium-line bg-imperium-surface/60"}`}>
      <p className="text-[10px] uppercase tracking-wide text-stone-500">{label}</p>
      <p className={`font-display text-xl ${alerta ? "text-wine-bright" : "text-gold-bright"}`}>{valor}</p>
      {sub && <p className="text-[11px] text-stone-500">{sub}</p>}
    </div>
  );
}
