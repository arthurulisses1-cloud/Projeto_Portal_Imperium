import { createClient } from "@/lib/supabase/server";
import SimuladorComissao from "./simulador";
import SimuladorVendaRapida from "./simulador-rapido";
import { abrirContestacao } from "./actions";
import { lookupComissao, proximoTier } from "@/lib/comissao";
import { buscarProgressoMarcos } from "@/lib/marcos";
import { getViewerContext } from "@/lib/preview";
import { RANK_SDR_EQUIVALENTE, type Rank } from "@/lib/carreira";
import { RANK_LABELS } from "@/lib/labels";
import Card from "@/components/ui/Card";

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<string, string> = { aberto: "Aberta", resolvido: "Resolvida" };

export default async function ComissaoPage() {
  const supabase = await createClient();
  const viewer = await getViewerContext(supabase);
  if (!viewer) return null;
  const meId = viewer.effectiveId;

  const { data: profile } = await supabase
    .from("profiles")
    .select("rank, role")
    .eq("id", meId)
    .single();

  const { data: tiers } = await supabase
    .from("commission_tiers")
    .select("producao_min, fixo, pct_variavel")
    .eq("rank", profile?.rank ?? "legionario")
    .order("ordem");

  const agora = new Date();
  const { data: historico } = await supabase
    .from("comissao_mensal")
    .select("ano, mes, producao_realizada, fixo, variavel, total")
    .eq("profile_id", meId)
    .order("ano", { ascending: false })
    .order("mes", { ascending: false })
    .limit(6);


  const inicioMes = agora.toISOString().slice(0, 7) + "-01";

  // Líder (rank "legado") não fecha venda pessoal na maior parte do tempo —
  // os limiares da tabela de comissão dele (600K–2,5M) são sobre a PRODUÇÃO
  // DO EXÉRCITO INTEIRO no mês, não a produção pessoal. Usando só `vendas`
  // dele (quase sempre zero), a Comissão do Mês aparecia zerada mesmo com o
  // Exército inteiro produzindo.
  let vendasMes: { id: string; data: string; valor: number; origem: string | null; multiplicador: number | null; cliente: string | null; papel: string | null }[] = [];
  if (profile?.role === "lider") {
    const { data: exercitoLiderado } = await supabase.from("exercitos").select("id").eq("legado_id", meId).maybeSingle();
    if (exercitoLiderado) {
      const { data: opsPagas } = await supabase
        .from("weekly_operacoes")
        .select("id, data, valor, origem, cliente, sdr_profile_id, closer_profile_id")
        .eq("status", "PAGO")
        .gte("data", inicioMes);

      // Time DONO da operação = time do Closer, fallback pro SDR só quando o
      // Closer não resolve time nenhum — precisa resolver TODO MUNDO
      // envolvido (não só quem já é dessa Tribo), senão uma operação cujo
      // Closer é de outro Exército "vaza" pra cá pelo lado do SDR. Inclui o
      // fallback de Legado-sem-tribo_id (mesma regra de forecast/page.tsx).
      const idsEnvolvidos = Array.from(
        new Set((opsPagas ?? []).flatMap((o) => [o.sdr_profile_id, o.closer_profile_id]).filter((x): x is string => !!x))
      );
      const [{ data: pessoas }, { data: exercitos }] = await Promise.all([
        idsEnvolvidos.length > 0
          ? supabase.from("profiles").select("id, tribo:tribos!profiles_tribo_id_fkey(exercito_id)").in("id", idsEnvolvidos)
          : Promise.resolve({ data: [] }),
        supabase.from("exercitos").select("id, legado_id"),
      ]);
      const exercitoIdPorLegadoId = new Map((exercitos ?? []).map((e) => [e.legado_id, e.id]));
      const exercitoPorProfileId = new Map(
        (pessoas ?? []).map((p) => [
          p.id,
          (p.tribo as unknown as { exercito_id: string } | null)?.exercito_id ?? exercitoIdPorLegadoId.get(p.id) ?? null,
        ])
      );

      vendasMes = (opsPagas ?? [])
        .filter((o) => {
          const timeDaOperacao =
            (o.closer_profile_id && exercitoPorProfileId.get(o.closer_profile_id)) ||
            (o.sdr_profile_id && exercitoPorProfileId.get(o.sdr_profile_id));
          return timeDaOperacao === exercitoLiderado.id;
        })
        .map((o) => ({ id: o.id, data: o.data, valor: Number(o.valor), origem: o.origem, multiplicador: null, cliente: o.cliente, papel: null }));
    }
  } else {
    const { data } = await supabase
      .from("vendas")
      .select("id, data, valor, origem, multiplicador, cliente, papel")
      .eq("profile_id", meId)
      .gte("data", inicioMes)
      .order("data", { ascending: false });
    vendasMes = data ?? [];
  }

  const producaoRealMes = vendasMes.reduce((s, v) => s + Number(v.valor), 0);
  const tiersOrdenados = [...(tiers ?? [])].sort((a, b) => a.producao_min - b.producao_min);

  // Closer que também vende como SDR: essa produção NÃO conta pro tier de
  // Closer (que só sobe com produção COMO closer) — é uma comissão à parte,
  // pela tabela do cargo de SDR equivalente ("Jr" com "Jr", "Sr" com "Sr").
  // "ambos" (fechou sozinho, sem SDR envolvido) conta nos dois lados: fez o
  // trabalho dos dois papéis nessa venda.
  const rankAtual = profile?.rank as Rank | undefined;
  const rankSdrEquivalente = rankAtual ? RANK_SDR_EQUIVALENTE[rankAtual] : undefined;

  const producaoComoCloser = rankSdrEquivalente
    ? vendasMes.filter((v) => v.papel === "closer" || v.papel === "ambos").reduce((s, v) => s + Number(v.valor), 0)
    : producaoRealMes;
  const producaoComoSdr = rankSdrEquivalente
    ? vendasMes.filter((v) => v.papel === "sdr" || v.papel === "ambos").reduce((s, v) => s + Number(v.valor), 0)
    : 0;

  const { data: tiersSdrEquivalente } = rankSdrEquivalente
    ? await supabase.from("commission_tiers").select("producao_min, fixo, pct_variavel").eq("rank", rankSdrEquivalente).order("ordem")
    : { data: null };
  const tiersSdrOrdenados = [...(tiersSdrEquivalente ?? [])].sort((a, b) => a.producao_min - b.producao_min);

  const tierAtual = lookupComissao(tiersOrdenados, producaoComoCloser);
  const proximo = proximoTier(tiersOrdenados, producaoComoCloser);
  const comissaoSdr = rankSdrEquivalente && producaoComoSdr > 0 ? lookupComissao(tiersSdrOrdenados, producaoComoSdr) : null;
  const comissaoTotalMes = (tierAtual?.total ?? 0) + (comissaoSdr?.total ?? 0);

  const { marcos } = await buscarProgressoMarcos(supabase, meId);

  const { data: contestacoes } = await supabase
    .from("contestacoes")
    .select("id, referencia, valor_contestado, motivo, status, resposta, created_at")
    .eq("profile_id", meId)
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Comissão do Mês</h1>
        <p className="text-xs text-stone-400">Visão privada — só você e o Diretor veem isso</p>
      </div>

      <section className="card-imp">
        <h2 className="kicker mb-4">Mês atual</h2>
        {tierAtual ? (
          <>
            {comissaoSdr && (
              <p className="mb-3 text-xs uppercase tracking-wide text-stone-500">
                Comissão como {RANK_LABELS[profile?.rank ?? ""] ?? "Closer"}
              </p>
            )}
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-stone-500">Produção</p>
                <p className="text-stone-100">{moeda(comissaoSdr ? producaoComoCloser : producaoRealMes)}</p>
              </div>
              <div>
                <p className="text-stone-500">Fixo</p>
                <p className="text-stone-100">{moeda(tierAtual.fixo)}</p>
              </div>
              <div>
                <p className="text-stone-500">Variável</p>
                <p className="text-stone-100">{moeda(tierAtual.variavel)}</p>
              </div>
              <div>
                <p className="text-stone-500">Total</p>
                <p className="text-gold-bright">{moeda(tierAtual.total)}</p>
              </div>
            </div>

            {comissaoSdr && (
              <>
                <p className="mb-3 mt-5 text-xs uppercase tracking-wide text-stone-500">
                  + Comissão como {RANK_LABELS[RANK_SDR_EQUIVALENTE[profile?.rank as Rank] ?? ""] ?? "SDR"}
                  <span className="ml-1 normal-case text-stone-600">(vendas fechadas sozinho, no papel de SDR)</span>
                </p>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-stone-500">Produção</p>
                    <p className="text-stone-100">{moeda(producaoComoSdr)}</p>
                  </div>
                  <div>
                    <p className="text-stone-500">Fixo</p>
                    <p className="text-stone-100">{moeda(comissaoSdr.fixo)}</p>
                  </div>
                  <div>
                    <p className="text-stone-500">Variável</p>
                    <p className="text-stone-100">{moeda(comissaoSdr.variavel)}</p>
                  </div>
                  <div>
                    <p className="text-stone-500">Total</p>
                    <p className="text-gold-bright">{moeda(comissaoSdr.total)}</p>
                  </div>
                </div>
                <p className="mt-4 border-t border-imperium-line pt-3 text-sm text-stone-300">
                  Remuneração total do mês: <span className="text-lg text-gold-bright">{moeda(comissaoTotalMes)}</span>
                </p>
              </>
            )}
          </>
        ) : (
          <p className="text-sm text-stone-500">
            Nenhuma faixa de comissão cadastrada pro seu cargo ainda — fale com o Diretor.
          </p>
        )}

        {historico && historico.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-xs uppercase tracking-wide text-stone-500">
              Comparativo com meses anteriores
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-500">
                  <th className="pb-1">Mês</th>
                  <th className="pb-1 text-right">Produção</th>
                  <th className="pb-1 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={`${h.ano}-${h.mes}`} className="border-t border-imperium-line">
                    <td className="py-1 text-stone-300">
                      {MESES[h.mes - 1]}/{h.ano}
                    </td>
                    <td className="py-1 text-right text-stone-400">
                      {moeda(h.producao_realizada)}
                    </td>
                    <td className="py-1 text-right text-stone-100">{moeda(h.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Card title="Tabela de comissão do seu cargo">
        <p className="mb-4 text-sm text-stone-300">
          {comissaoSdr ? "Produção como Closer (o que conta pro seu tier)" : "Produção do mês (extrato)"}:{" "}
          <span className="text-gold">{moeda(comissaoSdr ? producaoComoCloser : producaoRealMes)}</span>
          {rankSdrEquivalente && producaoComoSdr > 0 && (
            <span className="ml-1 text-stone-500">
              (+ {moeda(producaoComoSdr)} como SDR, não conta aqui — só na comissão à parte acima)
            </span>
          )}
          {proximo && (
            <>
              {" "}
              — faltam <span className="text-gold-bright">{moeda(proximo.faltaProducao)}</span>{" "}
              pro próximo tier (+{moeda(proximo.ganhoTotal)} na comissão total).
            </>
          )}
          {!proximo && tierAtual && (
            <span className="ml-1 text-emerald-400">Você já está no tier máximo.</span>
          )}
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="pb-2">Produção mín.</th>
              <th className="pb-2 text-right">Fixo</th>
              <th className="pb-2 text-right">% Variável</th>
              <th className="pb-2 text-right">Total no limiar</th>
            </tr>
          </thead>
          <tbody>
            {tiersOrdenados.map((t, i) => {
              const ativo = tierAtual?.tierIdx === i;
              const totalLimiar = t.fixo + Math.round((t.pct_variavel / 100) * t.producao_min);
              return (
                <tr
                  key={t.producao_min}
                  className={`border-t border-imperium-line ${ativo ? "bg-gold/10" : ""}`}
                >
                  <td className={`py-2 ${ativo ? "text-gold-bright" : "text-stone-300"}`}>
                    {moeda(t.producao_min)} {ativo && "← você está aqui"}
                  </td>
                  <td className="py-2 text-right text-stone-100">{moeda(t.fixo)}</td>
                  <td className="py-2 text-right text-stone-400">{t.pct_variavel}%</td>
                  <td className="py-2 text-right text-stone-100">{moeda(totalLimiar)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-4">
          <SimuladorVendaRapida tiers={tiersOrdenados} producaoAtual={producaoRealMes} />
        </div>
      </Card>

      <Card
        title="Sistema de Marcos"
        right={<span className="text-xs text-stone-500">Produção do mês: {moeda(producaoRealMes)}</span>}
      >
        {marcos.length === 0 && (
          <p className="text-sm text-stone-500">
            Nenhum marco cadastrado ainda — peça ao Diretor pra rodar a migração de Sistema de
            Marcos.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {marcos.map((m) => (
            <div
              key={m.id}
              className={`overflow-hidden rounded-lg border ${
                m.alcancado ? "border-gold" : m.elegivel ? "border-gold/50 border-dashed" : "border-imperium-line-strong"
              }`}
            >
              <div className={`relative aspect-video ${m.alcancado || m.elegivel ? "" : "grayscale"}`}>
                {m.imagemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.imagemUrl} alt={m.nome} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-imperium-bg/60 text-3xl">
                    {m.icone}
                  </div>
                )}
                {!m.alcancado && !m.elegivel && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-2xl">
                    🔒
                  </span>
                )}
                <span
                  className={`absolute right-2 top-2 rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide ${
                    m.alcancado
                      ? "border-emerald-500/50 bg-imperium-bg/80 text-emerald-400"
                      : m.elegivel
                        ? "border-gold/50 bg-imperium-bg/80 text-gold"
                        : "border-imperium-line-strong bg-imperium-bg/80 text-stone-400"
                  }`}
                >
                  {m.alcancado ? "Desbloqueado" : m.elegivel ? "Disponível este mês" : "Bloqueado"}
                </span>
              </div>
              <div className="p-3">
                <p className="text-sm text-stone-100">{m.nome}</p>
                <p className="text-xs text-stone-500">
                  Marco de {moeda(m.threshold)}
                  {!m.alcancado && !m.elegivel && ` · faltam ${moeda(m.falta)}`}
                  {m.elegivel && " · fale com o Diretor pra confirmar o resgate"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <SimuladorComissao tiers={tiers ?? []} />

      <section className="card-imp">
        <h2 className="kicker mb-4">Extrato do mês</h2>
        {vendasMes && vendasMes.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500">
                <th className="pb-1">Data</th>
                <th className="pb-1">Cliente</th>
                <th className="pb-1">Origem</th>
                {rankSdrEquivalente && <th className="pb-1">Papel</th>}
                <th className="pb-1 text-right">Valor</th>
                <th className="pb-1 text-right">Multiplicador</th>
              </tr>
            </thead>
            <tbody>
              {vendasMes.map((v) => (
                <tr key={v.id} className="border-t border-imperium-line">
                  <td className="py-1 text-stone-300">
                    {new Date(v.data + "T00:00:00").toLocaleDateString("pt-BR")}
                  </td>
                  <td className="py-1 text-stone-300">{v.cliente ?? "—"}</td>
                  <td className="py-1 text-stone-400">{v.origem ?? "—"}</td>
                  {rankSdrEquivalente && (
                    <td className="py-1 text-stone-400">
                      {v.papel === "sdr" ? "SDR" : v.papel === "ambos" ? "Ambos" : "Closer"}
                    </td>
                  )}
                  <td className="py-1 text-right text-stone-100">{moeda(Number(v.valor))}</td>
                  <td className="py-1 text-right text-stone-400">{v.multiplicador != null ? `×${v.multiplicador}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-stone-500">Nenhuma venda registrada neste mês ainda.</p>
        )}
      </section>

      <section className="card-imp">
        <h2 className="kicker mb-4">Contestação</h2>

        <form action={abrirContestacao} className="mb-6 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-stone-400">Referência (opcional)</label>
              <input name="referencia" placeholder="Ex: Venda #4471" className="input-imp" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-400">
                Valor contestado (opcional)
              </label>
              <input name="valor_contestado" type="number" step="0.01" className="input-imp" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-400">Motivo</label>
            <textarea name="motivo" required rows={2} className="input-imp" />
          </div>
          <button type="submit" className="btn-gold">
            Abrir contestação
          </button>
        </form>

        {contestacoes && contestacoes.length > 0 && (
          <ul className="space-y-2">
            {contestacoes.map((c) => (
              <li key={c.id} className="border-t border-imperium-line pt-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-stone-300">{c.referencia ?? "Sem referência"}</span>
                  <span className={c.status === "aberto" ? "text-gold" : "text-emerald-400"}>
                    {STATUS_LABELS[c.status]}
                  </span>
                </div>
                <p className="text-xs text-stone-500">{c.motivo}</p>
                {c.resposta && (
                  <p className="mt-1 text-xs text-stone-400">Resposta: {c.resposta}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
