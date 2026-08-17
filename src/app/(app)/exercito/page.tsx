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

export default async function ExercitoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: exercito } = await supabase
    .from("exercitos")
    .select("id, nome")
    .eq("legado_id", user.id)
    .maybeSingle();

  if (!exercito) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="font-serif text-xl text-amber-400">Meu Exército</h1>
        <p className="mt-4 text-sm text-stone-500">
          Seu usuário ainda não está vinculado como Legado de nenhum Exército. Peça
          pro Diretor configurar isso na tabela <code>exercitos</code>.
        </p>
      </main>
    );
  }

  const { data: tribos } = await supabase
    .from("tribos")
    .select("id, nome, closer:profiles!tribos_closer_id_fkey(id, full_name)")
    .eq("exercito_id", exercito.id);

  const triboIds = (tribos ?? []).map((t) => t.id);
  const { data: sdrs } = triboIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, tribo_id")
        .in("tribo_id", triboIds)
    : { data: [] };

  const todosIds = [
    ...(tribos ?? [])
      .map((t) => (t.closer as unknown as { id: string; full_name: string } | null)?.id)
      .filter((id): id is string => !!id),
    ...(sdrs ?? []).map((s) => s.id),
  ];

  const [compromissoMap, pagosMap, funilColetivo] = await Promise.all([
    buscarComprometimentoHoje(supabase, todosIds),
    buscarPagosMes(supabase, todosIds),
    buscarFunilColetivo(supabase, todosIds),
  ]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-serif text-xl text-amber-400">Meu Exército</h1>
        <p className="text-xs text-stone-400">{exercito.nome}</p>
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

      {(tribos ?? []).map((tribo) => {
        const closer = tribo.closer as unknown as { id: string; full_name: string } | null;
        const sdrsDaTribo = (sdrs ?? []).filter((s) => s.tribo_id === tribo.id);
        return (
          <section key={tribo.id} className="rounded-lg border border-stone-800 bg-[#111827] p-6">
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-stone-400">
              {tribo.nome}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {closer && (
                <MembroCard
                  id={closer.id}
                  nome={closer.full_name}
                  cargo="Closer"
                  compromissoStatus={
                    STATUS_LABEL[compromissoMap.get(closer.id)?.status ?? "não lançado"]
                  }
                  compromissoCor={
                    STATUS_COR[compromissoMap.get(closer.id)?.status ?? "não lançado"]
                  }
                  pagosMes={pagosMap.get(closer.id) ?? 0}
                />
              )}
              {sdrsDaTribo.map((sdr) => (
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
        );
      })}
    </main>
  );
}
