// Mural do Head de um negócio com CRM (Davi, no Match Sales): pace do time, reuniões do time e quem precisa de atenção.
import Link from "next/link";
import type { PainelHead, LinhaTime } from "@/lib/head-negocio";
import { ROTULO_STATUS } from "@/lib/head-negocio";
import type { PaceCalculado } from "@/lib/pace-negocio";
import PaceAlternavel from "@/components/negocio/PaceAlternavel";
import DestaqueSetup from "@/components/negocio/DestaqueSetup";
import { ReunioesCanceladas, ReunioesDoDia } from "@/components/negocio/PainelCloser";
import { BarraMes, PaceEsforcoCard, ReunioesAAcontecer, ReunioesParaReagendar } from "@/components/negocio/PainelSdr";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`);

function Selo({ status }: { status: PaceCalculado["status"] }) {
  const s = ROTULO_STATUS[status];
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] ${s.classe}`}>{s.texto}</span>;
}

/** Realizado de uma pessoa contra a meta dela, com a cor do ritmo (verde, âmbar, vermelho). */
function Celula({ p, moedaFmt = false }: { p: PaceCalculado | null; moedaFmt?: boolean }) {
  if (!p || p.meta <= 0) return <span className="text-stone-600">—</span>;
  const f = (v: number) => (moedaFmt ? moeda(v) : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
  const cor = p.indice === null ? "text-stone-300" : p.indice >= 1 ? "text-success-bright" : p.indice >= 0.85 ? "text-amber-400" : "text-wine-bright";
  return (
    <span className={cor}>
      {f(p.recebido)} <span className="text-stone-500">/ {f(p.meta)}</span>
    </span>
  );
}

export function TabelaTime({ time }: { time: LinhaTime[] }) {
  const atrasados = time.filter((l) => l.recebido && (l.recebido.status === "atrasado" || l.recebido.status === "critico"));
  return (
    <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">Time · quem precisa de atenção</p>
        <p className={`text-xs ${atrasados.length > 0 ? "text-wine-bright" : "text-success-bright"}`}>
          {atrasados.length > 0 ? `${atrasados.length} ${atrasados.length === 1 ? "pessoa abaixo" : "pessoas abaixo"} do ritmo` : "todos no ritmo"}
        </p>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-stone-500">
              <th className="py-1 text-left font-normal">Pessoa</th>
              <th className="py-1 text-right font-normal">Recebido</th>
              <th className="py-1 text-right font-normal">Agendadas</th>
              <th className="py-1 text-right font-normal">Realizadas</th>
              <th className="py-1 text-right font-normal">No-show</th>
              <th className="py-1 text-right font-normal">Vendas</th>
              <th className="py-1 text-right font-normal">MRR</th>
              <th className="py-1 text-right font-normal">Ritmo</th>
            </tr>
          </thead>
          <tbody>
            {time.map((l) => (
              <tr key={l.id} className="border-t border-imperium-line/60">
                <td className="py-1.5 text-stone-200">{l.nome}</td>
                <td className="py-1.5 text-right tabular-nums">
                  <Celula p={l.recebido} moedaFmt />
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  <Celula p={l.agendadas} />
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  <Celula p={l.realizadas} />
                </td>
                <td className={`py-1.5 text-right tabular-nums ${l.noShow?.pct == null ? "text-stone-600" : l.noShow.pct > 0.3 ? "text-wine-bright" : l.noShow.pct > 0.15 ? "text-amber-400" : "text-success-bright"}`}>
                  {l.noShow ? pct(l.noShow.pct) : "—"}
                </td>
                <td className="py-1.5 text-right tabular-nums text-stone-300">{l.vendas}</td>
                <td className="py-1.5 text-right tabular-nums text-stone-300">{l.mrr > 0 ? moeda(l.mrr) : "—"}</td>
                <td className="py-1.5 text-right">{l.recebido ? <Selo status={l.recebido.status} /> : <span className="text-stone-600">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-stone-500">
        Ordenado de quem está mais longe do ritmo para quem está mais perto. Cada número é o realizado do mês contra a meta da pessoa; as reuniões usam a meta do canal dividida entre quem agenda.
      </p>
    </section>
  );
}

export function MuralHead({
  painel,
  equipe,
  cor,
  mesLabel,
  mesAtual,
}: {
  painel: PainelHead;
  equipe: string;
  cor: string;
  mesLabel: string;
  mesAtual: boolean;
}) {
  return (
    <div className="space-y-4">
      <p className="text-[10px] uppercase tracking-widest text-stone-500">
        Gestão do time · {equipe} · {mesLabel}
      </p>
      {mesAtual && <BarraMes p={painel.recebido} cor={cor} />}
      <PaceAlternavel
        opcoes={[
          { chave: "recebido", rotulo: "Recebido", conteudo: <PaceEsforcoCard titulo="Recebido do time no mês" p={painel.recebido} cor={cor} mesAtual={mesAtual} formato="moeda" ondeEstaPrimeiro /> },
          { chave: "mrr", rotulo: "MRR", conteudo: <PaceEsforcoCard titulo="MRR vendido pelo time no mês" p={painel.mrr} cor={cor} mesAtual={mesAtual} formato="moeda" /> },
          ...(painel.setup
            ? [{ chave: "setup", rotulo: "Setup", conteudo: <PaceEsforcoCard titulo="Setup / implantação do time no mês" p={painel.setup} cor={cor} mesAtual={mesAtual} formato="moeda" /> }]
            : []),
        ]}
      />
      {painel.setup && <DestaqueSetup setup={painel.setup} recebidoMeta={painel.recebido.meta} time cor={cor} />}

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Reuniões previstas do time</p>
          <p className="text-[10px] text-stone-600">a partir de amanhã</p>
          <ReunioesAAcontecer lista={painel.previstas} rotulo="agendada por" />
          <p className="mt-1 text-xs text-stone-500">{painel.previstas.length > 0 ? "passe o mouse no número para ver quem e quando" : "nenhuma reunião a acontecer no CRM"}</p>
        </section>
        <ReunioesDoDia lista={painel.doDia} rotulo="agendada por" />
        <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Reuniões para reagendar do time</p>
          <ReunioesParaReagendar lista={painel.reagendar} rotulo="agendada por" />
          <p className="mt-1 text-xs text-stone-500">{painel.reagendar.length > 0 ? "passe o mouse no número para ver quais" : "nenhuma com data passada ou no-show"}</p>
        </section>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {painel.agendadas ? (
          <PaceEsforcoCard titulo="Reuniões agendadas do time no mês" p={painel.agendadas} cor={cor} mesAtual={mesAtual} />
        ) : (
          <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Reuniões agendadas do time no mês</p>
            <p className="mt-1 text-3xl font-semibold text-stone-400">—</p>
          </section>
        )}
        {painel.realizadas ? (
          <PaceEsforcoCard titulo="Reuniões realizadas do time no mês" p={painel.realizadas} cor={cor} mesAtual={mesAtual} />
        ) : (
          <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Reuniões realizadas do time no mês</p>
            <p className="mt-1 text-3xl font-semibold text-stone-400">—</p>
          </section>
        )}
      </div>
      <ReunioesCanceladas lista={painel.canceladas} />

      <TabelaTime time={painel.time} />
      <p className="text-right text-[11px] text-stone-500">
        <Link href="/pace-negocio" className="text-gold hover:underline">
          Ver o Pace completo do time →
        </Link>
      </p>
    </div>
  );
}
