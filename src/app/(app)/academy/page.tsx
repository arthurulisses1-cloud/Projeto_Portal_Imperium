import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buscarTrilhas,
  buscarAulasDaTrilha,
  buscarTodasAulas,
  buscarAulasParaMinistrar,
  buscarInstrutoresElegiveis,
  buscarMateriaisPorAulas,
} from "@/lib/academy";
import type { Rank } from "@/lib/carreira";
import AcademyTabs from "./AcademyTabs";

export default async function AcademyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, rank, full_name").eq("id", user.id).single();
  if (!profile) redirect("/");
  const isDiretor = profile.role === "diretor";
  const meuRank = profile.rank as Rank;

  const trilhas = await buscarTrilhas(supabase);
  const minhaTrilha = trilhas.find((t) => t.rank === meuRank) ?? null;
  const arena = trilhas.find((t) => t.tipo === "arena") ?? null;

  const [aulasMinhaTrilha, aulasArena, aulasParaMinistrar] = await Promise.all([
    minhaTrilha ? buscarAulasDaTrilha(supabase, minhaTrilha.id) : Promise.resolve([]),
    arena ? buscarAulasDaTrilha(supabase, arena.id) : Promise.resolve([]),
    buscarAulasParaMinistrar(supabase, user.id),
  ]);

  let todasAulas: Awaited<ReturnType<typeof buscarTodasAulas>> = [];
  let instrutoresPorTrilha: Record<string, { id: string; nome: string }[]> = {};
  if (isDiretor) {
    todasAulas = await buscarTodasAulas(supabase);
    const pares = await Promise.all(
      trilhas.map(async (t) => [t.id, await buscarInstrutoresElegiveis(supabase, t.rank)] as const)
    );
    instrutoresPorTrilha = Object.fromEntries(pares);
  }

  const idsRelevantes = [
    ...aulasMinhaTrilha.map((a) => a.id),
    ...aulasArena.map((a) => a.id),
    ...aulasParaMinistrar.map((a) => a.id),
  ];
  const materiaisPorAula = await buscarMateriaisPorAulas(supabase, idsRelevantes);

  return (
    <AcademyTabs
      isDiretor={isDiretor}
      meId={user.id}
      trilhas={trilhas}
      minhaTrilha={minhaTrilha}
      arena={arena}
      aulasMinhaTrilha={aulasMinhaTrilha}
      aulasArena={aulasArena}
      aulasParaMinistrar={aulasParaMinistrar}
      todasAulas={todasAulas}
      instrutoresPorTrilha={instrutoresPorTrilha}
      materiaisPorAula={materiaisPorAula}
    />
  );
}
