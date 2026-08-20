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
import { Table, Th, Td, Tr } from "@/components/ui/Table";

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
              {!proximo && <span className="ml-1 text-success-bright">Você já está no tier máximo.</span>}
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
            <Table>
              <thead>
                <tr>
                  <Th>Mês</Th>
                  <Th align="right">Produção</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <Tr key={`${h.ano}-${h.mes}`}>
                    <Td className="text-stone-300">
                      {MESES[h.mes - 1]}/{h.ano}
                    </Td>
                    <Td align="right" className="text-stone-400">
                      {moeda(h.producao_realizada)}
                    </Td>
                    <Td align="right" className="text-stone-100">{moeda(h.total)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </section>

      {/* Tabela de tier, simuladores e marcos: consulta ocasional, não o que
          se checa todo dia — colapsados por padrão pra não competir de
          igual pra igual com "Mês atual"/"Extrato", que são o que importa
          na maioria das visitas. */}
      <details className="card-imp group">
        <summary className="kicker flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
          <span>Tabela de comissão · {rankLabel} e simuladores</span>
          <span className="text-[10px] normal-case text-stone-500 transition group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-4">
          <Table>
            <thead>
              <tr>
                <Th>Produção mín.</Th>
                <Th align="right">Fixo</Th>
                <Th align="right">% SDR</Th>
                <Th align="right">% Closer</Th>
                <Th align="right">% Gestão</Th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((t, i) => {
                const ativo = remuneracao?.tierIdx === i;
                return (
                  <Tr key={t.producao_min} active={ativo}>
                    <Td className={ativo ? "text-gold-bright" : "text-stone-300"}>
                      {moeda(t.producao_min)} {ativo && "← você está aqui"}
                    </Td>
                    <Td align="right" className="text-stone-100">{moeda(t.fixo)}</Td>
                    <Td align="right" className={papelPrincipal === "sdr" ? "text-gold" : "text-stone-500"}>
                      {t.pct_sdr}%
                    </Td>
                    <Td align="right" className={papelPrincipal === "closer" ? "text-gold" : "text-stone-500"}>
                      {t.pct_closer}%
                    </Td>
                    <Td align="right" className={papelPrincipal === "gestao" ? "text-gold" : "text-stone-500"}>
                      {t.pct_gestao}%
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          <p className="mt-2 text-[11px] text-stone-600">
            Coluna destacada em dourado = papel principal do seu cargo (define o tier). As outras duas
            rendem comissão à parte sempre que você atua nesse papel numa venda, sem mudar seu tier.
          </p>

          {papelPrincipal !== "gestao" && (
            <>
              <div className="mt-4">
                <SimuladorVendaRapida tiers={tiers} producaoAtual={producaoPrincipal} papel={papelPrincipal} />
              </div>
              <div className="mt-4">
                <SimuladorComissao tiers={tiers} papel={papelPrincipal} />
              </div>
            </>
          )}
        </div>
      </details>

      <details className="card-imp group">
        <summary className="kicker flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
          <span>Sistema de Marcos</span>
          <span className="text-[10px] normal-case text-stone-500 transition group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-4">
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
                        ? "border-success/50 bg-imperium-bg/80 text-success-bright"
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
        </div>
      </details>

      <section className="card-imp">
        <h2 className="kicker mb-4">
          Extrato do mês {role === "lider" || role === "diretor" ? "(operações do time)" : ""}
        </h2>
        {extrato.length > 0 ? (
          <Table minWidth="min-w-[820px]">
            <thead>
              <tr>
                <Th className="px-2">Data</Th>
                <Th className="px-2">Cliente</Th>
                <Th className="px-2">SDR</Th>
                <Th className="px-2">Closer</Th>
                <Th className="px-2">Origem</Th>
                <Th className="px-2">Papel</Th>
                <Th align="right" className="px-2">Crédito</Th>
                <Th align="right" className="px-2">%</Th>
                <Th align="right" className="px-2">Comissão</Th>
                <Th className="px-2"></Th>
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
                  <Tr key={v.id} className="align-top">
                    <Td className="px-2 whitespace-nowrap text-stone-300">
                      {new Date(v.data + "T00:00:00").toLocaleDateString("pt-BR")}
                    </Td>
                    <Td className="px-2 text-stone-300">{v.cliente ?? "—"}</Td>
                    <Td className="px-2 text-stone-400">{v.sdrNome ?? "—"}</Td>
                    <Td className="px-2 text-stone-400">{v.closerNome ?? "—"}</Td>
                    <Td className="px-2 text-stone-400">{v.origem ?? "—"}</Td>
                    <Td className="px-2 whitespace-nowrap text-stone-400">{PAPEL_LABEL[v.papel] ?? v.papel}</Td>
                    <Td align="right" className="px-2 whitespace-nowrap text-stone-100">{moeda(v.valor)}</Td>
                    <Td align="right" className="px-2 whitespace-nowrap text-stone-500">
                      {pctAplicado !== undefined ? `${pctAplicado}%` : "—"}
                    </Td>
                    <Td align="right" className="px-2 whitespace-nowrap text-gold-bright">
                      {comissaoVenda !== null ? moeda(comissaoVenda) : "—"}
                    </Td>
                    <Td align="right" className="px-2 whitespace-nowrap">
                      <a
                        href={`#contestar`}
                        className="text-[11px] text-stone-600 hover:text-gold hover:underline"
                        title="Contestar essa venda"
                      >
                        Contestar
                      </a>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-stone-500">Nenhuma venda registrada neste mês ainda.</p>
        )}
      </section>

      <details id="contestar" className="card-imp scroll-mt-20 group">
        <summary className="kicker flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
          <span>Contestação{contestacoes && contestacoes.length > 0 ? ` (${contestacoes.length})` : ""}</span>
          <span className="text-[10px] normal-case text-stone-500 transition group-open:rotate-180">▾</span>
        </summary>

        <form action={abrirContestacao} className="mb-6 mt-4 space-y-3">
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
                  <span className={c.status === "aberto" ? "text-gold" : "text-success-bright"}>
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
      </details>
    </main>
  );
}
