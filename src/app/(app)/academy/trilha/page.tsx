import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buscarTrilhas, buscarAulasDaTrilha, buscarMateriaisPorAulas } from "@/lib/academy";
import TrilhaView from "./TrilhaView";

export default async function TrilhaFormacaoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("rank, role").eq("id", user.id).single();
  if (profile?.role === "diretor") redirect("/academy");

  const trilhas = await buscarTrilhas(supabase);
  const minhaTrilha = trilhas.find((t) => t.rank === profile?.rank);
  const arena = trilhas.find((t) => t.tipo === "arena");

  const trilhasRelevantes = [minhaTrilha, arena].filter((t): t is NonNullable<typeof t> => !!t);

  const aulasPorTrilha = await Promise.all(trilhasRelevantes.map((t) => buscarAulasDaTrilha(supabase, t.id)));
  const todasAulas = aulasPorTrilha.flat();
  const materiaisPorAula = await buscarMateriaisPorAulas(supabase, todasAulas.map((a) => a.id));

  return (
    <TrilhaView
      trilhas={trilhasRelevantes}
      aulasPorTrilha={Object.fromEntries(trilhasRelevantes.map((t, i) => [t.id, aulasPorTrilha[i]]))}
      materiaisPorAula={materiaisPorAula}
    />
  );
}
