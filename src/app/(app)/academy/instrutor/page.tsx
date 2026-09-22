import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buscarAulasParaMinistrar,
  buscarMateriaisPorAulas,
  resolverAudienciaDaAula,
  buscarPresencasPorAulas,
  buscarTodasAulas,
  buscarTrilhas,
  type AlunoAudiencia,
  type AulaComCobranca,
} from "@/lib/academy";
import { podeVerArea } from "@/lib/permissoes-analista";
import InstrutorView from "./InstrutorView";

export default async function AulasParaMinistrarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const isDiretor = profile?.role === "diretor";
  const analistaComAcademyAdmin = profile?.role === "analista" && (await podeVerArea(supabase, user.id, profile.role, "academy"));

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

  // Visão de cobrança — pedido do Diretor, 2026-09-22: "quero ver as aulas
  // dos outros professores pra poder cobrar eles de fazer o fechamento".
  // Só monta pra quem administra a Academy (Diretor/Analista liberado) —
  // instrutor comum continua vendo só as próprias aulas acima.
  let aulasCobranca: AulaComCobranca[] | null = null;
  if (isDiretor || analistaComAcademyAdmin) {
    const [todasAulas, trilhas] = await Promise.all([buscarTodasAulas(supabase), buscarTrilhas(supabase)]);
    const trilhaNomePorId = new Map(trilhas.map((t) => [t.id, t.nome]));
    const hoje = new Date().toISOString().slice(0, 10);
    const idsPendentes = todasAulas.filter((a) => !a.realizada && a.data !== null && a.data <= hoje).map((a) => a.id);
    const [materiaisPendentes, presencasPendentes] = await Promise.all([
      buscarMateriaisPorAulas(supabase, idsPendentes),
      buscarPresencasPorAulas(supabase, idsPendentes),
    ]);
    aulasCobranca = todasAulas
      .filter((a) => idsPendentes.includes(a.id))
      .map((a) => ({
        ...a,
        trilhaNome: trilhaNomePorId.get(a.trilhaId) ?? "—",
        temMaterial: (materiaisPendentes[a.id] ?? []).length > 0,
        temPresenca: Object.keys(presencasPendentes[a.id] ?? {}).length > 0,
      }))
      .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""));
  }

  return (
    <InstrutorView
      aulas={aulas}
      materiaisPorAula={materiaisPorAula}
      audienciaPorAula={audienciaPorAula}
      presencasPorAula={presencasPorAula}
      aulasCobranca={aulasCobranca}
    />
  );
}
