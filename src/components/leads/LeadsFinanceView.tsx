"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  aprovarVendaFinance,
  moverEtapaFinance,
  pedirVendaFinance,
  perderLeadFinance,
  recusarVendaFinance,
  subirLeadFinance,
  type EstadoForm,
} from "@/app/(app)/leads/finance-actions";
import { COLUNAS_FINANCE } from "@/lib/leads-finance";

export type LeadFinance = {
  id: string;
  data: string;
  lead_nome: string;
  lead_telefone: string | null;
  sdr_profile_id: string | null;
  closer_profile_id: string | null;
  entrevistado: string | null;
  origem: string | null;
  tipo_precatorio: string | null;
  fundo_destino: string | null;
  status_followup: string;
  sub_valor_precatorio: number | null;
  sub_valor_proposta: number | null;
  sub_comissao_prevista: number | null;
  sub_mesmo_fundo: boolean | null;
  sub_fundo_novo: string | null;
  sub_anexo_path: string | null;
  subido_obs: string | null;
  venda_valor_recebido: number | null;
  venda_valor_cliente: number | null;
  venda_data: string | null;
  venda_obs: string | null;
  venda_recusa_motivo: string | null;
};

export type MotivoFinance = { id: string; nome: string; etapa: string | null };

const campo =
  "w-full rounded border border-imperium-line bg-imperium-raised px-2 py-1.5 text-sm text-stone-100 focus:border-gold focus:outline-none";

const moeda = (v: number | null) => (v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }));
const num = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));
const dataBR = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);

function Enviar({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded border border-gold/50 bg-gold/10 px-4 py-2 text-sm text-gold-bright hover:bg-gold/20 disabled:opacity-50">
      {pending ? "Salvando…" : children}
    </button>
  );
}

function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6" onClick={onFechar}>
      <div className="w-full max-w-lg rounded-lg border border-imperium-line bg-imperium-surface p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <p className="text-base font-semibold text-gold-bright">{titulo}</p>
          <button type="button" onClick={onFechar} className="text-xs text-stone-400 hover:text-stone-100">
            Fechar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Roda a ação do formulário e fecha o modal quando dá certo; erro aparece no próprio formulário. */
function useAcao(acao: (p: EstadoForm, f: FormData) => Promise<EstadoForm>, onOk: () => void) {
  const [estado, executar] = useFormState(acao, {} as EstadoForm);
  useEffect(() => {
    if (estado.ok) onOk();
  }, [estado, onOk]);
  return [estado, executar] as const;
}

function SubirForm({ lead, onOk }: { lead: LeadFinance; onOk: () => void }) {
  const [estado, executar] = useAcao(subirLeadFinance, onOk);
  const [mudou, setMudou] = useState(lead.sub_mesmo_fundo === false);
  return (
    <form action={executar} className="grid gap-3">
      <input type="hidden" name="lead_id" value={lead.id} />
      <p className="text-xs text-stone-400">
        {lead.lead_nome} · fundo da entrevista: <span className="text-stone-200">{lead.fundo_destino ?? "não informado"}</span>
      </p>
      <label className="text-xs text-stone-400">
        Valor do precatório (R$)
        <input name="valor_precatorio" required inputMode="decimal" placeholder="Ex.: 150.000,00" defaultValue={num(lead.sub_valor_precatorio)} className={campo} />
      </label>
      <label className="text-xs text-stone-400">
        Valor da nossa proposta de desembolso (R$)
        <input name="valor_proposta" required inputMode="decimal" placeholder="Ex.: 90.000,00" defaultValue={num(lead.sub_valor_proposta)} className={campo} />
      </label>
      <label className="text-xs text-stone-400">
        Nossa comissão prevista (R$)
        <input name="comissao_prevista" required inputMode="decimal" placeholder="Ex.: 9.000,00" defaultValue={num(lead.sub_comissao_prevista)} className={campo} />
      </label>
      <fieldset className="text-xs text-stone-400">
        <legend className="mb-1">Seguimos no mesmo fundo da entrevista?</legend>
        <div className="flex gap-4 text-sm text-stone-200">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="mesmo_fundo" value="sim" required defaultChecked={lead.sub_mesmo_fundo === true} onChange={() => setMudou(false)} /> Sim
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="mesmo_fundo" value="nao" defaultChecked={lead.sub_mesmo_fundo === false} onChange={() => setMudou(true)} /> Não
          </label>
        </div>
      </fieldset>
      {mudou && (
        <label className="text-xs text-stone-400">
          Para qual fundo vai?
          <input name="fundo_novo" defaultValue={lead.sub_fundo_novo ?? ""} className={campo} />
        </label>
      )}
      <label className="text-xs text-stone-400">
        Anexo (proposta ou documentos, até 15 MB — opcional)
        <input name="anexo" type="file" className={campo} />
      </label>
      <label className="text-xs text-stone-400">
        Observação (opcional)
        <input name="observacao" defaultValue={lead.subido_obs ?? ""} className={campo} />
      </label>
      {estado.erro && <p className="rounded border border-wine/60 px-3 py-2 text-sm text-wine-bright">{estado.erro}</p>}
      <div>
        <Enviar>{lead.sub_valor_proposta === null ? "Marcar como subido" : "Salvar alterações"}</Enviar>
      </div>
    </form>
  );
}

function VendaForm({ lead, hoje, onOk }: { lead: LeadFinance; hoje: string; onOk: () => void }) {
  const [estado, executar] = useAcao(pedirVendaFinance, onOk);
  return (
    <form action={executar} className="grid gap-3">
      <input type="hidden" name="lead_id" value={lead.id} />
      <p className="text-xs text-stone-400">
        {lead.lead_nome} · precatório {moeda(lead.sub_valor_precatorio)} · proposta {moeda(lead.sub_valor_proposta)}
      </p>
      <label className="text-xs text-stone-400">
        Comissão recebida (R$)
        <input name="valor_recebido" required inputMode="decimal" defaultValue={num(lead.venda_valor_recebido ?? lead.sub_comissao_prevista)} className={campo} />
      </label>
      <label className="text-xs text-stone-400">
        Valor pago ao cliente (R$)
        <input name="valor_cliente" required inputMode="decimal" defaultValue={num(lead.venda_valor_cliente ?? lead.sub_valor_proposta)} className={campo} />
      </label>
      <label className="text-xs text-stone-400">
        Data do recebimento
        <input name="data" type="date" max={hoje} defaultValue={lead.venda_data ?? hoje} className={campo} />
      </label>
      <label className="text-xs text-stone-400">
        Observação (opcional)
        <input name="observacao" defaultValue={lead.venda_obs ?? ""} className={campo} />
      </label>
      <p className="text-[11px] text-stone-500">A venda só conta (Recebido, metas e comissão) depois que o Head ou o Diretor aprovarem.</p>
      {estado.erro && <p className="rounded border border-wine/60 px-3 py-2 text-sm text-wine-bright">{estado.erro}</p>}
      <div>
        <Enviar>Enviar para aprovação</Enviar>
      </div>
    </form>
  );
}

function PerdaForm({ lead, motivos, onOk }: { lead: LeadFinance; motivos: MotivoFinance[]; onOk: () => void }) {
  const [estado, executar] = useAcao(perderLeadFinance, onOk);
  const etapa = lead.status_followup === "validacao_entrevista" ? "validacao_entrevista" : "subido";
  const lista = motivos.filter((m) => !m.etapa || m.etapa === etapa);
  return (
    <form action={executar} className="grid gap-3">
      <input type="hidden" name="lead_id" value={lead.id} />
      <label className="text-xs text-stone-400">
        Motivo da perda
        <select name="motivo_perda_id" required defaultValue="" className={campo}>
          <option value="" disabled>
            Escolha…
          </option>
          {lista.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-stone-400">
        Observação (opcional)
        <input name="motivo_perda_obs" className={campo} />
      </label>
      {estado.erro && <p className="rounded border border-wine/60 px-3 py-2 text-sm text-wine-bright">{estado.erro}</p>}
      <div>
        <Enviar>Marcar como perdido</Enviar>
      </div>
    </form>
  );
}

type Dialogo = { tipo: "subir" | "venda" | "perda" | "recusa"; leadId: string } | null;

export default function LeadsFinanceView({
  leads,
  nomePorId,
  podeAprovar,
  motivos,
  anexoUrls,
  hoje,
}: {
  leads: LeadFinance[];
  nomePorId: Record<string, string>;
  podeAprovar: boolean;
  motivos: MotivoFinance[];
  anexoUrls: Record<string, string>;
  hoje: string;
}) {
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState("");
  const [, iniciar] = useTransition();
  const fechar = () => setDialogo(null);
  const lead = dialogo ? leads.find((l) => l.id === dialogo.leadId) ?? null : null;

  function rodar(p: Promise<EstadoForm>) {
    setMsg(null);
    iniciar(async () => {
      const r = await p;
      if (r.erro) setMsg(r.erro);
    });
  }

  function soltar(l: LeadFinance, coluna: string) {
    setArrastando(null);
    if (["venda_aprovada", "perdido"].includes(l.status_followup)) return setMsg("Este lead já está encerrado.");
    if (coluna === "subido") return setDialogo({ tipo: "subir", leadId: l.id });
    if (coluna === "venda") return setDialogo({ tipo: l.sub_valor_proposta === null ? "subir" : "venda", leadId: l.id });
    if (coluna === "pendencia") {
      if (l.sub_valor_proposta === null) return setDialogo({ tipo: "subir", leadId: l.id });
      return rodar(moverEtapaFinance(l.id, "resolvendo_pendencia"));
    }
    if (coluna === "entrevista" && l.status_followup !== "validacao_entrevista") {
      if (l.status_followup === "venda_pendente") return setMsg("Venda aguardando aprovação: peça ao Head para recusar antes de voltar etapa.");
      return rodar(moverEtapaFinance(l.id, "validacao_entrevista"));
    }
  }

  const abertos = leads.filter((l) => l.status_followup !== "perdido");
  const perdidos = leads.filter((l) => l.status_followup === "perdido").length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-stone-500">
        {abertos.length} lead(s) no funil · {perdidos} perdido(s). Arraste o card para a coluna seguinte (ou use os botões do card).
      </p>
      {msg && <p className="rounded border border-wine/60 px-3 py-2 text-sm text-wine-bright">{msg}</p>}
      <div className="grid gap-4 lg:grid-cols-4">
        {COLUNAS_FINANCE.map((col) => {
          const cards = abertos.filter((l) => (col.etapas as string[]).includes(l.status_followup));
          return (
            <section
              key={col.chave}
              className="min-h-[200px] rounded-lg border border-imperium-line bg-imperium-surface p-3"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const l = leads.find((x) => x.id === arrastando);
                if (l) soltar(l, col.chave);
              }}
            >
              <div className="mb-2 flex items-baseline justify-between">
                <p className="text-sm font-semibold text-stone-100">{col.label}</p>
                <span className="text-xs text-stone-500">{cards.length}</span>
              </div>
              <div className="space-y-2">
                {cards.length === 0 && <p className="text-xs text-stone-600">Nenhum lead.</p>}
                {cards.map((l) => {
                  const encerrado = l.status_followup === "venda_aprovada";
                  const pendente = l.status_followup === "venda_pendente";
                  return (
                    <article
                      key={l.id}
                      draggable={!encerrado}
                      onDragStart={() => setArrastando(l.id)}
                      onDragEnd={() => setArrastando(null)}
                      className={`rounded border border-imperium-line bg-imperium-raised p-3 text-sm ${encerrado ? "" : "cursor-grab"}`}
                    >
                      <p className="font-medium text-stone-100">{l.lead_nome}</p>
                      <p className="text-xs text-stone-500">
                        {dataBR(l.data)} · {l.tipo_precatorio ?? "tipo não informado"} · {l.fundo_destino ?? "sem fundo"}
                      </p>
                      <p className="text-xs text-stone-500">
                        SDR {l.sdr_profile_id ? nomePorId[l.sdr_profile_id] ?? "—" : "—"} · Closer {l.closer_profile_id ? nomePorId[l.closer_profile_id] ?? "—" : "—"}
                      </p>
                      {l.sub_valor_proposta !== null && (
                        <p className="mt-1 text-xs text-stone-300">
                          Precatório {moeda(l.sub_valor_precatorio)} · proposta {moeda(l.sub_valor_proposta)} · comissão prev. {moeda(l.sub_comissao_prevista)}
                        </p>
                      )}
                      {l.sub_mesmo_fundo === false && <p className="text-xs text-warning-bright">Mudou de fundo → {l.sub_fundo_novo}</p>}
                      {anexoUrls[l.id] && (
                        <a href={anexoUrls[l.id]} target="_blank" rel="noreferrer" className="text-xs text-gold hover:underline">
                          Ver anexo
                        </a>
                      )}
                      {l.venda_recusa_motivo && l.status_followup === "resolvendo_pendencia" && (
                        <p className="mt-1 text-xs text-wine-bright">Venda recusada: {l.venda_recusa_motivo}</p>
                      )}
                      {pendente && (
                        <p className="mt-1 text-xs text-warning-bright">
                          Aguardando aprovação · comissão {moeda(l.venda_valor_recebido)} · pago ao cliente {moeda(l.venda_valor_cliente)}
                        </p>
                      )}
                      {encerrado && <p className="mt-1 text-xs text-success-bright">Venda aprovada · {moeda(l.venda_valor_recebido)}</p>}

                      {!encerrado && (
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {l.status_followup === "validacao_entrevista" && (
                            <button type="button" className="text-gold hover:underline" onClick={() => setDialogo({ tipo: "subir", leadId: l.id })}>
                              Subir
                            </button>
                          )}
                          {["subido", "resolvendo_pendencia"].includes(l.status_followup) && (
                            <>
                              <button type="button" className="text-gold hover:underline" onClick={() => setDialogo({ tipo: "subir", leadId: l.id })}>
                                Editar subido
                              </button>
                              {l.status_followup === "subido" && (
                                <button type="button" className="text-gold hover:underline" onClick={() => rodar(moverEtapaFinance(l.id, "resolvendo_pendencia"))}>
                                  Resolvendo pendência
                                </button>
                              )}
                              <button type="button" className="text-gold hover:underline" onClick={() => setDialogo({ tipo: "venda", leadId: l.id })}>
                                Pedir venda
                              </button>
                            </>
                          )}
                          {pendente && podeAprovar && (
                            <>
                              <button type="button" className="text-success-bright hover:underline" onClick={() => rodar(aprovarVendaFinance(l.id))}>
                                Aprovar venda
                              </button>
                              <button
                                type="button"
                                className="text-wine-bright hover:underline"
                                onClick={() => {
                                  setMotivoRecusa("");
                                  setDialogo({ tipo: "recusa", leadId: l.id });
                                }}
                              >
                                Recusar
                              </button>
                            </>
                          )}
                          {pendente && !podeAprovar && (
                            <button type="button" className="text-gold hover:underline" onClick={() => setDialogo({ tipo: "venda", leadId: l.id })}>
                              Corrigir venda
                            </button>
                          )}
                          <button type="button" className="text-stone-500 hover:text-stone-200" onClick={() => setDialogo({ tipo: "perda", leadId: l.id })}>
                            Perdido
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {dialogo && lead && dialogo.tipo === "subir" && (
        <Modal titulo="Subido — dados da proposta" onFechar={fechar}>
          <SubirForm lead={lead} onOk={fechar} />
        </Modal>
      )}
      {dialogo && lead && dialogo.tipo === "venda" && (
        <Modal titulo="Lançar venda — aguardando aprovação" onFechar={fechar}>
          <VendaForm lead={lead} hoje={hoje} onOk={fechar} />
        </Modal>
      )}
      {dialogo && lead && dialogo.tipo === "perda" && (
        <Modal titulo="Lead perdido" onFechar={fechar}>
          <PerdaForm lead={lead} motivos={motivos} onOk={fechar} />
        </Modal>
      )}
      {dialogo && lead && dialogo.tipo === "recusa" && (
        <Modal titulo="Recusar venda" onFechar={fechar}>
          <div className="grid gap-3">
            <label className="text-xs text-stone-400">
              Motivo (o consultor vê no card)
              <input value={motivoRecusa} onChange={(e) => setMotivoRecusa(e.target.value)} className={campo} />
            </label>
            <div>
              <button
                type="button"
                className="rounded border border-wine/60 px-4 py-2 text-sm text-wine-bright hover:bg-wine/10"
                onClick={() => {
                  rodar(recusarVendaFinance(lead.id, motivoRecusa));
                  fechar();
                }}
              >
                Recusar venda
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
