import { createClient } from "@/lib/supabase/server";
import { FUNNEL_STAGES, FUNNEL_LABELS } from "@/lib/funil";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function VisaoGeralPage() {
  const supabase = await createClient();

  const { data: exercitos } = await supabase
    .from("exercitos")
    .select("id, nome, legado:profiles!exercitos_legado_id_fkey(full_name)");

  const { data: pessoas } = await supabase
    .from("profiles")
    .select("id, role, tribo:tribos!profiles_tribo_id_fkey(exercito_id)")
    .in("role", ["sdr", "closer"]);

  const inicioMes = new Date().toISOString().slice(0, 7) + "-01";
  const idsTodos = (pessoas ?? []).map((p) => p.id);

  const { data: funilRows } =
    idsTodos.length > 0
      ? await supabase
          .from("producao_funil")
          .select("profile_id, etapa, realizado, meta")
          .in("profile_id", idsTodos)
          .gte("data", inicioMes)
      : { data: [] };

  const { data: vendasRows } =
    idsTodos.length > 0
      ? await supabase.from("vendas").select("profile_id, valor").in("profile_id", idsTodos).gte("data", inicioMes)
      : { data: [] };

  const totalGeral = Object.fromEntries(
    FUNNEL_STAGES.map((e) => [e, { realizado: 0, meta: 0 }])
  ) as Record<string, { realizado: number; meta: number }>;
  for (const row of funilRows ?? []) {
    totalGeral[row.etapa].realizado += row.realizado;
    totalGeral[row.etapa].meta += row.meta;
  }

  const exercitoIdPorProfile = new Map<string, string | null>();
  for (const p of pessoas ?? []) {
    const tribo = p.tribo as unknown as { exercito_id: string } | null;
    exercitoIdPorProfile.set(p.id, tribo?.exercito_id ?? null);
  }
  const pagosPorExercito = new Map<string, number>();
  for (const row of vendasRows ?? []) {
    const exId = exercitoIdPorProfile.get(row.profile_id);
    if (!exId) continue;
    pagosPorExercito.set(exId, (pagosPorExercito.get(exId) ?? 0) + Number(row.valor));
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-serif text-xl text-amber-400">Visão Geral da Firma</h1>
        <p className="text-xs text-stone-400">Império · todos os Exércitos</p>
      </div>

      <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-stone-400">
          Funil consolidado do mês
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
                <td className="py-2 text-right text-stone-100">{totalGeral[etapa].realizado}</td>
                <td className="py-2 text-right text-stone-500">{totalGeral[etapa].meta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-stone-400">
          Exércitos
        </h2>
        <ul className="space-y-2">
          {(exercitos ?? []).map((e) => {
            const legado = e.legado as unknown as { full_name: string } | null;
            return (
              <li key={e.id} className="flex justify-between border-t border-stone-800 pt-2 text-sm">
                <span className="text-stone-300">
                  {e.nome} <span className="text-stone-600">· Legado: {legado?.full_name ?? "—"}</span>
                </span>
                <span className="text-amber-400">{moeda(pagosPorExercito.get(e.id) ?? 0)}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
