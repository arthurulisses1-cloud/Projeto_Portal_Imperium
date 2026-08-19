import { createClient } from "@/lib/supabase/server";
import CampanhaForm from "./campanha-form";
import { excluirCampanha } from "./actions";
import { buscarCampanhasAtivas } from "@/lib/campanhas";
import Card from "@/components/ui/Card";

export default async function CampanhasPage() {
  const supabase = await createClient();

  const { data: pessoas } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("role", ["sdr", "closer"])
    .order("full_name");
  const { data: tribos } = await supabase.from("tribos").select("id, nome").order("nome");
  const { data: exercitos } = await supabase.from("exercitos").select("id, nome").order("nome");

  const { data: todasCampanhas } = await supabase
    .from("campanhas")
    .select("id, titulo, data_inicio, data_fim")
    .order("data_inicio", { ascending: false });

  const ativas = await buscarCampanhasAtivas(supabase);
  const idsAtivas = new Set(ativas.map((c) => c.id));

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Campanhas</h1>
        <p className="kicker mt-1">Criar uma campanha ou duelo pra o time acompanhar no Mural</p>
      </div>

      <Card title="Nova campanha">
        <CampanhaForm
          pessoas={(pessoas ?? []).map((p) => ({ id: p.id, label: p.full_name }))}
          tribos={(tribos ?? []).map((t) => ({ id: t.id, label: t.nome }))}
          exercitos={(exercitos ?? []).map((e) => ({ id: e.id, label: e.nome }))}
        />
      </Card>

      <Card title="Todas as campanhas">
        {todasCampanhas && todasCampanhas.length > 0 ? (
          <ul className="space-y-2">
            {todasCampanhas.map((c) => (
              <li key={c.id} className="flex items-center justify-between border-t border-imperium-line pt-2 text-sm first:border-0 first:pt-0">
                <span className="text-stone-200">
                  {c.titulo}{" "}
                  {idsAtivas.has(c.id) && <span className="ml-1 text-[10px] uppercase text-emerald-400">ativa</span>}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-stone-500">
                    {new Date(c.data_inicio + "T00:00:00").toLocaleDateString("pt-BR")} –{" "}
                    {new Date(c.data_fim + "T00:00:00").toLocaleDateString("pt-BR")}
                  </span>
                  <form action={excluirCampanha}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="text-xs text-stone-600 hover:text-wine-bright">
                      Excluir
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">Nenhuma campanha criada ainda.</p>
        )}
      </Card>
    </main>
  );
}
