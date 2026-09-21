import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buscarAulasParaMinistrar,
  buscarMateriaisPorAulas,
  resolverAudienciaDaAula,
  buscarPresencasPorAulas,
  type AlunoAudiencia,
} from "@/lib/academy";
import InstrutorView from "./InstrutorView";

export default async function AulasParaMinistrarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const aulas = await buscarAulasParaMinistrar(supabase, user.id);
  const [materiaisPorAula, presencasPorAula, audienciaPorAula] = await Promise.all([
    buscarMateriaisPorAulas(supabase, aulas.map((a) => a.id)),
    buscarPresencasPorAulas(supabase, aulas.map((a) => a.id)),
    // Uma trilha pode ter várias aulas — evita buscar a mesma audiência
    // repetida pra cada aula da mesma trilha.
    (async () => {
      const porTrilha = new Map<string, AlunoAudiencia[]>();
      const resultado: Record<string, AlunoAudiencia[]> = {};
      for (const aula of aulas) {
        if (!porTrilha.has(aula.trilhaId)) porTrilha.set(aula.trilhaId, await resolverAudienciaDaAula(supabase, aula.trilhaId));
        resultado[aula.id] = porTrilha.get(aula.trilhaId)!;
      }
      return resultado;
    })(),
  ]);

  return (
    <InstrutorView
      aulas={aulas}
      materiaisPorAula={materiaisPorAula}
      audienciaPorAula={audienciaPorAula}
      presencasPorAula={presencasPorAula}
    />
  );
}
