import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { calcularConcessaoCampanha } from "@/lib/campanha-recompensas";
import { confirmarConcessaoCampanha } from "../../actions";
import { ROLE_LABELS } from "@/lib/labels";
import Card from "@/components/ui/Card";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}

export default async function ApurarCampanhaPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  if (profile?.role !== "diretor") redirect("/");

  const resultado = await calcularConcessaoCampanha(supabase, params.id);
  if (!resultado) notFound();

  const { campanha, requisito, vencedores, concessoes } = resultado;
  const jaApurada = !!campanha.apuradaEm;

  const { data: concedidos } = jaApurada
    ? await supabase
        .from("campanha_recompensas")
        .select("profile_id, tipo, valor, concedido_em, profile:profiles!campanha_recompensas_profile_id_fkey(full_name, role)")
        .eq("campanha_id", campanha.id)
    : { data: null };

  const totalGeral = concessoes.reduce((s, c) => s + c.valor, 0);

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Apurar campanha</h1>
        <p className="kicker mt-1">{campanha.titulo}</p>
      </div>

      <Card title="Resumo">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-stone-500">Período</p>
            <p className="text-stone-200">
              {new Date(campanha.dataInicio + "T00:00:00").toLocaleDateString("pt-BR")} –{" "}
              {new Date(campanha.dataFim + "T00:00:00").toLocaleDateString("pt-BR")}
            </p>
          </div>
          <div>
            <p className="text-stone-500">Métrica</p>
            <p className="text-stone-200">{campanha.metrica === "credito" ? "Crédito (R$)" : campanha.metrica === "pontuacao" ? "Pontuação" : campanha.metrica}</p>
          </div>
          <div>
            <p className="text-stone-500">Requisito mínimo</p>
            <p className="text-stone-200">{requisito !== null ? requisito : "— (não definido, ninguém pode ser apurado)"}</p>
          </div>
          <div>
            <p className="text-stone-500">Tipo de recompensa</p>
            <p className="text-stone-200">{campanha.recompensaTipo === "estrela" ? "Estrela" : campanha.recompensaTipo === "dinheiro" ? "Dinheiro" : "—"}</p>
          </div>
        </div>
      </Card>

      <Card title="Progresso de cada participante">
        {campanha.participantes.length === 0 ? (
          <p className="text-sm text-stone-500">Sem participantes.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {campanha.participantes.map((p) => {
              const bateu = requisito !== null && p.valor >= requisito;
              return (
                <li key={p.refId} className="flex items-center justify-between">
                  <span className="text-stone-300">{p.label}</span>
                  <span className={bateu ? "text-success-bright" : "text-stone-500"}>
                    {p.valor.toLocaleString("pt-BR")} {bateu ? "— bateu" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {jaApurada ? (
        <Card title={`Concedida em ${new Date(campanha.apuradaEm!).toLocaleDateString("pt-BR")}`}>
          {concedidos && concedidos.length > 0 ? (
            <ul className="space-y-1.5 text-sm">
              {concedidos.map((c) => {
                const p = c.profile as unknown as { full_name: string; role: string } | null;
                return (
                  <li key={c.profile_id} className="flex items-center justify-between">
                    <span className="text-stone-300">
                      {p?.full_name ?? "—"} <span className="text-stone-600">({ROLE_LABELS[p?.role ?? ""] ?? p?.role})</span>
                    </span>
                    <span className="text-gold-bright">{c.tipo === "dinheiro" ? moeda(c.valor) : `${c.valor} estrela(s)`}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-stone-500">Nenhum registro encontrado.</p>
          )}
        </Card>
      ) : (
        <Card title="Prévia da concessão">
          {!campanha.recompensaTipo ? (
            <p className="text-sm text-stone-500">Essa campanha não tem recompensa estruturada configurada — nada a apurar.</p>
          ) : requisito === null ? (
            <p className="text-sm text-stone-500">Defina um requisito mínimo (ou meta numérica) na campanha antes de apurar.</p>
          ) : vencedores.length === 0 ? (
            <p className="text-sm text-stone-500">Ninguém bateu o requisito mínimo de {requisito} — nada a conceder.</p>
          ) : concessoes.length === 0 ? (
            <p className="text-sm text-stone-500">
              O(s) grupo(s) vencedor(es) bateram a meta, mas os valores de recompensa por papel estão zerados — nada a
              conceder.
            </p>
          ) : (
            <>
              <ul className="space-y-1.5 text-sm">
                {concessoes.map((c) => (
                  <li key={c.profileId} className="flex items-center justify-between">
                    <span className="text-stone-300">
                      {c.nome} <span className="text-stone-600">({ROLE_LABELS[c.role] ?? c.role})</span>
                    </span>
                    <span className="text-gold-bright">
                      {campanha.recompensaTipo === "dinheiro" ? moeda(c.valor) : `${c.valor} estrela(s)`}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between border-t border-imperium-line pt-2 text-sm">
                <span className="text-stone-400">Total</span>
                <span className="font-medium text-gold-bright">
                  {campanha.recompensaTipo === "dinheiro" ? moeda(totalGeral) : `${totalGeral} estrela(s)`}
                </span>
              </div>
              <form action={confirmarConcessaoCampanha} className="mt-4">
                <input type="hidden" name="campanha_id" value={campanha.id} />
                <button type="submit" className="btn-gold">
                  Confirmar e conceder
                </button>
              </form>
            </>
          )}
        </Card>
      )}
    </main>
  );
}
