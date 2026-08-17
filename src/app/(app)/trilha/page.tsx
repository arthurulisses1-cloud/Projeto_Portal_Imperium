import { createClient } from "@/lib/supabase/server";
import { RANK_LABELS } from "@/lib/labels";
import { RANK_ORDER, type Rank } from "@/lib/carreira";
import { marcarModuloConcluido } from "./actions";

export default async function TrilhaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("rank")
    .eq("id", user.id)
    .single();

  const rankAtual = (profile?.rank ?? "legionario") as Rank;
  const idxAtual = RANK_ORDER.indexOf(rankAtual);

  const { data: modulos } = await supabase
    .from("trilha_modulos")
    .select("id, nome, nivel_min, formato, ordem")
    .order("ordem");

  const { data: progresso } = await supabase
    .from("trilha_progresso")
    .select("modulo_id")
    .eq("profile_id", user.id);

  const concluidos = new Set((progresso ?? []).map((p) => p.modulo_id));

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-8">
      <div>
        <h1 className="font-serif text-xl text-amber-400">Trilha de Formação</h1>
        <p className="text-xs text-stone-400">
          Módulos destravam por nível — conteúdo completo (vídeo/PDF) chega numa fase seguinte.
        </p>
      </div>

      <div className="space-y-2">
        {(modulos ?? []).map((m) => {
          const idxModulo = RANK_ORDER.indexOf(m.nivel_min as Rank);
          const travado = idxModulo > idxAtual;
          const feito = concluidos.has(m.id);
          return (
            <div
              key={m.id}
              className={`rounded-lg border p-4 ${
                travado ? "border-stone-900 opacity-50" : "border-stone-800 bg-[#111827]"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-stone-100">{m.nome}</p>
                  <p className="text-xs text-stone-500">
                    {m.formato} · a partir de {RANK_LABELS[m.nivel_min]}
                  </p>
                </div>
                {travado ? (
                  <span className="text-xs text-stone-600">Bloqueado</span>
                ) : feito ? (
                  <span className="text-xs text-emerald-400">Concluído</span>
                ) : (
                  <form action={marcarModuloConcluido}>
                    <input type="hidden" name="modulo_id" value={m.id} />
                    <button
                      type="submit"
                      className="rounded border border-amber-500/50 px-3 py-1 text-xs text-amber-400 hover:bg-amber-500/10"
                    >
                      Marcar concluído
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
