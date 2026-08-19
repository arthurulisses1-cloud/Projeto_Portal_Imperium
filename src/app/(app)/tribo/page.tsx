import { createClient } from "@/lib/supabase/server";
import { FUNNEL_STAGES, FUNNEL_LABELS } from "@/lib/funil";
import {
  buscarComprometimentoHoje,
  buscarPagosMes,
  buscarFunilColetivo,
  STATUS_COR,
  STATUS_LABEL,
} from "@/lib/time";
import MembroCard from "@/components/MembroCard";
import ConvidarForm from "./convidar-form";
import { criarTribo, renomearTribo, atualizarLogoTribo, deixarFeedback, registrarPerda } from "./actions";
import Card from "@/components/ui/Card";
import { getViewerContext } from "@/lib/preview";

const MOTIVOS_PERDA = ["Preço", "Timing", "Perfil fora do ICP", "Concorrência", "Sumiu/não respondeu", "Outro"];

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default async function TriboPage({
  searchParams,
}: {
  searchParams: { membro?: string };
}) {
  const supabase = await createClient();
  const viewer = await getViewerContext(supabase);
  if (!viewer) return null;
  const meId = viewer.effectiveId;

  const { data: tribo } = await supabase
    .from("tribos")
    .select("id, nome, logo_url, exercito:exercitos(nome)")
    .eq("closer_id", meId)
    .maybeSingle();

  if (!tribo) {
    const { data: exercitos } = await supabase.from("exercitos").select("id, nome");
    return (
      <main className="mx-auto max-w-lg space-y-4 px-6 py-8">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Minha Tribo</h1>
          <p className="kicker mt-1">Você ainda não criou sua Tribo</p>
        </div>
        <Card>
          <form action={criarTribo} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-stone-400">Nome da Tribo</label>
              <input name="nome" required placeholder="Ex: Tribo Aquila" className="input-imp" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-400">Exército</label>
              <select name="exercito_id" required className="input-imp">
                {(exercitos ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-gold">
              Criar Tribo
            </button>
          </form>
        </Card>
      </main>
    );
  }

  const { data: sdrs } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("tribo_id", tribo.id);

  const idsSdrs = (sdrs ?? []).map((s) => s.id);

  const [compromissoMap, pagosMap, funilColetivo] = await Promise.all([
    buscarComprometimentoHoje(supabase, idsSdrs),
    buscarPagosMes(supabase, idsSdrs),
    buscarFunilColetivo(supabase, idsSdrs),
  ]);

  const membroSelecionado =
    searchParams.membro && idsSdrs.includes(searchParams.membro) ? searchParams.membro : null;
  const nomeMembroSelecionado = membroSelecionado
    ? (sdrs ?? []).find((s) => s.id === membroSelecionado)?.full_name
    : null;
  const funilExibido = membroSelecionado
    ? await buscarFunilColetivo(supabase, [membroSelecionado])
    : funilColetivo;

  const rankingTribo = (sdrs ?? [])
    .map((s) => ({ id: s.id, nome: s.full_name, valor: pagosMap.get(s.id) ?? 0 }))
    .sort((a, b) => b.valor - a.valor);

  const { data: perdas } = await supabase
    .from("perdas")
    .select("id, motivo, observacao, data")
    .eq("profile_id", meId)
    .order("data", { ascending: false })
    .limit(10);

  const contagemMotivos = new Map<string, number>();
  for (const p of perdas ?? []) {
    contagemMotivos.set(p.motivo, (contagemMotivos.get(p.motivo) ?? 0) + 1);
  }

  const exercitoNome = (tribo.exercito as unknown as { nome: string } | null)?.nome;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-center gap-4">
        {tribo.logo_url ? (
          <img
            src={tribo.logo_url}
            alt={tribo.nome}
            className="h-14 w-14 rounded-full border border-gold/40 object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-imperium-line-strong text-stone-600">
            ?
          </div>
        )}
        <div>
          <h1 className="font-display text-2xl text-gold-bright">{tribo.nome}</h1>
          <p className="kicker mt-1">
            Minha Tribo{exercitoNome ? ` · ${exercitoNome}` : ""}
          </p>
        </div>
      </div>

      <Card title="Configurações da Tribo">
        <div className="flex flex-wrap gap-8">
          <form action={renomearTribo} className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-stone-400">Renomear</label>
              <input name="nome" defaultValue={tribo.nome} className="input-imp text-sm" />
            </div>
            <button type="submit" className="btn-outline">
              Salvar nome
            </button>
          </form>

          <form action={atualizarLogoTribo} className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-stone-400">Logo da Tribo</label>
              <input type="file" name="logo" accept="image/*" required className="text-sm text-stone-300" />
            </div>
            <button type="submit" className="btn-outline">
              Enviar logo
            </button>
          </form>
        </div>
      </Card>

      <Card title="Convidar membro">
        <ConvidarForm />
      </Card>

      {rankingTribo.length > 0 && (
        <Card title="Ranking da Tribo">
          <ol className="space-y-1.5">
            {rankingTribo.map((r, i) => (
              <li key={r.id} className="flex justify-between text-sm">
                <span className={i === 0 ? "text-gold-bright" : "text-stone-300"}>
                  {i + 1}. {r.nome}
                </span>
                <span className={i === 0 ? "text-gold-bright" : "text-stone-400"}>{moeda(r.valor)}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <Card
        title={membroSelecionado ? `Produção do mês — ${nomeMembroSelecionado}` : "Produção coletiva do mês"}
        right={
          <div className="flex gap-2 text-xs">
            <a
              href="/tribo"
              className={`rounded px-2 py-1 uppercase transition ${
                !membroSelecionado ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold"
              }`}
            >
              Coletiva
            </a>
            {(sdrs ?? []).map((s) => (
              <a
                key={s.id}
                href={`/tribo?membro=${s.id}`}
                className={`rounded px-2 py-1 uppercase transition ${
                  membroSelecionado === s.id
                    ? "bg-gold text-imperium-bg"
                    : "border border-imperium-line text-stone-300 hover:border-gold"
                }`}
              >
                {s.full_name.split(" ")[0]}
              </a>
            ))}
          </div>
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
              <th className="pb-2">Etapa</th>
              <th className="pb-2 text-right">Realizado</th>
              <th className="pb-2 text-right">Meta</th>
            </tr>
          </thead>
          <tbody>
            {FUNNEL_STAGES.map((etapa) => (
              <tr key={etapa} className="border-t border-imperium-line">
                <td className="py-2 text-stone-300">{FUNNEL_LABELS[etapa]}</td>
                <td className="py-2 text-right text-stone-100">
                  {funilExibido[etapa].realizado}
                </td>
                <td className="py-2 text-right text-stone-500">{funilExibido[etapa].meta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Liderados">
        <div className="grid gap-3 sm:grid-cols-2">
          {(sdrs ?? []).map((sdr) => (
            <div key={sdr.id} className="space-y-2">
              <MembroCard
                id={sdr.id}
                nome={sdr.full_name}
                cargo="SDR"
                compromissoStatus={
                  STATUS_LABEL[compromissoMap.get(sdr.id)?.status ?? "não lançado"]
                }
                compromissoCor={STATUS_COR[compromissoMap.get(sdr.id)?.status ?? "não lançado"]}
                pagosMes={pagosMap.get(sdr.id) ?? 0}
              />
              <details className="rounded border border-imperium-line bg-imperium-bg/40 px-3 py-2 text-xs">
                <summary className="cursor-pointer text-stone-400 hover:text-gold-bright">
                  Deixar feedback
                </summary>
                <form action={deixarFeedback} className="mt-2 space-y-2">
                  <input type="hidden" name="sdr_id" value={sdr.id} />
                  <textarea
                    name="texto"
                    required
                    placeholder="Ex: entrevista muito bem qualificada essa semana"
                    rows={2}
                    className="input-imp px-2 py-1"
                  />
                  <button type="submit" className="btn-outline px-2 py-1 text-xs">
                    Enviar
                  </button>
                </form>
              </details>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Motivos de Perda" right={<span className="text-xs text-stone-500">Diagnóstico qualitativo</span>}>
        <form action={registrarPerda} className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-stone-400">Motivo</label>
            <select name="motivo" required className="input-imp text-sm">
              {MOTIVOS_PERDA.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-stone-400">Data</label>
            <input type="date" name="data" defaultValue={new Date().toISOString().slice(0, 10)} className="input-imp text-sm" />
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-xs text-stone-400">Observação (opcional)</label>
            <input name="observacao" className="input-imp text-sm" />
          </div>
          <button type="submit" className="btn-outline">
            Registrar
          </button>
        </form>

        {contagemMotivos.size > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {Array.from(contagemMotivos.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([motivo, qtd]) => (
                <span
                  key={motivo}
                  className="rounded-full border border-wine/40 bg-wine/10 px-3 py-1 text-xs text-wine-bright"
                >
                  {motivo} · {qtd}
                </span>
              ))}
          </div>
        )}

        {perdas && perdas.length > 0 ? (
          <ul className="space-y-1.5">
            {perdas.map((p) => (
              <li key={p.id} className="flex justify-between border-t border-imperium-line pt-1.5 text-xs">
                <span className="text-stone-300">
                  {p.motivo}
                  {p.observacao ? ` — ${p.observacao}` : ""}
                </span>
                <span className="text-stone-600">{new Date(p.data + "T00:00:00").toLocaleDateString("pt-BR")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-stone-600">Nenhuma perda registrada ainda.</p>
        )}
      </Card>
    </main>
  );
}
