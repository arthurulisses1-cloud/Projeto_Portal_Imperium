"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export type RepasseLeadBase = {
  id: string;
  lead_nome: string;
  lead_telefone: string | null;
  data: string;
  valor_credito: number | null;
};

export type EtapaRepasse = {
  valor: string;
  label: string;
  cor: string; // hex — cor do topo da coluna e do card
  dica?: string;
  // Etapa final: o lead não sai daqui (ex: "Não faz sentido recuperar").
  travada?: boolean;
  // Exige uma nota ao entrar nessa etapa (poka-yoke).
  notaObrigatoria?: string;
};

export type LinhaCard = { texto: string; destaque?: "alerta" | "ok" };

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function iniciais(nome: string) {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

// Funil de repasse (SDR: entrevistas recusadas / Closer: leads parados 30d) —
// mesmo componente nos dois, só muda a configuração de etapas e de ações.
export default function RepasseKanban<T extends RepasseLeadBase>({
  etapas,
  leads,
  getEtapa,
  podeMover,
  mover,
  linhas,
  tags,
  detalhe,
  vazio,
}: {
  etapas: EtapaRepasse[];
  leads: T[];
  getEtapa: (l: T) => string;
  podeMover: (l: T) => boolean;
  mover: (fd: FormData) => Promise<void>;
  linhas: (l: T) => LinhaCard[];
  tags?: (l: T) => string[];
  detalhe?: (l: T) => ReactNode;
  vazio?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [aberto, setAberto] = useState<string | null>(null);
  const [etapaAlvo, setEtapaAlvo] = useState<string>("");
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const porEtapa = useMemo(() => {
    const mapa = new Map<string, T[]>();
    for (const e of etapas) mapa.set(e.valor, []);
    for (const l of leads) mapa.get(getEtapa(l))?.push(l);
    return mapa;
  }, [leads, etapas, getEtapa]);

  const lead = aberto ? leads.find((l) => l.id === aberto) ?? null : null;
  const etapaAtual = lead ? etapas.find((e) => e.valor === getEtapa(lead)) : null;
  const etapaEscolhida = etapas.find((e) => e.valor === etapaAlvo);

  function abrir(l: T) {
    setAberto(l.id);
    setEtapaAlvo("");
    setNota("");
    setErro(null);
  }

  function confirmar() {
    if (!lead || !etapaAlvo) return;
    setErro(null);
    const fd = new FormData();
    fd.set("lead_id", lead.id);
    fd.set("etapa", etapaAlvo);
    fd.set("nota", nota);
    startTransition(async () => {
      try {
        await mover(fd);
        setAberto(null);
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao mover o lead.");
      }
    });
  }

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {etapas.map((e) => {
          const itens = porEtapa.get(e.valor) ?? [];
          const total = itens.reduce((s, l) => s + (l.valor_credito ?? 0), 0);
          return (
            <div key={e.valor} className="w-80 shrink-0 rounded-xl border border-imperium-line bg-imperium-surface/50" style={{ borderTop: `3px solid ${e.cor}` }}>
              <div className="flex items-center justify-between gap-2 px-4 pt-3">
                <h2 className="truncate text-sm font-semibold text-stone-100">{e.label}</h2>
                <span className="rounded-full bg-imperium-bg/70 px-2 py-0.5 text-xs text-stone-400">{itens.length}</span>
              </div>
              <p className="px-4 pb-2 text-xs text-stone-500">{total > 0 ? moeda(total) : "R$ 0"}</p>
              <div className="max-h-[70vh] space-y-2.5 overflow-y-auto px-3 pb-3">
                {itens.length === 0 && <p className="py-4 text-center text-xs text-stone-600">{e.dica ?? "Vazio."}</p>}
                {itens.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => abrir(l)}
                    className="block w-full rounded-lg border border-imperium-line bg-imperium-bg/70 p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    style={{ borderLeft: `4px solid ${e.cor}` }}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                        style={{ background: e.cor }}
                      >
                        {iniciais(l.lead_nome)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-stone-100">{l.lead_nome}</p>
                        {l.valor_credito != null && <p className="text-xs text-gold-bright">{moeda(l.valor_credito)}</p>}
                      </div>
                    </div>
                    <div className="mt-2 space-y-1">
                      {l.lead_telefone && <p className="text-xs text-stone-400">📞 {l.lead_telefone}</p>}
                      {linhas(l).map((ln, i) => (
                        <p
                          key={i}
                          className={`text-xs ${ln.destaque === "alerta" ? "text-wine-bright" : ln.destaque === "ok" ? "text-success-bright" : "text-stone-500"}`}
                        >
                          {ln.texto}
                        </p>
                      ))}
                    </div>
                    {tags && tags(l).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1 border-t border-imperium-line pt-2">
                        {tags(l).map((t) => (
                          <span key={t} className="rounded bg-imperium-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-stone-400">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {leads.length === 0 && vazio && <p className="text-center text-sm text-stone-600">{vazio}</p>}

      {lead && etapaAtual && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) setAberto(null);
          }}
        >
          <div className="card-imp my-8 w-full max-w-lg space-y-4 p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg text-gold-bright">{lead.lead_nome}</h3>
                <p className="text-xs text-stone-500">
                  Etapa atual: <span style={{ color: etapaAtual.cor }}>{etapaAtual.label}</span>
                </p>
              </div>
              <button type="button" onClick={() => setAberto(null)} className="text-stone-500 hover:text-stone-200">
                ✕
              </button>
            </div>

            {lead.lead_telefone && <p className="text-sm text-stone-300">📞 {lead.lead_telefone}</p>}
            {detalhe && <div className="space-y-1 text-sm text-stone-400">{detalhe(lead)}</div>}

            {etapaAtual.travada ? (
              <p className="rounded-md border border-imperium-line px-3 py-2 text-xs text-stone-500">
                Etapa final — esse lead fica travado aqui e não volta a ser repassado.
              </p>
            ) : !podeMover(lead) ? (
              <p className="rounded-md border border-imperium-line px-3 py-2 text-xs text-stone-500">
                Só quem está com o lead no momento pode movimentar.
              </p>
            ) : (
              <div className="space-y-3 border-t border-imperium-line pt-3">
                <p className="text-[10px] uppercase tracking-wide text-stone-500">Mover para</p>
                <div className="flex flex-wrap gap-1.5">
                  {etapas
                    .filter((e) => e.valor !== etapaAtual.valor)
                    .map((e) => (
                      <button
                        key={e.valor}
                        type="button"
                        onClick={() => setEtapaAlvo(e.valor)}
                        className={`rounded-full px-3 py-1 text-xs transition ${
                          etapaAlvo === e.valor ? "text-white" : "border border-imperium-line text-stone-400 hover:border-gold/40"
                        }`}
                        style={etapaAlvo === e.valor ? { background: e.cor } : undefined}
                      >
                        {etapaAlvo === e.valor ? "✓ " : ""}
                        {e.label}
                      </button>
                    ))}
                </div>
                {etapaEscolhida && (
                  <div>
                    <textarea
                      value={nota}
                      onChange={(ev) => setNota(ev.target.value)}
                      rows={3}
                      placeholder={etapaEscolhida.notaObrigatoria ?? "Observação (opcional)"}
                      className="input-imp w-full text-sm"
                    />
                    {etapaEscolhida.notaObrigatoria && (
                      <p className="mt-1 text-[11px] text-warning-bright">Obrigatório: {etapaEscolhida.notaObrigatoria}</p>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button type="button" disabled={isPending || !etapaAlvo} onClick={confirmar} className="btn-outline px-3 py-1.5 text-xs">
                    {isPending ? "..." : "Mover lead"}
                  </button>
                  {erro && <span className="text-xs text-wine-bright">{erro}</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
