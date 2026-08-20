import { createClient } from "@/lib/supabase/server";
import { STAR_PACE, inicioSemanaISO, resultadoSemanaEstrela, type Rank } from "@/lib/carreira";
import { RANK_LABELS } from "@/lib/labels";
import Card from "@/components/ui/Card";
import { getViewerContext } from "@/lib/preview";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default async function EstrelasPage() {
  const supabase = await createClient();
  const viewer = await getViewerContext(supabase);
  if (!viewer) return null;
  const meId = viewer.effectiveId;
  const meRole = viewer.effectiveRole;

  if (meRole !== "sdr" && meRole !== "closer") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-xl text-gold-bright">Acesso restrito</h1>
        <p className="mt-2 text-sm text-stone-400">Estrelas é uma visão de SDRs e Closers.</p>
      </main>
    );
  }

  const { data: profile } = await supabase.from("profiles").select("full_name, rank, stars_total").eq("id", meId).single();
  if (!profile) return null;
  const rank = profile.rank as Rank;
  const pace = STAR_PACE[rank] ?? STAR_PACE.legionario;

  // Pago vira estrela pelo PAPEL que a pessoa teve na venda (SDR conta o que
  // fechou como SDR ou "ambos"; Closer o que fechou como Closer ou "ambos") —
  // mesma regra usada no resto do sistema pra separar produção por papel.
  const dozeSemanasAtras = new Date();
  dozeSemanasAtras.setDate(dozeSemanasAtras.getDate() - 84);
  const { data: vendas } = await supabase
    .from("vendas")
    .select("data, valor, papel")
    .eq("profile_id", meId)
    .in("papel", meRole === "sdr" ? ["sdr", "ambos"] : ["closer", "ambos"])
    .gte("data", dozeSemanasAtras.toISOString().slice(0, 10))
    .order("data", { ascending: false });

  const porSemana = new Map<string, { qtd: number; valor: number }>();
  for (const v of vendas ?? []) {
    const semana = inicioSemanaISO(v.data);
    const bucket = porSemana.get(semana) ?? { qtd: 0, valor: 0 };
    bucket.qtd += 1;
    bucket.valor += Number(v.valor);
    porSemana.set(semana, bucket);
  }

  const semanaAtualInicio = inicioSemanaISO(new Date().toISOString().slice(0, 10));

  // Sempre lista as últimas 12 semanas, mesmo as sem nenhum pago (pra ficar
  // óbvio quando alguém ficou 2-3 semanas sem gerar nada).
  const semanas: { inicio: string; qtd: number; valor: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(semanaAtualInicio + "T12:00:00");
    d.setDate(d.getDate() - i * 7);
    const inicio = d.toISOString().slice(0, 10);
    const bucket = porSemana.get(inicio) ?? { qtd: 0, valor: 0 };
    semanas.push({ inicio, ...bucket });
  }

  const resultadoSemana = (qtd: number) => resultadoSemanaEstrela(qtd, pace);

  const semanaAtual = semanas[0];
  const resultadoAtual = resultadoSemana(semanaAtual.qtd);
  const faltamParaCheia = Math.max(0, pace.cheia - semanaAtual.qtd);
  const faltamParaMeia = Math.max(0, pace.meia - semanaAtual.qtd);

  const totalCheias = semanas.filter((s) => resultadoSemana(s.qtd).icone === "★").length;
  const totalMeias = semanas.filter((s) => resultadoSemana(s.qtd).icone === "☆").length;
  const totalZeradas = semanas.filter((s) => s.qtd === 0).length;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Estrelas</h1>
        <p className="kicker mt-1">
          {RANK_LABELS[rank] ?? rank}
          {pace.cheia > 0
            ? ` · ${pace.meia} pagos na semana = ½★ · ${pace.cheia} pagos = ★`
            : " · seu cargo ainda não participa do sistema de estrelas"}
        </p>
      </div>

      <Card title="Semana atual" right={<span className="text-xs text-stone-500">{profile.stars_total} estrelas confirmadas ao todo</span>}>
        <div className="flex items-center gap-4">
          <span className={`font-display text-4xl ${resultadoAtual.cor}`}>{resultadoAtual.icone}</span>
          <div>
            <p className={`text-sm ${resultadoAtual.cor}`}>{resultadoAtual.label}</p>
            <p className="text-xs text-stone-500">
              {semanaAtual.qtd} pago{semanaAtual.qtd === 1 ? "" : "s"} essa semana ({moeda(semanaAtual.valor)})
            </p>
          </div>
        </div>
        {pace.cheia > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-stone-500">
              <span>Progresso pra estrela cheia</span>
              <span>
                {semanaAtual.qtd}/{pace.cheia}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-imperium-line">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gold to-gold-bright"
                style={{ width: `${Math.min(100, (semanaAtual.qtd / pace.cheia) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-stone-600">
              {faltamParaCheia === 0
                ? "Estrela cheia garantida essa semana."
                : faltamParaMeia === 0
                  ? `Meia estrela garantida — faltam ${faltamParaCheia} pago${faltamParaCheia === 1 ? "" : "s"} pra virar cheia.`
                  : `Faltam ${faltamParaMeia} pago${faltamParaMeia === 1 ? "" : "s"} pra meia estrela, ${faltamParaCheia} pra cheia.`}
            </p>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <p className="kicker mb-1">Cheias (12 sem.)</p>
          <p className="font-display text-2xl text-gold-bright">★ {totalCheias}</p>
        </Card>
        <Card>
          <p className="kicker mb-1">Meias (12 sem.)</p>
          <p className="font-display text-2xl text-gold-dim">☆ {totalMeias}</p>
        </Card>
        <Card>
          <p className="kicker mb-1">Zeradas (12 sem.)</p>
          <p className="font-display text-2xl text-stone-500">{totalZeradas}</p>
        </Card>
      </div>

      <Card title="Semana a semana">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="pb-2">Semana</th>
              <th className="pb-2 text-right">Pagos</th>
              <th className="pb-2 text-right">Valor</th>
              <th className="pb-2 text-right">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {semanas.map((s, i) => {
              const r = resultadoSemana(s.qtd);
              const fim = new Date(s.inicio + "T12:00:00");
              fim.setDate(fim.getDate() + 6);
              return (
                <tr key={s.inicio} className={`border-t border-imperium-line ${i === 0 ? "bg-gold/5" : ""}`}>
                  <td className="py-2 text-stone-300">
                    {new Date(s.inicio + "T12:00:00").toLocaleDateString("pt-BR")} –{" "}
                    {fim.toLocaleDateString("pt-BR")}
                    {i === 0 && <span className="ml-2 text-[10px] uppercase text-gold">essa semana</span>}
                  </td>
                  <td className="py-2 text-right text-stone-100">{s.qtd}</td>
                  <td className="py-2 text-right text-stone-400">{s.qtd > 0 ? moeda(s.valor) : "—"}</td>
                  <td className={`py-2 text-right font-medium ${r.cor}`}>
                    {r.icone} {r.label}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
