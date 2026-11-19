// Mural do Maximus Energy: funil das contas (subidas → contrato enviado → validação → ganhas ou perdidas, com o motivo
// das perdas) e os paces de kWh e de faturamento gerado. O executivo vê o dele; o Head, o do time e o de cada pessoa.
import type { FunilEnergia, PainelEnergia, PessoaEnergia } from "@/lib/energy-time";
import { ROTULO_STATUS } from "@/lib/head-negocio";
import type { PaceCalculado } from "@/lib/pace-negocio";
import { BarraMes, PaceEsforcoCard } from "@/components/negocio/PainelSdr";

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

function Degrau({ rotulo, valor, base, anterior, cor }: { rotulo: string; valor: number; base: number; anterior: number | null; cor: string }) {
  const largura = base > 0 ? Math.max(valor > 0 ? 3 : 0, (valor / base) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-stone-300">{rotulo}</span>
        <span className="tabular-nums">
          <span className="font-semibold text-stone-100">{valor}</span>
          {anterior !== null && <span className="ml-2 text-[11px] text-stone-500">{pct(valor, anterior)} da etapa anterior</span>}
        </span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-imperium-raised">
        <div className="h-full rounded-full" style={{ width: `${largura}%`, backgroundColor: `rgb(${cor})` }} />
      </div>
    </div>
  );
}

/** Funil das contas do mês, com as duas saídas (ganhas e perdidas) e os motivos das perdas. */
export function FunilEnergiaCard({ funil, titulo, cor }: { funil: FunilEnergia; titulo: string; cor: string }) {
  return (
    <section className="rounded-lg border bg-imperium-surface p-4" style={{ borderColor: `rgb(${cor} / 0.55)` }}>
      <p className="text-[10px] uppercase tracking-widest text-stone-500">{titulo}</p>
      <div className="mt-3 space-y-3">
        <Degrau rotulo="Contas subidas" valor={funil.subidas} base={funil.subidas} anterior={null} cor={cor} />
        <Degrau rotulo="Contrato enviado" valor={funil.contrato} base={funil.subidas} anterior={funil.subidas} cor={cor} />
        <Degrau rotulo="Passaram pela validação" valor={funil.validacao} base={funil.subidas} anterior={funil.contrato} cor={cor} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded border border-amber-400/40 p-3">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Ainda em validação</p>
          <p className="mt-0.5 text-2xl font-semibold text-amber-400">{funil.emAndamento}</p>
          <p className="text-sm text-stone-200">
            {num(funil.emAndamentoKwh)} kWh · <span className="text-gold-bright">{moeda(funil.emAndamentoValor)}</span>
          </p>
          <p className="text-[11px] text-stone-500">aguardando a Sunne agora, entre as que passaram pela validação. R$ = 80% da primeira fatura</p>
        </div>
        <div className="rounded border border-success/40 p-3">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Ganhas</p>
          <p className="mt-0.5 text-2xl font-semibold text-success-bright">{funil.ganhas}</p>
          <p className="text-[11px] text-stone-500">
            {pct(funil.ganhas, funil.validacao)} das que passaram pela validação
          </p>
        </div>
        <div className="rounded border border-wine/50 p-3">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Perdidas</p>
          <p className="mt-0.5 text-2xl font-semibold text-wine-bright">{funil.perdidas}</p>
          <p className="text-[11px] text-stone-500">{funil.perdidasAntes > 0 ? `${funil.perdidasAntes} antes da validação` : "todas depois da validação"}</p>
        </div>
      </div>

      {funil.perdidas > 0 && (
        <div className="mt-3">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Por que perdemos</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {funil.motivos.slice(0, 6).map((m) => (
              <li key={m.motivo} className="flex items-baseline justify-between gap-3 text-stone-300">
                <span>{m.motivo}</span>
                <span className="tabular-nums text-stone-400">
                  {m.qtd} <span className="text-[11px] text-stone-600">({pct(m.qtd, funil.perdidas)})</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-[11px] text-stone-500">Contas criadas na Sunne neste mês, pela posição atual de cada uma.</p>
    </section>
  );
}

function Paces({ kwh, faturamento, cor, mesAtual, time = false }: { kwh: PaceCalculado; faturamento: PaceCalculado; cor: string; mesAtual: boolean; time?: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <PaceEsforcoCard titulo={time ? "kWh vendidos pelo time no mês" : "Seus kWh vendidos no mês"} p={kwh} cor={cor} mesAtual={mesAtual} />
      <PaceEsforcoCard titulo={time ? "Faturamento gerado pelo time no mês" : "Seu faturamento gerado no mês"} p={faturamento} cor={cor} mesAtual={mesAtual} formato="moeda" />
    </div>
  );
}

/** Mural do executivo do Energy: funil e os dois paces, de cara. */
export function MuralEnergia({ pessoa, equipe, cor, mesLabel, mesAtual }: { pessoa: PessoaEnergia; equipe: string; cor: string; mesLabel: string; mesAtual: boolean }) {
  return (
    <div className="space-y-4">
      <p className="text-[10px] uppercase tracking-widest text-stone-500">
        Seu funil e seu pace · {equipe} · {mesLabel}
      </p>
      {mesAtual && <BarraMes p={pessoa.kwh} cor={cor} />}
      <FunilEnergiaCard funil={pessoa.funil} titulo="Seu funil do mês" cor={cor} />
      <Paces kwh={pessoa.kwh} faturamento={pessoa.faturamento} cor={cor} mesAtual={mesAtual} />
      <p className="text-[11px] text-stone-500">
        kWh = consumo médio das suas contas ganhas no mês. Faturamento gerado = 80% da primeira fatura de cada conta ganha (100% se o mês passar de 80 mil kWh).
      </p>
    </div>
  );
}

function TabelaTime({ pessoas }: { pessoas: PessoaEnergia[] }) {
  const ordenadas = [...pessoas].sort((a, b) => (a.kwh.indice ?? 99) - (b.kwh.indice ?? 99) || a.nome.localeCompare(b.nome, "pt-BR"));
  const atrasados = ordenadas.filter((p) => p.kwh.status === "atrasado" || p.kwh.status === "critico").length;
  const cel = (p: PaceCalculado, f: (v: number) => string) => {
    const cor = p.indice === null ? "text-stone-300" : p.indice >= 1 ? "text-success-bright" : p.indice >= 0.85 ? "text-amber-400" : "text-wine-bright";
    return (
      <span className={cor}>
        {f(p.recebido)} <span className="text-stone-500">/ {f(p.meta)}</span>
      </span>
    );
  };
  return (
    <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">Time · quem precisa de atenção</p>
        <p className={`text-xs ${atrasados > 0 ? "text-wine-bright" : "text-success-bright"}`}>
          {atrasados > 0 ? `${atrasados} ${atrasados === 1 ? "pessoa abaixo" : "pessoas abaixo"} do ritmo` : "todos no ritmo"}
        </p>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[780px] text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-stone-500">
              <th className="py-1 text-left font-normal">Pessoa</th>
              <th className="py-1 text-right font-normal">Subidas</th>
              <th className="py-1 text-right font-normal">Contrato</th>
              <th className="py-1 text-right font-normal">Validação</th>
              <th className="py-1 text-right font-normal">Ganhas</th>
              <th className="py-1 text-right font-normal">Perdidas</th>
              <th className="py-1 text-right font-normal">kWh</th>
              <th className="py-1 text-right font-normal">Faturamento</th>
              <th className="py-1 text-right font-normal">Ritmo</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((p) => (
              <tr key={p.id} className="border-t border-imperium-line/60">
                <td className="py-1.5 text-stone-200">{p.nome}</td>
                <td className="py-1.5 text-right tabular-nums text-stone-300">{p.funil.subidas}</td>
                <td className="py-1.5 text-right tabular-nums text-stone-300">{p.funil.contrato}</td>
                <td className="py-1.5 text-right tabular-nums text-stone-300">{p.funil.validacao}</td>
                <td className="py-1.5 text-right tabular-nums text-success-bright">{p.funil.ganhas}</td>
                <td className="py-1.5 text-right tabular-nums text-wine-bright">{p.funil.perdidas}</td>
                <td className="py-1.5 text-right tabular-nums">{cel(p.kwh, num)}</td>
                <td className="py-1.5 text-right tabular-nums">{cel(p.faturamento, moeda)}</td>
                <td className="py-1.5 text-right">
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] ${ROTULO_STATUS[p.kwh.status].classe}`}>{ROTULO_STATUS[p.kwh.status].texto}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-stone-500">
        Ordenado de quem está mais longe do ritmo de kWh para quem está mais perto. A meta do time é dividida em partes iguais entre os vendedores.
      </p>
    </section>
  );
}

/** Mural do Head do Energy: funil e paces do time, e a tabela de cada vendedor. */
export function MuralEnergiaHead({ painel, equipe, cor, mesLabel, mesAtual }: { painel: PainelEnergia; equipe: string; cor: string; mesLabel: string; mesAtual: boolean }) {
  return (
    <div className="space-y-4">
      <p className="text-[10px] uppercase tracking-widest text-stone-500">
        Gestão do time · {equipe} · {mesLabel}
      </p>
      {mesAtual && <BarraMes p={painel.time.kwh} cor={cor} />}
      <Paces kwh={painel.time.kwh} faturamento={painel.time.faturamento} cor={cor} mesAtual={mesAtual} time />
      <FunilEnergiaCard funil={painel.time.funil} titulo="Funil do time no mês" cor={cor} />
      <TabelaTime pessoas={painel.pessoas} />
      <p className="text-[11px] text-stone-500">
        Faturamento do time aqui = contas ganhas na Sunne. O recebido oficial do negócio (Dashboard) inclui também ganhos do Pipefácil que não estão na Sunne.
      </p>
    </div>
  );
}
