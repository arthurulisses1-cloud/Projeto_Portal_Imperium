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

export default async function TriboPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: tribo } = await supabase
    .from("tribos")
    .select("id, nome, exercito:exercitos(nome)")
    .eq("closer_id", user.id)
    .maybeSingle();

  if (!tribo) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-serif text-xl text-amber-400">Minha Tribo</h1>
        <p className="mt-4 text-sm text-stone-500">
          Seu usuário ainda não está vinculado como Closer de nenhuma Tribo. Peça
          pro Diretor configurar isso na tabela <code>tribos</code>.
        </p>
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
      <div>
        <h1 className="font-serif text-xl text-amber-400">Minha Tribo</h1>
        <p className="text-xs text-stone-400">
          {tribo.nome}
          {exercitoNome ? ` · ${exercitoNome}` : ""}
        </p>
      </div>

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
