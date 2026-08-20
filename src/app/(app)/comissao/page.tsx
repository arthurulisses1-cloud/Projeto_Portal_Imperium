import { createClient } from "@/lib/supabase/server";
import SimuladorComissao from "./simulador";
import SimuladorVendaRapida from "./simulador-rapido";
import { abrirContestacao } from "./actions";
import { proximoTier } from "@/lib/comissao";
import { buscarRemuneracaoMes } from "@/lib/remuneracao";
import { buscarProgressoMarcos } from "@/lib/marcos";
import { getViewerContext } from "@/lib/preview";
import { PAPEL_PRINCIPAL, type Rank } from "@/lib/carreira";
import { RANK_LABELS } from "@/lib/labels";
import { logErroSupabase } from "@/lib/log-erro-supabase";
import Card from "@/components/ui/Card";

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

const PAPEL_LABEL: Record<string, string> = {
  sdr: "SDR",
  closer: "Closer",
  ambos: "Sozinho (SDR+Closer)",
  gestao: "Gestão",
  time: "Time (gestão)",
};

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<string, string> = { aberto: "Aberta", resolvido: "Resolvida" };

export default async function ComissaoPage() {
  const supabase = await createClient();
  const viewer = await getViewerContext(supabase);
  if (!viewer) return null;
  const meId = viewer.effectiveId;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("rank, role")
    .eq("id", meId)
    .single();
  logErroSupabase(`ComissaoPage: profiles (id=${meId})`, profileError);

  const rank = (profile?.rank ?? "legionario") as Rank | "diretor";
  const role = profile?.role ?? "sdr";
  const papelPrincipal = PAPEL_PRINCIPAL[rank] ?? "sdr";
  const rankLabel = RANK_LABELS[rank] ?? rank;

  const agora = new Date();
  const inicioMes = agora.toISOString().slice(0, 7) + "-01";

  const { remuneracao, tiers, extrato, producaoPrincipal, producaoTotal } = await buscarRemuneracaoMes(
    supabase,
    meId,
    role,
    rank,
    inicioMes
  );

  const proximo = remuneracao ? proximoTier(tiers, producaoPrincipal, papelPrincipal) : null;

  const { data: historico } = await supabase
    .from("comissao_mensal")
    .select("ano, mes, producao_realizada, fixo, variavel, total")
    .eq("profile_id", meId)
    .order("ano", { ascending: false })
    .order("mes", { ascending: false })
    .limit(6);

  const { marcos } = await buscarProgressoMarcos(supabase, meId);

  const { data: contestacoes } = await supabase
    .from("contestacoes")
    .select("id, referencia, valor_contestado, motivo, status, resposta, created_at")
    .eq("profile_id", meId)
    .order("created_at", { ascending: false });

  const parcelas: { chave: "sdr" | "closer" | "gestao"; titulo: string }[] = [
    { chave: "sdr", titulo: "Comissão como SDR" },
    { chave: "closer", titulo: "Comissão como Closer" },
    { chave: "gestao", titulo: role === "diretor" ? "Comissão de Gestão (firma)" : "Comissão de Gestão (time)" },
  ];

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Comissão do Mês</h1>
        <p className="text-xs text-stone-400">Visão privada — só você e o Diretor veem isso</p>
      </div>

      <section className="card-imp">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="kicker">Mês atual</h2>
          {remuneracao && (
            <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-gold-bright">
              {rankLabel} · Tier {remuneracao.tierIdx + 1} de {tiers.length}
            </span>
          )}
        </div>

        {remuneracao ? (
          <>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-imperium-line pb-4">
              <div>
                <p className="text-xs text-stone-500">Produção total do mês</p>
                <p className="text-lg text-stone-100">{moeda(producaoTotal)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-stone-500">Remuneração total do mês</p>
                <p className="text-2xl text-gold-bright">{moeda(remuneracao.total)}</p>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded border border-imperium-line bg-imperium-bg/40 p-3">
                <p className="text-[11px] uppercase tracking-wide text-stone-500">Fixo</p>
                <p className="text-sm text-stone-100">{moeda(remuneracao.fixo)}</p>
              </div>
              {parcelas.map((p) => {
                const parcela = remuneracao[p.chave];
                return (
                  <div
                    key={p.chave}
                    className={`rounded border p-3 ${
                      parcela.producao > 0 ? "border-gold/30 bg-gold/5" : "border-imperium-line bg-imperium-bg/40"
                    }`}
                  >
                    <p className="text-[11px] uppercase tracking-wide text-stone-500">{p.titulo}</p>
                    <p className="text-sm text-stone-100">{moeda(parcela.variavel)}</p>
                    <p className="text-[11px] text-stone-600">
                      {parcela.pct}% de {moeda(parcela.producao)}
                    </p>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-stone-500">
              Tier definido pela produção como {PAPEL_LABEL[papelPrincipal] ?? papelPrincipal}:{" "}
              <span className="text-gold">{moeda(producaoPrincipal)}</span>
              {proximo && (
                <>
                  {" "}
                  — faltam <span className="text-gold-bright">{moeda(proximo.faltaProducao)}</span> pro
                  próximo tier (+{moeda(proximo.ganhoTotal)} na comissão total).
                </>
              )}
              {!proximo && <span className="ml-1 text-emerald-400">Você já está no tier máximo.</span>}
            </p>
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

      <Card title={`Tabela de comissão · ${rankLabel}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="pb-2">Produção mín.</th>
              <th className="pb-2 text-right">Fixo</th>
              <th className="pb-2 text-right">% SDR</th>
              <th className="pb-2 text-right">% Closer</th>
              <th className="pb-2 text-right">% Gestão</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t, i) => {
              const ativo = remuneracao?.tierIdx === i;
              return (
                <tr
                  key={t.producao_min}
                  className={`border-t border-imperium-line ${ativo ? "bg-gold/10" : ""}`}
                >
                  <td className={`py-2 ${ativo ? "text-gold-bright" : "text-stone-300"}`}>
                    {moeda(t.producao_min)} {ativo && "← você está aqui"}
                  </td>
                  <td className="py-2 text-right text-stone-100">{moeda(t.fixo)}</td>
                  <td className={`py-2 text-right ${papelPrincipal === "sdr" ? "text-gold" : "text-stone-500"}`}>
                    {t.pct_sdr}%
                  </td>
                  <td className={`py-2 text-right ${papelPrincipal === "closer" ? "text-gold" : "text-stone-500"}`}>
                    {t.pct_closer}%
                  </td>
                  <td className={`py-2 text-right ${papelPrincipal === "gestao" ? "text-gold" : "text-stone-500"}`}>
                    {t.pct_gestao}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-stone-600">
          Coluna destacada em dourado = papel principal do seu cargo (define o tier). As outras duas
          rendem comissão à parte sempre que você atua nesse papel numa venda, sem mudar seu tier.
        </p>

        {papelPrincipal !== "gestao" && (
          <div className="mt-4">
            <SimuladorVendaRapida tiers={tiers} producaoAtual={producaoPrincipal} papel={papelPrincipal} />
          </div>
        )}
      </Card>

      <Card
        title="Sistema de Marcos"
        right={<span className="text-xs text-stone-500">Produção do mês: {moeda(producaoTotal)}</span>}
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

      {papelPrincipal !== "gestao" && <SimuladorComissao tiers={tiers} papel={papelPrincipal} />}

      <section className="card-imp">
        <h2 className="kicker mb-4">
          Extrato do mês {role === "lider" || role === "diretor" ? "(operações do time)" : ""}
        </h2>
        {extrato.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-500">
                  <th className="px-2 pb-2">Data</th>
                  <th className="px-2 pb-2">Cliente</th>
                  <th className="px-2 pb-2">SDR</th>
                  <th className="px-2 pb-2">Closer</th>
                  <th className="px-2 pb-2">Origem</th>
                  <th className="px-2 pb-2">Papel</th>
                  <th className="px-2 pb-2 text-right">Crédito</th>
                  <th className="px-2 pb-2 text-right">%</th>
                  <th className="px-2 pb-2 text-right">Comissão</th>
                  <th className="px-2 pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {extrato.map((v) => {
                  const tierAtivo = remuneracao ? tiers[remuneracao.tierIdx] : null;
                  const pctAplicado =
                    v.papel === "sdr"
                      ? tierAtivo?.pct_sdr
                      : v.papel === "closer"
                        ? tierAtivo?.pct_closer
                        : v.papel === "time"
                          ? tierAtivo?.pct_gestao
                          : v.papel === "ambos"
                            ? Math.max(tierAtivo?.pct_sdr ?? 0, tierAtivo?.pct_closer ?? 0)
                            : undefined;
                  const comissaoVenda = pctAplicado !== undefined ? Math.round((pctAplicado / 100) * v.valor) : null;
                  return (
                    <tr key={v.id} className="border-t border-imperium-line align-top">
                      <td className="px-2 py-2.5 whitespace-nowrap text-stone-300">
                        {new Date(v.data + "T00:00:00").toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-2 py-2.5 text-stone-300">{v.cliente ?? "—"}</td>
                      <td className="px-2 py-2.5 text-stone-400">{v.sdrNome ?? "—"}</td>
                      <td className="px-2 py-2.5 text-stone-400">{v.closerNome ?? "—"}</td>
                      <td className="px-2 py-2.5 text-stone-400">{v.origem ?? "—"}</td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-stone-400">{PAPEL_LABEL[v.papel] ?? v.papel}</td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-right text-stone-100">{moeda(v.valor)}</td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-right text-stone-500">
                        {pctAplicado !== undefined ? `${pctAplicado}%` : "—"}
                      </td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-right text-gold-bright">
                        {comissaoVenda !== null ? moeda(comissaoVenda) : "—"}
                      </td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-right">
                        <a
                          href={`#contestar`}
                          className="text-[11px] text-stone-600 hover:text-gold hover:underline"
                          title="Contestar essa venda"
                        >
                          Contestar
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-stone-500">Nenhuma venda registrada neste mês ainda.</p>
        )}
      </section>

      <section id="contestar" className="card-imp scroll-mt-20">
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
