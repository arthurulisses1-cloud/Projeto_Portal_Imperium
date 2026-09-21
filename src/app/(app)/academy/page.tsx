import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buscarTrilhas, buscarTodasAulas, buscarInstrutoresElegiveis, buscarModulos, buscarItensPorModulos } from "@/lib/academy";
import { buscarComentarios, buscarReacoes } from "@/lib/social";
import { podeVerArea } from "@/lib/permissoes-analista";
import AcademyGeralView from "./AcademyGeralView";

export default async function AcademyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  const analistaLiberado = profile?.role === "analista" && (await podeVerArea(supabase, user.id, profile.role, "academy"));
  if (profile?.role !== "diretor" && !analistaLiberado) redirect("/academy/trilha");
  const isDiretor = profile?.role === "diretor";

  const trilhas = await buscarTrilhas(supabase);
  const todasAulas = await buscarTodasAulas(supabase);
  const pares = await Promise.all(
    trilhas.map(async (t) => [t.id, await buscarInstrutoresElegiveis(supabase, t.rank)] as const)
  );
  const instrutoresPorTrilha = Object.fromEntries(pares);

  const modulos = await buscarModulos(supabase);
  const itensPorModulo = await buscarItensPorModulos(supabase, modulos.map((m) => m.id));

  // Aba "Netflix" — a mesma prévia que o time vê em /academy/trilha, só que
  // aqui dentro de Academy Geral pra o Diretor navegar sem trocar de página.
  const aulasPorTrilha: Record<string, typeof todasAulas> = {};
  for (const a of todasAulas) (aulasPorTrilha[a.trilhaId] ??= []).push(a);
  const aulasFechadas = todasAulas.filter((a) => a.realizada);
  const { data: pessoas } = await supabase.from("profiles").select("id, full_name").eq("ativo", true);

  const idsAulas = aulasFechadas.map((a) => a.id);
  const idsItens = Object.values(itensPorModulo).flat().map((i) => i.id);
  const [comentariosAulas, reacoesAulas, comentariosItens, reacoesItens] = await Promise.all([
    buscarComentarios(supabase, "academy_aula", idsAulas),
    buscarReacoes(supabase, "academy_aula", idsAulas, user.id),
    buscarComentarios(supabase, "academy_modulo_item", idsItens),
    buscarReacoes(supabase, "academy_modulo_item", idsItens, user.id),
  ]);

  return (
    <AcademyGeralView
      trilhas={trilhas}
      todasAulas={todasAulas}
      instrutoresPorTrilha={instrutoresPorTrilha}
      modulos={modulos}
      itensPorModulo={itensPorModulo}
      aulasPorTrilha={aulasPorTrilha}
      meId={user.id}
      isDiretor={isDiretor}
      pessoas={(pessoas ?? []).map((p) => ({ id: p.id, nome: p.full_name }))}
      comentariosAulas={Object.fromEntries(comentariosAulas)}
      reacoesAulas={Object.fromEntries(reacoesAulas)}
      comentariosItens={Object.fromEntries(comentariosItens)}
      reacoesItens={Object.fromEntries(reacoesItens)}
    />
  );
}
