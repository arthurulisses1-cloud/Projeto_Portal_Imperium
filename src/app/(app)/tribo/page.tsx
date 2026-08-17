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
          <h1 className="font-serif text-xl text-amber-400">Minha Tribo</h1>
          <p className="text-xs text-stone-400">Você ainda não criou sua Tribo</p>
        </div>
        <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
          <form action={criarTribo} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-stone-400">Nome da Tribo</label>
              <input
                name="nome"
                required
                placeholder="Ex: Tribo Aquila"
                className="w-full rounded border border-stone-700 bg-[#0b0f19] px-3 py-2 text-stone-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-stone-400">Exército</label>
              <select
                name="exercito_id"
                required
                className="w-full rounded border border-stone-700 bg-[#0b0f19] px-3 py-2 text-stone-100"
              >
                {(exercitos ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-[#0b0f19] hover:bg-amber-400"
            >
              Criar Tribo
            </button>
          </form>
        </section>
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
            className="h-14 w-14 rounded-full border border-amber-500/40 object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-stone-700 text-stone-600">
            ?
          </div>
        )}
        <div>
          <h1 className="font-serif text-xl text-amber-400">{tribo.nome}</h1>
          <p className="text-xs text-stone-400">Minha Tribo{exercitoNome ? ` · ${exercitoNome}` : ""}</p>
        </div>
      </div>

      <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-stone-400">
          Configurações da Tribo
        </h2>
        <div className="flex flex-wrap gap-8">
          <form action={renomearTribo} className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-stone-400">Renomear</label>
              <input
                name="nome"
                defaultValue={tribo.nome}
                className="rounded border border-stone-700 bg-[#0b0f19] px-3 py-2 text-sm text-stone-100"
              />
            </div>
            <button
              type="submit"
              className="rounded border border-amber-500/50 px-3 py-2 text-xs text-amber-400 hover:bg-amber-500/10"
            >
              Salvar nome
            </button>
          </form>

          <form action={atualizarLogoTribo} className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-stone-400">Logo da Tribo</label>
              <input
                type="file"
                name="logo"
                accept="image/*"
                required
                className="text-sm text-stone-300"
              />
            </div>
            <button
              type="submit"
              className="rounded border border-amber-500/50 px-3 py-2 text-xs text-amber-400 hover:bg-amber-500/10"
            >
              Enviar logo
            </button>
          </form>
        </div>
      </section>

      <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-stone-400">
          Convidar membro
        </h2>
        <ConvidarForm />
      </section>

      <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-stone-400">
          Produção coletiva do mês
        </h2>
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
              <tr key={etapa} className="border-t border-stone-800">
                <td className="py-2 text-stone-300">{FUNNEL_LABELS[etapa]}</td>
                <td className="py-2 text-right text-stone-100">
                  {funilColetivo[etapa].realizado}
                </td>
                <td className="py-2 text-right text-stone-500">{funilColetivo[etapa].meta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-stone-400">
          Liderados
        </h2>
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
      </section>
    </main>
  );
}
