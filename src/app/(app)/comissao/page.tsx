import { createClient } from "@/lib/supabase/server";
import SimuladorComissao from "./simulador";
import SimuladorVendaRapida from "./simulador-rapido";
import { abrirContestacao } from "./actions";
import { lookupComissao, proximoTier } from "@/lib/comissao";
import { buscarProgressoMarcos } from "@/lib/marcos";
import { getViewerContext } from "@/lib/preview";
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
    .select("rank")
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

  const mesAtual = historico?.find(
    (h) => h.ano === agora.getFullYear() && h.mes === agora.getMonth() + 1
  );

  const inicioMes = agora.toISOString().slice(0, 7) + "-01";
  const { data: vendasMes } = await supabase
    .from("vendas")
    .select("id, data, valor, origem, multiplicador, cliente")
    .eq("profile_id", meId)
    .gte("data", inicioMes)
    .order("data", { ascending: false });

  const producaoRealMes = (vendasMes ?? []).reduce((s, v) => s + Number(v.valor), 0);
  const tiersOrdenados = [...(tiers ?? [])].sort((a, b) => a.producao_min - b.producao_min);
  const tierAtual = lookupComissao(tiersOrdenados, producaoRealMes);
  const proximo = proximoTier(tiersOrdenados, producaoRealMes);

  const { marcos, producaoAno } = await buscarProgressoMarcos(supabase, meId);

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
        {mesAtual ? (
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-stone-500">Produção</p>
              <p className="text-stone-100">{moeda(mesAtual.producao_realizada)}</p>
            </div>
            <div>
              <p className="text-stone-500">Fixo</p>
              <p className="text-stone-100">{moeda(mesAtual.fixo)}</p>
            </div>
            <div>
              <p className="text-stone-500">Variável</p>
              <p className="text-stone-100">{moeda(mesAtual.variavel)}</p>
            </div>
            <div>
              <p className="text-stone-500">Total</p>
              <p className="text-gold-bright">{moeda(mesAtual.total)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-stone-500">
            Ainda sem cálculo fechado pra esse mês — vai aparecer aqui assim que a
            integração com a planilha estiver ligada.
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
          Produção do mês (extrato):{" "}
          <span className="text-gold">{moeda(producaoRealMes)}</span>
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
        right={<span className="text-xs text-stone-500">Produção do ano: {moeda(producaoAno)}</span>}
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
                m.alcancado ? "border-gold" : "border-imperium-line-strong"
              }`}
            >
              <div className={`relative aspect-video ${m.alcancado ? "" : "grayscale"}`}>
                {m.imagemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.imagemUrl} alt={m.nome} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-imperium-bg/60 text-3xl">
                    {m.icone}
                  </div>
                )}
                {!m.alcancado && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-2xl">
                    🔒
                  </span>
                )}
                <span
                  className={`absolute right-2 top-2 rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide ${
                    m.alcancado
                      ? "border-emerald-500/50 bg-imperium-bg/80 text-emerald-400"
                      : "border-imperium-line-strong bg-imperium-bg/80 text-stone-400"
                  }`}
                >
                  {m.alcancado ? "Desbloqueado" : "Bloqueado"}
                </span>
              </div>
              <div className="p-3">
                <p className="text-sm text-stone-100">{m.nome}</p>
                <p className="text-xs text-stone-500">
                  Marco de {moeda(m.threshold)}
                  {!m.alcancado && ` · faltam ${moeda(m.falta)}`}
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
                  <td className="py-1 text-right text-stone-100">{moeda(Number(v.valor))}</td>
                  <td className="py-1 text-right text-stone-400">×{v.multiplicador}</td>
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
