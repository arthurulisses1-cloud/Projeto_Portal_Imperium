// Peças da visão do SDR (pré-vendas): Mural, Pace, Minha Produção. Os dados vêm de buscarPainelSdr.
import type { PaceCalculado } from "@/lib/pace-negocio";
import type { EtapaEsforco } from "@/lib/pace-esforco";
import { ROTULO_ETAPA, tabelaDiaria, type PainelSdr, type ReuniaoFutura } from "@/lib/sdr-negocio";

const ETAPAS: EtapaEsforco[] = ["reunioes_agendadas", "reunioes_realizadas", "vendas"];

export function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
const decimal = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const dec = decimal;
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

/** Barra do mês: quanto do mês útil já passou. */
export function BarraMes({ p, cor }: { p: PaceCalculado; cor: string }) {
  const frac = p.diasUteisTotal > 0 ? p.diasUteisDecorridos / p.diasUteisTotal : 0;
  return (
    <div className="rounded-lg border border-imperium-line bg-imperium-surface px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="text-stone-300">
          {p.diasUteisDecorridos >= p.diasUteisTotal
            ? `Mês encerrado · ${p.diasUteisTotal} dias úteis`
            : p.diasUteisDecorridos === 0
              ? `Não começou · ${p.diasUteisTotal} dias úteis`
              : `${p.diasUteisDecorridos}º dia útil de ${p.diasUteisTotal} · ${p.diasUteisRestantes} restantes`}
        </span>
        <span className="text-stone-500">{Math.round(frac * 100)}% do mês transcorrido</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-imperium-raised">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, frac * 100)}%`, background: `rgb(${cor})` }} />
      </div>
    </div>
  );
}

/** Pace de um indicador de esforço: meta do mês, onde deveria estar hoje e onde está. */
export function PaceEsforcoCard({ titulo, p, cor, mesAtual, formato = "num" }: { titulo: string; p: PaceCalculado; cor: string; mesAtual: boolean; formato?: "num" | "moeda" }) {
  const dec = formato === "moeda" ? moeda : decimal;
  const pctFeito = p.meta > 0 ? Math.min(100, (p.recebido / p.meta) * 100) : 0;
  const pctEsperado = p.meta > 0 ? Math.min(100, (p.esperadoAteHoje / p.meta) * 100) : 0;
  const diferenca = p.recebido - p.esperadoAteHoje;
  const noRitmo = diferenca >= 0;
  return (
    <section className="rounded-lg border bg-imperium-surface p-4" style={{ borderColor: `rgb(${cor} / 0.55)` }}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">{titulo}</p>
        {p.meta > 0 && <p className="text-xl font-semibold text-stone-100">{Math.round((p.recebido / p.meta) * 100)}%</p>}
      </div>
      {p.meta <= 0 ? (
        <p className="mt-2 text-sm text-stone-400">
          {dec(p.recebido)} no mês · sem meta definida para você neste indicador.
        </p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Meta do mês</p>
              <p className="mt-0.5 text-lg font-semibold text-stone-100">{dec(p.meta)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Deveria estar</p>
              <p className="mt-0.5 text-lg font-semibold text-stone-300">{mesAtual ? dec(p.esperadoAteHoje) : "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-stone-500">Onde está</p>
              <p className={`mt-0.5 text-lg font-semibold ${mesAtual ? (noRitmo ? "text-success-bright" : "text-wine-bright") : "text-gold-bright"}`}>{dec(p.recebido)}</p>
            </div>
          </div>
          <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-imperium-raised">
            {mesAtual && <div className="absolute inset-y-0 left-0 opacity-25" style={{ width: `${pctEsperado}%`, backgroundColor: `rgb(${cor})` }} />}
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pctFeito}%`, backgroundColor: `rgb(${cor})` }} />
            {mesAtual && <div className="absolute top-0 h-full w-0.5 bg-stone-200/80" style={{ left: `${pctEsperado}%` }} title="Onde deveria estar hoje" />}
          </div>
          <p className="mt-2 text-xs text-stone-400">
            {p.recebido >= p.meta ? "meta batida" : `faltam ${dec(p.meta - p.recebido)}`}
            {mesAtual && (
              <span className={noRitmo ? "text-success-bright" : "text-wine-bright"}>
                {" "}
                · {noRitmo ? `${dec(diferenca)} acima do ritmo` : `${dec(-diferenca)} abaixo do ritmo`}
              </span>
            )}
            {mesAtual && p.recebido < p.meta && p.necessarioPorDia !== null && <span> · {dec(p.necessarioPorDia)} por dia útil</span>}
          </p>
        </>
      )}
    </section>
  );
}

export function quandoReuniao(r: ReuniaoFutura): string {
  if (!r.quando) return r.quandoTexto ?? "sem data no CRM";
  const d = new Date(r.quando);
  const dia = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return hora === "00:00" ? dia : `${dia} · ${hora}`;
}

/** Número de reuniões a acontecer; ao passar o mouse, a data de cada reunião e o lead. */
export function ReunioesAAcontecer({ lista }: { lista: ReuniaoFutura[] }) {
  const agora = Date.now();
  if (lista.length === 0) return <p className="mt-1 text-3xl font-semibold text-stone-400">0</p>;
  return (
    <span className="group relative mt-1 inline-block" tabIndex={0}>
      <span className="cursor-help text-3xl font-semibold text-stone-100 underline decoration-stone-500 decoration-dotted underline-offset-8">{lista.length}</span>
      <span className="pointer-events-none invisible absolute left-0 top-full z-30 mt-2 w-80 rounded-md border border-imperium-line bg-imperium-surface p-2 text-left opacity-0 shadow-xl transition-opacity group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100 group-focus:pointer-events-auto group-focus:visible group-focus:opacity-100">
        <span className="mb-1 block text-[10px] uppercase tracking-widest text-stone-500">
          {lista.length} {lista.length === 1 ? "reunião agendada" : "reuniões agendadas"}
        </span>
        <span className="block max-h-72 space-y-1.5 overflow-y-auto">
          {lista.map((r) => {
            const passou = !!r.quando && Date.parse(r.quando) < agora - 2 * 3600_000;
            return (
              <span key={r.id} className="block text-[11px] leading-tight">
                <span className={passou ? "text-wine-bright" : "text-gold-bright"}>{quandoReuniao(r)}</span> <span className="text-stone-100">{r.nome}</span>
                {r.empresa && r.empresa !== r.nome && <span className="text-stone-500"> · {r.empresa}</span>}
                {r.sdr && <span className="text-stone-500"> · SDR {r.sdr}</span>}
                {passou && <span className="block text-wine-bright">a data já passou: atualize a etapa no CRM</span>}
              </span>
            );
          })}
        </span>
      </span>
    </span>
  );
}

/** Quadrados do Mural: % de no-show, reuniões a acontecer e vendas do mês (MRR e recebido). */
export function QuadradosSdr({ painel, cor }: { painel: PainelSdr; cor: string }) {
  const ns = painel.reunioes?.noShow ?? null;
  const futuras = painel.reunioes?.aAcontecer ?? null;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">No-show do mês</p>
        <p className={`mt-1 text-3xl font-semibold ${ns?.pct == null ? "text-stone-400" : ns.pct > 0.3 ? "text-wine-bright" : ns.pct > 0.15 ? "text-amber-400" : "text-success-bright"}`}>
          {ns ? pct(ns.pct) : "—"}
        </p>
        <p className="mt-1 text-xs text-stone-500">
          {ns ? `${ns.qtd} no-show de ${ns.base} reuniões agendadas no mês que já aconteceram (ou deveriam)` : "Sem dados de reuniões no CRM para você."}
        </p>
      </section>
      <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">Reuniões a acontecer</p>
        {futuras ? <ReunioesAAcontecer lista={futuras} /> : <p className="mt-1 text-3xl font-semibold text-stone-400">—</p>}
        <p className="mt-1 text-xs text-stone-500">{futuras && futuras.length > 0 ? "passe o mouse no número para ver data e lead" : "agendadas por você no CRM"}</p>
      </section>
      <section className="rounded-lg border bg-imperium-surface p-4" style={{ borderColor: `rgb(${cor} / 0.55)` }}>
        <p className="text-[10px] uppercase tracking-widest text-stone-500">Vendido no mês</p>
        <div className="mt-1 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">MRR</p>
            <p className="text-2xl font-semibold text-gold-bright">{moeda(painel.vendas.mrr)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-stone-500">Recebido</p>
            <p className="text-2xl font-semibold text-stone-100">{moeda(painel.vendas.recebido)}</p>
          </div>
        </div>
        <p className="mt-1 text-xs text-stone-500">
          {painel.vendas.lista.length} {painel.vendas.lista.length === 1 ? "venda" : "vendas"} em que você foi o SDR ou fechou
        </p>
      </section>
    </div>
  );
}

const celula = "px-1.5 py-1 text-right tabular-nums";
function Acum({ v }: { v: number | null }) {
  if (v === null) return <td className={`${celula} text-stone-600`}>—</td>;
  const r = Math.round(v * 10) / 10;
  return <td className={`${celula} ${r > 0 ? "text-success-bright" : r < 0 ? "text-wine-bright" : "text-stone-500"}`}>{dec(r)}</td>;
}
function Ating({ real, meta }: { real: number; meta: number }) {
  return <td className={`${celula} text-stone-500`}>{meta > 0 ? `${Math.round((real / meta) * 100)}%` : "—"}</td>;
}

/** Tabela do Pace diário etapa por etapa (realizado do dia, meta, % de atingimento e acumulado), como na Matri. */
export function TabelaPaceDiario({ painel, ano, mes, hoje, titulo = "Pace diário · etapa por etapa" }: { painel: Pick<PainelSdr, "pv">; ano: number; mes: number; hoje: string; titulo?: string }) {
  if (!painel.pv) return null;
  const etapas = ETAPAS.map((e) => ({
    chave: e,
    label: ROTULO_ETAPA[e],
    meta: painel.pv!.indicadores[e].pace.meta,
    datas: (painel.pv!.indicadores[e].leads ?? []).map((l) => l.data),
  }));
  const { linhas, total } = tabelaDiaria(etapas, ano, mes, hoje);
  return (
    <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <p className="text-[10px] uppercase tracking-widest text-stone-500">{titulo}</p>
      <p className="mt-0.5 text-[11px] text-stone-500">
        Meta do dia = meta do mês ÷ dias úteis. Acumulado = soma de (realizado − meta) até o dia: verde, acima do ritmo; vermelho, abaixo.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-[900px] border-collapse text-xs">
          <thead>
            <tr>
              <th colSpan={2} className="sticky left-0 z-10 bg-imperium-surface" />
              {etapas.map((e) => (
                <th key={e.chave} colSpan={4} className="border-b border-imperium-line px-2 py-1 text-center text-[10px] uppercase tracking-wide text-stone-300">
                  {e.label}
                </th>
              ))}
            </tr>
            <tr className="text-[10px] uppercase tracking-wide text-stone-500">
              <th className="sticky left-0 z-10 bg-imperium-surface px-2 py-1 text-left">Dia</th>
              <th className="px-2 py-1 text-left">Data</th>
              {etapas.map((e) => [
                <th key={e.chave + "r"} className="px-1.5 py-1 text-right">Real.</th>,
                <th key={e.chave + "m"} className="px-1.5 py-1 text-right">Meta</th>,
                <th key={e.chave + "a"} className="px-1.5 py-1 text-right">Ating.</th>,
                <th key={e.chave + "c"} className="px-1.5 py-1 text-right">Acum.</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const ehHoje = l.data === hoje;
              return (
                <tr key={l.data} className={`border-b border-imperium-line/50 ${!l.util ? "opacity-40" : ""} ${ehHoje ? "bg-gold/10 ring-1 ring-inset ring-gold/40" : ""}`}>
                  <td className={`sticky left-0 z-10 px-2 py-1 capitalize ${ehHoje ? "bg-imperium-surface font-semibold text-gold-bright" : "bg-imperium-bg text-stone-300"}`}>
                    {l.diaSemana}
                    {ehHoje && <span className="ml-1 text-[10px] uppercase tracking-wide text-gold">hoje</span>}
                  </td>
                  <td className="px-2 py-1 text-stone-400">{l.data.slice(8)}/{l.data.slice(5, 7)}</td>
                  {l.celulas.map((c, i) => [
                    <td key={i + "r"} className={`${celula} ${l.futuro ? "text-stone-600" : "text-stone-100"}`}>{l.futuro ? "—" : dec(c.real)}</td>,
                    <td key={i + "m"} className={`${celula} text-stone-500`}>{dec(c.meta)}</td>,
                    l.futuro ? <td key={i + "a"} className={`${celula} text-stone-600`}>—</td> : <Ating key={i + "a"} real={c.real} meta={c.meta} />,
                    <Acum key={i + "c"} v={c.acum} />,
                  ])}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gold/40 bg-imperium-surface font-medium">
              <td colSpan={2} className="sticky left-0 z-10 bg-imperium-surface px-2 py-1.5 text-gold-bright">
                Total do mês
              </td>
              {total.map((c, i) => [
                <td key={i + "r"} className={`${celula} text-stone-100`}>{dec(c.real)}</td>,
                <td key={i + "m"} className={`${celula} text-stone-500`}>{dec(c.meta)}</td>,
                <Ating key={i + "a"} real={c.real} meta={c.meta} />,
                <Acum key={i + "c"} v={c.acum} />,
              ])}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function corConversao(real: number | null, meta: number | null) {
  if (real === null || meta === null || meta <= 0) return "text-stone-300";
  if (real >= meta) return "text-success-bright";
  if (real >= meta * 0.85) return "text-amber-400";
  return "text-wine-bright";
}

/** Funil da pessoa no mês: meta de volume, realizado, atingimento e conversão etapa por etapa (realizado × meta). */
export function FunilSdr({ painel }: { painel: PainelSdr }) {
  if (!painel.pv) return null;
  const ind = painel.pv.indicadores;
  const linhas = ETAPAS.map((e, i) => {
    const p = ind[e].pace;
    const ant = i > 0 ? ind[ETAPAS[i - 1]].pace : null;
    return {
      e,
      meta: p.meta,
      real: p.recebido,
      esperado: p.esperadoAteHoje,
      convReal: ant && ant.recebido > 0 ? p.recebido / ant.recebido : null,
      convMeta: ant && ant.meta > 0 ? p.meta / ant.meta : null,
    };
  });
  return (
    <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <p className="text-[10px] uppercase tracking-widest text-stone-500">Seu funil no mês · realizado × meta</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-stone-500">
              <th className="py-1 text-left font-normal">Etapa</th>
              <th className="py-1 text-right font-normal">Meta de volume</th>
              <th className="py-1 text-right font-normal">Deveria estar</th>
              <th className="py-1 text-right font-normal">Realizado</th>
              <th className="py-1 text-right font-normal">Atingimento</th>
              <th className="py-1 text-right font-normal">Conversão real</th>
              <th className="py-1 text-right font-normal">Conversão meta</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.e} className="border-t border-imperium-line/60">
                <td className="py-2 text-stone-200">{ROTULO_ETAPA[l.e]}</td>
                <td className="py-2 text-right tabular-nums text-stone-300">{l.meta > 0 ? dec(l.meta) : "—"}</td>
                <td className="py-2 text-right tabular-nums text-stone-500">{l.meta > 0 ? dec(l.esperado) : "—"}</td>
                <td className="py-2 text-right tabular-nums font-semibold text-stone-100">{dec(l.real)}</td>
                <td className={`py-2 text-right tabular-nums ${corConversao(l.real, l.esperado)}`}>{l.meta > 0 ? `${Math.round((l.real / l.meta) * 100)}%` : "—"}</td>
                <td className={`py-2 text-right tabular-nums ${corConversao(l.convReal, l.convMeta)}`}>{l.convMeta === null && l.convReal === null ? "—" : pct(l.convReal)}</td>
                <td className="py-2 text-right tabular-nums text-stone-500">{pct(l.convMeta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-stone-500">
        Conversão = etapa ÷ etapa anterior. A meta de cada etapa é a do forecast do seu canal, dividida entre quem trabalha nele. Vendas originadas: as que vieram de reuniões que você agendou.
      </p>
    </section>
  );
}

/** Aviso quando a pessoa não foi achada no CRM ou não está no time de um canal. */
export function AvisoSdr({ painel }: { painel: PainelSdr }) {
  if (painel.usuarioCrm && painel.pv) return null;
  return (
    <p className="rounded-lg border border-amber-400/40 bg-imperium-surface p-3 text-sm text-amber-300">
      {!painel.usuarioCrm
        ? "Não achamos o seu usuário no Pipefácil (o e-mail ou o nome não bateu). Avise o Diretor para ligar o seu login ao CRM."
        : "Você ainda não está no time de nenhum canal (outbound ou inbound), então não há meta de reuniões para você."}
    </p>
  );
}

/** Topo do Mural do SDR: o mês, os paces de reuniões agendadas e realizadas, no-show e vendas. */
export function MuralSdr({ painel, equipe, cor, mesLabel, mesAtual }: { painel: PainelSdr; equipe: string; cor: string; mesLabel: string; mesAtual: boolean }) {
  const ag = painel.pv?.indicadores.reunioes_agendadas.pace;
  const re = painel.pv?.indicadores.reunioes_realizadas.pace;
  return (
    <div className="space-y-4">
      <p className="text-[10px] uppercase tracking-widest text-stone-500">
        Seu pace · {equipe} · {mesLabel}
      </p>
      <AvisoSdr painel={painel} />
      {ag && mesAtual && <BarraMes p={ag} cor={cor} />}
      {ag && re && (
        <div className="grid gap-4 md:grid-cols-2">
          <PaceEsforcoCard titulo="Reuniões agendadas" p={ag} cor={cor} mesAtual={mesAtual} />
          <PaceEsforcoCard titulo="Reuniões realizadas" p={re} cor={cor} mesAtual={mesAtual} />
        </div>
      )}
      <QuadradosSdr painel={painel} cor={cor} />
    </div>
  );
}

/** Lista das vendas do mês em que a pessoa foi o SDR ou fechou. */
export function VendasSdr({ painel }: { painel: PainelSdr }) {
  if (painel.vendas.lista.length === 0) return null;
  return (
    <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <p className="text-[10px] uppercase tracking-widest text-stone-500">Suas vendas no mês</p>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-stone-500">
            <th className="py-1 text-left font-normal">Data</th>
            <th className="py-1 text-left font-normal">Cliente</th>
            <th className="py-1 text-right font-normal">MRR</th>
            <th className="py-1 text-right font-normal">Recebido</th>
          </tr>
        </thead>
        <tbody>
          {painel.vendas.lista.map((v) => (
            <tr key={v.id} className="border-t border-imperium-line/60">
              <td className="py-1.5 text-stone-400">{v.data.slice(8)}/{v.data.slice(5, 7)}</td>
              <td className="py-1.5 text-stone-200">{v.cliente ?? "—"}</td>
              <td className="py-1.5 text-right tabular-nums text-stone-300">{v.mrr ? moeda(v.mrr) : "—"}</td>
              <td className="py-1.5 text-right tabular-nums text-stone-100">{moeda(v.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
