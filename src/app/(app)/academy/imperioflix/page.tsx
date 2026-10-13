import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { carregarCatalogo } from "@/lib/imperioflix";
import ImperioflixHome from "@/components/imperioflix/ImperioflixHome";
import ImperioflixLogo from "../ImperioflixLogo";

// Imperioflix — home no formato Netflix (pedido do Diretor, 2026-10-13):
// destaque + prateleiras. Cada série abre numa página própria (lista de aulas)
// e cada aula numa página com player grande e a lista ao lado.
export default async function ImperioflixPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const catalogo = await carregarCatalogo(supabase, user.id);

  return (
    <main className="mx-auto max-w-[1400px] space-y-8 px-4 py-8 sm:px-6">
      <ImperioflixLogo />
      <ImperioflixHome series={catalogo.series} assistidos={Array.from(catalogo.assistidos)} categorias={catalogo.categorias} />
    </main>
  );
}
