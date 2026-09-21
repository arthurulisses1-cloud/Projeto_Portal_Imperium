import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buscarTrilhas, buscarTodasAulas, buscarAulasDaTrilha, buscarModulos, buscarItensPorModulos, buscarAssistidos } from "@/lib/academy";
import { buscarComentarios, buscarReacoes } from "@/lib/social";
import NetflixAcademy from "../NetflixAcademy";
import ImperioflixLogo from "../ImperioflixLogo";

// Imperioflix — sub-aba própria de "Imperium Academy" (pedido do Diretor,
// 2026-09-21: não é uma aba dentro de Academy Geral nem de Trilhas de
// Formação, é seu próprio catálogo). Diretor/Analista-admin veem TODAS as
// trilhas oficiais e nunca veem cadeado de rank (é uma prévia de quem
// administra); o resto do time vê só a própria trilha + Arena, com cadeado
// normal nos módulos que não liberam o rank dele.
export default async function ImperioflixPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("rank, role").eq("id", user.id).single();
  const isDiretor = profile?.role === "diretor";

  const todasTrilhas = await buscarTrilhas(supabase);
  let trilhas = todasTrilhas;
  let aulasPorTrilha: Record<string, Awaited<ReturnType<typeof buscarTodasAulas>>> = {};

  if (isDiretor) {
    const todasAulas = await buscarTodasAulas(supabase);
    for (const a of todasAulas) (aulasPorTrilha[a.trilhaId] ??= []).push(a);
  } else {
    const minhaTrilha = profile?.rank ? todasTrilhas.find((t) => t.rank === profile.rank) : undefined;
    const arena = todasTrilhas.find((t) => t.tipo === "arena");
    trilhas = [minhaTrilha, arena].filter((t): t is NonNullable<typeof t> => !!t);
    const aulasPorTrilhaArr = await Promise.all(trilhas.map((t) => buscarAulasDaTrilha(supabase, t.id)));
    aulasPorTrilha = Object.fromEntries(trilhas.map((t, i) => [t.id, aulasPorTrilhaArr[i]]));
  }

  const todasAulasFiltradas = Object.values(aulasPorTrilha).flat();
  const aulasFechadas = todasAulasFiltradas.filter((a) => a.realizada);

  const [modulos, { data: pessoas }] = await Promise.all([
    buscarModulos(supabase, { soAtivos: !isDiretor }),
    supabase.from("profiles").select("id, full_name").eq("ativo", true),
  ]);
  const itensPorModulo = await buscarItensPorModulos(supabase, modulos.map((m) => m.id));

  const idsAulas = aulasFechadas.map((a) => a.id);
  const idsItens = Object.values(itensPorModulo).flat().map((i) => i.id);
  const [comentariosAulas, reacoesAulas, comentariosItens, reacoesItens, assistidos] = await Promise.all([
    buscarComentarios(supabase, "academy_aula", idsAulas),
    buscarReacoes(supabase, "academy_aula", idsAulas, user.id),
    buscarComentarios(supabase, "academy_modulo_item", idsItens),
    buscarReacoes(supabase, "academy_modulo_item", idsItens, user.id),
    buscarAssistidos(supabase, user.id, idsAulas, idsItens),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <ImperioflixLogo />

      <NetflixAcademy
        trilhas={trilhas}
        aulasPorTrilha={aulasPorTrilha}
        modulos={modulos}
        itensPorModulo={itensPorModulo}
        meuRank={isDiretor ? null : ((profile?.rank as string | undefined) ?? null)}
        meId={user.id}
        isDiretor={isDiretor}
        pessoas={(pessoas ?? []).map((p) => ({ id: p.id, nome: p.full_name }))}
        comentariosAulas={Object.fromEntries(comentariosAulas)}
        reacoesAulas={Object.fromEntries(reacoesAulas)}
        comentariosItens={Object.fromEntries(comentariosItens)}
        reacoesItens={Object.fromEntries(reacoesItens)}
        assistidos={assistidos}
      />
    </main>
  );
}
