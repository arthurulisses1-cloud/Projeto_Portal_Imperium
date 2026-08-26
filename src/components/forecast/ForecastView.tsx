"use client";

import { useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import ForecastRow from "./ForecastRow";
import ForecastRowQueda from "./ForecastRowQueda";
import { STATUS_SHEET_LABELS, STATUS_SHEET_COR, type ForecastOp } from "@/lib/forecast";
import { Table, Th, Td } from "@/components/ui/Table";

type Aba = "assinaturas" | "reanalise" | "pagos" | "quedas";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default function ForecastView({
  ops,
  escopoLabel,
  tribos,
}: {
  ops: ForecastOp[];
  escopoLabel: string;
  tribos: { chave: string; label: string }[];
}) {
  const [triboFiltro, setTriboFiltro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("assinaturas");

  const opsFiltradas = useMemo(() => {
    if (!triboFiltro) return ops;
    return ops.filter((o) => o.sdrTribo === triboFiltro || o.closerTribo === triboFiltro);
  }, [ops, triboFiltro]);

  // Assinaturas = em aberto, seguindo o fluxo normal (ASSINADO); Reanálise =
  // não caiu, mas tá parado num precatório em reanálise (não dá pra
  // trabalhar agora — pedido do Diretor, 2026-08-26: não deve ficar
  // misturado com assinatura normal); Pagos = liquidado; Quedas = CAIU/
  // DESISTIU, com o motivo pra registrar.
  const opsAssinaturas = useMemo(
    () => opsFiltradas.filter((o) => o.status === "ASSINADO"),
    [opsFiltradas]
  );
  const opsReanalise = useMemo(
    () => opsFiltradas.filter((o) => o.status === "REANÁLISE"),
    [opsFiltradas]
  );
  const opsPagos = useMemo(() => opsFiltradas.filter((o) => o.status === "PAGO"), [opsFiltradas]);
  const opsQuedas = useMemo(
    () => opsFiltradas.filter((o) => o.status === "CAIU" || o.status === "DESISTIU"),
    [opsFiltradas]
  );
  const opsDaAba =
    aba === "assinaturas" ? opsAssinaturas : aba === "reanalise" ? opsReanalise : aba === "pagos" ? opsPagos : opsQuedas;

  const porStatus = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const o of opsFiltradas) mapa.set(o.status, (mapa.get(o.status) ?? 0) + o.valor);
    return mapa;
  }, [opsFiltradas]);

  const resumo = useMemo(() => {
    let pago = 0,
      aguardando = 0,
      pendencia = 0,
      juridico = 0,
      esfriou = 0,
      naoClassificado = 0,
      reanalise = 0;
    for (const o of opsFiltradas) {
      if (o.status === "PAGO") pago += o.valor;
      else if (o.status === "REANÁLISE") reanalise += o.valor;
      else if (o.statusManual === "aguardando_pagamento") aguardando += o.valor;
      else if (o.statusManual === "resolvendo_pendencia") pendencia += o.valor;
      else if (o.statusManual === "analise_juridico") juridico += o.valor;
      else if (o.statusManual === "esfriou") esfriou += o.valor;
      else if (o.status === "ASSINADO") naoClassificado += o.valor;
    }
    return { pago, aguardando, pendencia, juridico, esfriou, naoClassificado, reanalise };
  }, [opsFiltradas]);

  const statusOrdenados = ["PAGO", "ASSINADO", "REANÁLISE", "CAIU", "DESISTIU"].filter((s) => porStatus.has(s));
  const maxStatus = Math.max(...Array.from(porStatus.values()), 1);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Forecast</h1>
          <p className="kicker mt-1">{escopoLabel} · mês corrente</p>
        </div>
        {tribos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTriboFiltro(null)}
              className={`rounded px-3 py-1.5 text-xs uppercase transition ${
                !triboFiltro ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold"
              }`}
            >
              Todas
            </button>
            {tribos.map((t) => (
              <button
                key={t.chave}
                onClick={() => setTriboFiltro(t.chave)}
                className={`rounded px-3 py-1.5 text-xs uppercase transition ${
                  triboFiltro === t.chave ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-7">
        <Card>
          <p className="kicker mb-2">Já pago</p>
          <p className="font-display text-xl text-success-bright">{moeda(resumo.pago)}</p>
        </Card>
        <Card>
          <p className="kicker mb-2">Certo pra pagar</p>
          <p className="font-display text-xl text-gold-bright">{moeda(resumo.aguardando)}</p>
          <p className="mt-1 text-[10px] text-stone-500">marcados &ldquo;Aguardando Pagamento&rdquo;</p>
        </Card>
        <Card>
          <p className="kicker mb-2">Em resolução de pendência</p>
          <p className="font-display text-xl text-wine-bright">{moeda(resumo.pendencia)}</p>
        </Card>
        <Card>
          <p className="kicker mb-2">Análise Jurídico</p>
          <p className="font-display text-xl text-stone-200">{moeda(resumo.juridico)}</p>
        </Card>
        <Card>
          <p className="kicker mb-2">Esfriou</p>
          <p className="font-display text-xl text-stone-400">{moeda(resumo.esfriou)}</p>
        </Card>
        <Card>
          <p className="kicker mb-2">Em reanálise</p>
          <p className="font-display text-xl" style={{ color: "#ffc94d" }}>{moeda(resumo.reanalise)}</p>
          <p className="mt-1 text-[10px] text-stone-500">não caiu, mas parado — não dá pra trabalhar agora</p>
        </Card>
        <Card>
          <p className="kicker mb-2">Ainda não classificado</p>
          <p className="font-display text-xl text-stone-300">{moeda(resumo.naoClassificado)}</p>
          <p className="mt-1 text-[10px] text-stone-500">assinado sem status marcado</p>
        </Card>
      </div>

      <Card title="Assinado, pago, caiu e reanálise no mês">
        <div className="space-y-2.5">
          {statusOrdenados.length === 0 && <p className="text-sm text-stone-500">Sem operações neste recorte.</p>}
          {statusOrdenados.map((s) => {
            const v = porStatus.get(s) ?? 0;
            return (
              <div key={s} className="flex items-center gap-3 text-sm">
                <span className="w-24 shrink-0 text-stone-400">{STATUS_SHEET_LABELS[s] ?? s}</span>
                <div className="h-5 flex-1 overflow-hidden rounded bg-imperium-bg">
                  <div
                    className="h-full rounded"
                    style={{ width: `${(v / maxStatus) * 100}%`, background: STATUS_SHEET_COR[s] ?? "var(--c-gold)" }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-stone-100">{moeda(v)}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title={
          aba === "assinaturas"
            ? "Assinaturas do mês"
            : aba === "reanalise"
            ? "Em reanálise"
            : aba === "pagos"
            ? "Pagos do mês"
            : "Quedas do mês"
        }
        right={
          <div className="flex gap-1.5">
            {(
              [
                ["assinaturas", `Assinaturas (${opsAssinaturas.length})`],
                ["reanalise", `Reanálise (${opsReanalise.length})`],
                ["pagos", `Pagos (${opsPagos.length})`],
                ["quedas", `Quedas (${opsQuedas.length})`],
              ] as [Aba, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setAba(v)}
                className={`rounded px-2.5 py-1 text-[10px] uppercase transition ${
                  aba === v ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-400 hover:border-gold"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <Table>
          <thead>
            <tr>
              <Th className="pr-3">Data</Th>
              <Th className="pr-3">Cliente</Th>
              <Th className="pr-3">SDR</Th>
              <Th className="pr-3">Closer</Th>
              <Th align="right" className="pr-3">Valor</Th>
              <Th className="pr-3">Status planilha</Th>
              {aba === "quedas" ? (
                <>
                  <Th className="pr-3">Motivo</Th>
                  <Th>Observação</Th>
                </>
              ) : (
                <>
                  <Th className="pr-3">Status manual</Th>
                  <Th>Observação</Th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {opsDaAba.length === 0 && (
              <tr>
                <Td colSpan={8} className="text-center text-stone-600">
                  Nada neste recorte.
                </Td>
              </tr>
            )}
            {opsDaAba.map((op) =>
              aba === "quedas" ? <ForecastRowQueda key={op.id} op={op} /> : <ForecastRow key={op.id} op={op} />
            )}
          </tbody>
        </Table>
      </Card>
    </main>
  );
}
