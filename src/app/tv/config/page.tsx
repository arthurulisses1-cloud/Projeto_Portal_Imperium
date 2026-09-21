import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buscarOrdemSlides, TV_SLIDES } from "@/lib/tv-config";
import ConfigView from "./ConfigView";

export default async function TvConfigPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "diretor") redirect("/tv");

  const ordem = await buscarOrdemSlides(supabase);
  const labelPorChave = Object.fromEntries(TV_SLIDES.map((s) => [s.chave, s.label]));

  return <ConfigView ordemInicial={ordem} labelPorChave={labelPorChave} />;
}
