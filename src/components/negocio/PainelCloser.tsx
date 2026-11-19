// Mural do Closer da Acrópole (Vorp): pace de recebido ou MRR (à escolha) e, logo abaixo, três quadrados:
// reuniões previstas, reuniões do dia (horário e SDR) e pace de reuniões realizadas.
import type { PainelCloser, ReuniaoCancelada, ReuniaoDoDia } from "@/lib/closer-negocio";
import PaceAlternavel from "@/components/negocio/PaceAlternavel";
import DestaqueSetup from "@/components/negocio/DestaqueSetup";
import { BarraMes, PaceEsforcoCard, ReunioesAAcontecer, ReunioesParaReagendar } from "@/components/negocio/PainelSdr";

function hora(iso: string | null, texto: string | null): string {
  if (!iso) return texto ?? "sem horário";
  const h = new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return h === "00:00" ? "sem horário" : h;
}

const SITUACAO: Record<ReuniaoDoDia["situacao"], { texto: string; classe: string }> = {
  a_acontecer: { texto: "a acontecer", classe: "text-gold-bright" },
  realizada: { texto: "realizada", classe: "text-success-bright" },
  no_show: { texto: "no-show", classe: "text-wine-bright" },
};

export function ReunioesDoDia({ lista, rotulo = "SDR" }: { lista: ReuniaoDoDia[]; rotulo?: string }) {
  return (
    <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <p className="text-[10px] uppercase tracking-widest text-stone-500">Reuniões do dia</p>
      <p className={`mt-1 text-3xl font-semibold ${lista.length === 0 ? "text-stone-400" : "text-stone-100"}`}>{lista.length}</p>
      {lista.length === 0 ? (
        <p className="mt-1 text-xs text-stone-500">nenhuma reunião marcada para hoje</p>
      ) : (
        <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
          {lista.map((r) => (
            <li key={r.id} className="text-[11px] leading-tight">
              <span className="font-semibold text-gold-bright">{hora(r.quando, r.quandoTexto)}</span> <span className="text-stone-100">{r.nome}</span>
              <span className="block text-stone-500">
                {rotulo} {r.sdr ?? "—"}{r.com ? ` · com ${r.com}` : ""} · <span className={SITUACAO[r.situacao].classe}>{SITUACAO[r.situacao].texto}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Reuniões que o lead cancelou (perdeu) no mês, agrupadas por motivo da perda do CRM. */
export function ReunioesCanceladas({ lista }: { lista: ReuniaoCancelada[] }) {
  const porMotivo = new Map<string, ReuniaoCancelada[]>();
  for (const r of lista) porMotivo.set(r.motivo, [...(porMotivo.get(r.motivo) ?? []), r]);
  const grupos = Array.from(porMotivo, ([motivo, itens]) => ({ motivo, itens })).sort((a, b) => b.itens.length - a.itens.length || a.motivo.localeCompare(b.motivo, "pt-BR"));
  return (
    <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <p className="text-[10px] uppercase tracking-widest text-stone-500">Reuniões agendadas que caíram no mês</p>
      <p className={`mt-1 text-3xl font-semibold ${lista.length === 0 ? "text-stone-400" : "text-wine-bright"}`}>{lista.length}</p>
      {lista.length === 0 ? (
        <p className="mt-1 text-xs text-stone-500">nenhuma reunião agendada no mês foi perdida</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {grupos.map((g) => (
            <li key={g.motivo} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-stone-200">{g.motivo}</span>
                <span className="tabular-nums text-stone-400">{g.itens.length}</span>
              </div>
              <p className="text-[11px] leading-snug text-stone-500">{g.itens.map((r) => r.nome).join(" · ")}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-stone-500">São as reuniões agendadas por você no mês cujo lead foi perdido depois; contam como agendadas, mas não viram realizadas.</p>
    </section>
  );
}

export function MuralCloser({
  painel,
  equipe,
  cor,
  mesLabel,
  mesAtual,
}: {
  painel: PainelCloser;
  equipe: string;
  cor: string;
  mesLabel: string;
  mesAtual: boolean;
}) {
  const previstas = painel.reunioes?.previstas ?? null;
  const rotulo = painel.slug === "vorp" ? "SDR" : "agendada por";
  return (
    <div className="space-y-4">
      <p className="text-[10px] uppercase tracking-widest text-stone-500">
        Seu pace · {equipe} · {mesLabel}
      </p>
      {!painel.nomeCrm && (
        <p className="rounded-lg border border-amber-400/40 bg-imperium-surface p-3 text-sm text-amber-300">
          Não achamos o seu usuário no Pipefácil (o e-mail ou o nome não bateu), então as reuniões não aparecem. Avise o Diretor para ligar o seu login ao CRM.
        </p>
      )}
      {mesAtual && <BarraMes p={painel.recebido} cor={cor} />}
      <PaceAlternavel
        opcoes={[
          { chave: "recebido", rotulo: "Recebido", conteudo: <PaceEsforcoCard titulo="Recebido no mês" p={painel.recebido} cor={cor} mesAtual={mesAtual} formato="moeda" /> },
          { chave: "mrr", rotulo: "MRR", conteudo: <PaceEsforcoCard titulo="MRR vendido no mês" p={painel.mrr} cor={cor} mesAtual={mesAtual} formato="moeda" /> },
          ...(painel.setup
            ? [{ chave: "setup", rotulo: "Setup", conteudo: <PaceEsforcoCard titulo="Setup / implantação no mês" p={painel.setup} cor={cor} mesAtual={mesAtual} formato="moeda" /> }]
            : []),
        ]}
      />
      {painel.setup && <DestaqueSetup setup={painel.setup} recebidoMeta={painel.recebido.meta} cor={cor} />}
      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Reuniões previstas pra acontecer</p>
          <p className="text-[10px] text-stone-600">a partir de amanhã</p>
          {previstas ? <ReunioesAAcontecer lista={previstas} rotulo={rotulo} /> : <p className="mt-1 text-3xl font-semibold text-stone-400">—</p>}
          <p className="mt-1 text-xs text-stone-500">{previstas && previstas.length > 0 ? "passe o mouse no número para ver quais e quando" : "agendadas para você no CRM"}</p>
        </section>
        <ReunioesDoDia lista={painel.reunioes?.doDia ?? []} rotulo={rotulo} />
        <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Reuniões para reagendar</p>
          {painel.reunioes ? <ReunioesParaReagendar lista={painel.reunioes.reagendar} rotulo={rotulo} /> : <p className="mt-1 text-3xl font-semibold text-stone-400">—</p>}
          <p className="mt-1 text-xs text-stone-500">{painel.reunioes && painel.reunioes.reagendar.length > 0 ? "passe o mouse no número para ver quais" : "nenhuma com data passada ou no-show"}</p>
        </section>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <PaceEsforcoCard titulo="Reuniões agendadas no mês" p={painel.agendadas} cor={cor} mesAtual={mesAtual} />
        <PaceEsforcoCard titulo="Reuniões realizadas no mês" p={painel.realizadas} cor={cor} mesAtual={mesAtual} />
      </div>
      {painel.reunioes && <ReunioesCanceladas lista={painel.reunioes.canceladas} />}
    </div>
  );
}
