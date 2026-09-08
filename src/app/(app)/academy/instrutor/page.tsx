import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buscarAulasParaMinistrar, buscarMateriaisPorAulas } from "@/lib/academy";
import InstrutorView from "./InstrutorView";

export default async function AulasParaMinistrarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const aulas = await buscarAulasParaMinistrar(supabase, user.id);
  const materiaisPorAula = await buscarMateriaisPorAulas(supabase, aulas.map((a) => a.id));

  return <InstrutorView aulas={aulas} materiaisPorAula={materiaisPorAula} />;
}
