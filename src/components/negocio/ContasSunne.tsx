import type { FunilContasSunne } from "@/lib/sunne";

const num = (v: number) => v.toLocaleString("pt-BR");
const pct = (parte: number, todo: number) => (todo > 0 ? `${Math.round((parte / todo) * 100)}%` : "—");

/** Contas na plataforma Sunne, todos os canais: subidas → avançaram → validação (contrato assinado) → ganho, pendência ou perdido. */
export default function ContasSunne({
  contas,
  cor,
  mesLabel,
  consolidado,
}: {
  contas: FunilContasSunne;
  cor: string;
  mesLabel: string;
  consolidado: { ganhosPipefacilSemSunne: number; casados: number; leadsPipefacilComTelefone: number } | null;
}) {
  const topo = Math.max(1, contas.subidas);
  const passos = [
    { rotulo: "Contas subidas", valor: contas.subidas, dica: "Negócios criados na Sunne no mês, de qualquer canal", de: null as number | null },
    { rotulo: "Avançaram", valor: contas.avancaram, dica: "Chegaram a Contrato enviado ou além", de: contas.subidas },
    { rotulo: "Validação", valor: contas.validacao, dica: "Contrato assinado: chegou à validação da Sunne", de: contas.avancaram },
  ];
  const desfechos = [
    { rotulo: "Ganho", valor: contas.ganho, classe: "text-success-bright", dica: "Validação concluída: negócio fechado" },
    { rotulo: "Resolvendo pendência", valor: contas.pendencia, classe: "text-warning-bright", dica: "Em validação com pendência aberta ou em reanálise" },
    { rotulo: "Perdido", valor: contas.perdidoAposValidacao, classe: "text-wine-bright", dica: "Perdido depois de chegar à validação" },
  ];
  const outros = contas.emAnalise + contas.aguardando;

  return (
    <section className="rounded-lg border bg-imperium-surface p-4" style={{ borderColor: `rgb(${cor} / 0.45)` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">Contas na Sunne · todos os canais · subidas em {mesLabel}</p>
        <p className="text-[11px] text-stone-500">Estado atual das contas subidas no mês</p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {passos.map((p) => (
          <div key={p.rotulo} title={p.dica}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-stone-300">{p.rotulo}</span>
              {p.de !== null && <span className="text-[11px] text-stone-500">{pct(p.valor, p.de)} do passo anterior</span>}
            </div>
            <p className="mt-0.5 text-2xl font-semibold text-stone-100">{num(p.valor)}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-imperium-raised">
              <div className="h-full rounded-full" style={{ width: `${Math.max(p.valor > 0 ? 2 : 0, (p.valor / topo) * 100)}%`, backgroundColor: `rgb(${cor})` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-imperium-line pt-3">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">Das {num(contas.validacao)} em validação</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {desfechos.map((d) => (
            <div key={d.rotulo} title={d.dica} className="rounded border border-imperium-line/70 bg-imperium-bg/40 p-3">
              <p className="text-xs text-stone-400">{d.rotulo}</p>
              <p className={`mt-0.5 text-2xl font-semibold ${d.classe}`}>{num(d.valor)}</p>
              <p className="text-[11px] text-stone-500">{pct(d.valor, contas.validacao)} das validações</p>
            </div>
          ))}
        </div>
        {outros > 0 && (
          <p className="mt-2 text-[11px] text-stone-500">
            Ainda em análise da Sunne: {num(contas.emAnalise)}
            {contas.aguardando > 0 && <> · aguardando retorno interno: {num(contas.aguardando)}</>}
          </p>
        )}
        {contas.perdidos > contas.perdidoAposValidacao && (
          <p className="mt-1 text-[11px] text-stone-500">
            Perdidas antes da validação: {num(contas.perdidos - contas.perdidoAposValidacao)} · no total das subidas, {num(contas.perdidos)} perdidas.
          </p>
        )}
      </div>

      {contas.porCanal && (
        <div className="mt-4 border-t border-imperium-line pt-3">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Por canal · sem contar a mesma conta duas vezes</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs text-stone-400">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-stone-500">
                  <th className="py-1 text-left font-normal">Canal</th>
                  <th className="py-1 text-right font-normal">Subidas</th>
                  <th className="py-1 text-right font-normal">Avançaram</th>
                  <th className="py-1 text-right font-normal">Validação</th>
                  <th className="py-1 text-right font-normal">Ganho</th>
                  <th className="py-1 text-right font-normal">Pendência</th>
                  <th className="py-1 text-right font-normal">Perdidas</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Recuperação (Pipefácil)", contas.porCanal.pipefacil],
                    ["Plataforma Sunne (outros canais)", contas.porCanal.plataforma],
                  ] as const
                ).map(([nome, c]) => (
                  <tr key={nome} className="border-t border-imperium-line/60">
                    <td className="py-1.5 text-stone-200">{nome}</td>
                    <td className="py-1.5 text-right">{num(c.subidas)}</td>
                    <td className="py-1.5 text-right">{num(c.avancaram)}</td>
                    <td className="py-1.5 text-right">{num(c.validacao)}</td>
                    <td className="py-1.5 text-right text-success-bright">{num(c.ganho)}</td>
                    <td className="py-1.5 text-right text-warning-bright">{num(c.pendencia)}</td>
                    <td className="py-1.5 text-right text-wine-bright">{num(c.perdidos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {consolidado && (
            <p className="mt-2 text-[11px] text-stone-500">
              Vendas consolidadas: <span className="text-stone-100">{num(contas.ganho + consolidado.ganhosPipefacilSemSunne)}</span> ({num(contas.ganho)} fechadas na Sunne +{" "}
              {num(consolidado.ganhosPipefacilSemSunne)} ganhas no Pipefácil sem negócio na Sunne). {num(consolidado.casados)} negócios da Sunne casaram com leads do Pipefácil por nome e telefone.
            </p>
          )}
        </div>
      )}

      {contas.porOrganizacao.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs text-stone-400">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-stone-500">
                <th className="py-1 text-left font-normal">Vendedor</th>
                <th className="py-1 text-right font-normal">Subidas</th>
                <th className="py-1 text-right font-normal">Avançaram</th>
                <th className="py-1 text-right font-normal">Validação</th>
                <th className="py-1 text-right font-normal">Ganho</th>
                <th className="py-1 text-right font-normal">Pendência</th>
                <th className="py-1 text-right font-normal">Perdidas</th>
              </tr>
            </thead>
            <tbody>
              {contas.porOrganizacao.map((o) => (
                <tr key={o.organizationId} className="border-t border-imperium-line/60">
                  <td className="py-1.5 text-stone-200">{o.pessoa ?? o.nome}</td>
                  <td className="py-1.5 text-right">{num(o.subidas)}</td>
                  <td className="py-1.5 text-right">{num(o.avancaram)}</td>
                  <td className="py-1.5 text-right">{num(o.validacao)}</td>
                  <td className="py-1.5 text-right text-success-bright">{num(o.ganho)}</td>
                  <td className="py-1.5 text-right text-warning-bright">{num(o.pendencia)}</td>
                  <td className="py-1.5 text-right text-wine-bright">{num(o.perdidos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
