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
import { criarTribo, renomearTribo, atualizarLogoTribo } from "./actions";
import Card from "@/components/ui/Card";

export default async function TriboPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: tribo } = await supabase
    .from("tribos")
    .select("id, nome, logo_url, exercito:exercitos(nome)")
    .eq("closer_id", user.id)
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

      <Card title="Produção coletiva do mês">
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
                  {funilColetivo[etapa].realizado}
                </td>
                <td className="py-2 text-right text-stone-500">{funilColetivo[etapa].meta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Liderados">
        <div className="grid gap-3 sm:grid-cols-2">
          {(sdrs ?? []).map((sdr) => (
            <MembroCard
              key={sdr.id}
              id={sdr.id}
              nome={sdr.full_name}
              cargo="SDR"
              compromissoStatus={
                STATUS_LABEL[compromissoMap.get(sdr.id)?.status ?? "não lançado"]
              }
              compromissoCor={STATUS_COR[compromissoMap.get(sdr.id)?.status ?? "não lançado"]}
              pagosMes={pagosMap.get(sdr.id) ?? 0}
            />
          ))}
        </div>
      </Card>
    </main>
  );
}
