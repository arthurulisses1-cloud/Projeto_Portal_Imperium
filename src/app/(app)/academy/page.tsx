import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buscarTrilhas, buscarTodasAulas, buscarInstrutoresElegiveis } from "@/lib/academy";
import { podeVerArea } from "@/lib/permissoes-analista";
import AcademyGeralView from "./AcademyGeralView";

export default async function AcademyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const analistaLiberado = profile?.role === "analista" && (await podeVerArea(supabase, user.id, profile.role, "academy"));
  if (profile?.role !== "diretor" && !analistaLiberado) redirect("/academy/trilha");

  const trilhas = await buscarTrilhas(supabase);
  const todasAulas = await buscarTodasAulas(supabase);
  const pares = await Promise.all(
    trilhas.map(async (t) => [t.id, await buscarInstrutoresElegiveis(supabase, t.rank)] as const)
  );
  const instrutoresPorTrilha = Object.fromEntries(pares);

  return <AcademyGeralView trilhas={trilhas} todasAulas={todasAulas} instrutoresPorTrilha={instrutoresPorTrilha} />;
}
