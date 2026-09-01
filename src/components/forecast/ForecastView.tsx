"use client";

import { useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import ForecastRow from "./ForecastRow";
import ForecastRowQueda from "./ForecastRowQueda";
import { STATUS_SHEET_LABELS, STATUS_SHEET_COR, BALDE_LABELS, classificarBalde, type ForecastOp, type Balde } from "@/lib/forecast";
import { Table, Th, Td } from "@/components/ui/Table";

type Aba = "assinaturas" | "reanalise" | "pagos" | "quedas";

// classificar()/Balde/BALDE_LABELS vivem em src/lib/forecast.ts — extraído
// de lá pra também alimentar a tag de classificação nos leads
// Assinado/Pago em /leads (ver leads/page.tsx). Cada card do resumo do
// topo corresponde a exatamente um desses baldes — clicar no card filtra a
// tabela de baixo pra mostrar só esses leads, sem duplicar a lógica de
// classificação (mesma função usada pra somar os valores do resumo e pra
// filtrar a tabela).
const classificar = classificarBalde;

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default function ForecastView({
  ops,
  escopoLabel,
  tribos,
  mesLabel,
  hrefMesAnterior,
  hrefMesAtual,
  hrefMesSeguinte,
}: {
  ops: ForecastOp[];
  escopoLabel: string;
  tribos: { chave: string; label: string }[];
  mesLabel: string;
  hrefMesAnterior: string;
  hrefMesAtual: string | null;
  hrefMesSeguinte: string;
}) {
  const [triboFiltro, setTriboFiltro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("assinaturas");
  const [baldeFiltro, setBaldeFiltro] = useState<Balde | null>(null);

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
  const opsDaAbaBase =
    aba === "assinaturas" ? opsAssinaturas : aba === "reanalise" ? opsReanalise : aba === "pagos" ? opsPagos : opsQuedas;
  const opsDaAba =
    baldeFiltro && aba !== "quedas" ? opsDaAbaBase.filter((o) => classificar(o) === baldeFiltro) : opsDaAbaBase;

  function clicarCard(b: Balde) {
    setBaldeFiltro((atual) => (atual === b ? null : b));
    setAba(b === "pago" ? "pagos" : b === "reanalise" ? "reanalise" : "assinaturas");
  }
  function clicarAba(v: Aba) {
    setAba(v);
    setBaldeFiltro(null);
  }

  const porStatus = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const o of opsFiltradas) mapa.set(o.status, (mapa.get(o.status) ?? 0) + o.valor);
    return mapa;
  }, [opsFiltradas]);

  const resumo = useMemo(() => {
    const totais: Record<Balde, number> = {
      pago: 0,
      aguardando: 0,
      pendencia: 0,
      juridico: 0,
      esfriou: 0,
      reanalise: 0,
      naoClassificado: 0,
    };
    for (const o of opsFiltradas) {
      const b = classificar(o);
      if (b) totais[b] += o.valor;
    }
    return totais;
  }, [opsFiltradas]);

  const statusOrdenados = ["PAGO", "ASSINADO", "REANÁLISE", "CAIU", "DESISTIU"].filter((s) => porStatus.has(s));
  const maxStatus = Math.max(...Array.from(porStatus.values()), 1);

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Forecast</h1>
          <p className="kicker mt-1">{escopoLabel} · {mesLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={hrefMesAnterior} className="btn-outline px-2.5 py-1.5 text-xs">
            ← Mês
          </a>
          {hrefMesAtual && (
            <a href={hrefMesAtual} className="btn-outline px-2.5 py-1.5 text-xs">
              Mês atual
            </a>
          )}
          <a href={hrefMesSeguinte} className="btn-outline px-2.5 py-1.5 text-xs">
            Mês →
          </a>
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
        {(
          [
            ["pago", "Já pago", resumo.pago, "text-success-bright", null],
            ["aguardando", "Certo pra pagar", resumo.aguardando, "text-gold-bright", "marcados “Aguardando Pagamento”"],
            ["pendencia", "Em resolução de pendência", resumo.pendencia, "text-wine-bright", null],
            ["juridico", "Análise Jurídico", resumo.juridico, "text-stone-200", null],
            ["esfriou", "Esfriou", resumo.esfriou, "text-stone-400", null],
            ["reanalise", "Em reanálise", resumo.reanalise, "", "não caiu, mas parado — não dá pra trabalhar agora"],
            ["naoClassificado", "Ainda não classificado", resumo.naoClassificado, "text-stone-300", "assinado sem status marcado"],
          ] as [Balde, string, number, string, string | null][]
        ).map(([b, label, valor, cor, sub]) => (
          <button
            key={b}
            type="button"
            onClick={() => clicarCard(b)}
            className={`card-imp cursor-pointer text-left transition ${
              baldeFiltro === b ? "border-gold" : "hover:border-gold/50"
            }`}
            style={baldeFiltro === b ? { borderColor: "var(--c-gold)" } : undefined}
          >
            <p className="kicker mb-2">{label}</p>
            <p className={`font-display text-xl ${cor}`} style={b === "reanalise" ? { color: "#ffc94d" } : undefined}>
              {moeda(valor)}
            </p>
            {sub && <p className="mt-1 text-[10px] text-stone-500">{sub}</p>}
          </button>
        ))}
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
          baldeFiltro
            ? BALDE_LABELS[baldeFiltro]
            : aba === "assinaturas"
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
                onClick={() => clicarAba(v)}
                className={`rounded px-2.5 py-1 text-[10px] uppercase transition ${
                  aba === v && !baldeFiltro ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-400 hover:border-gold"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {baldeFiltro && (
          <div className="mb-3 flex items-center gap-2 text-xs">
            <span className="text-stone-400">Filtrado por:</span>
            <span className="rounded bg-gold/15 px-2 py-1 text-gold-bright">{BALDE_LABELS[baldeFiltro]}</span>
            <button onClick={() => setBaldeFiltro(null)} className="text-stone-500 underline hover:text-stone-300">
              limpar
            </button>
          </div>
        )}
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
