import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buscarTrilhas,
  buscarAulasDaTrilha,
  buscarMateriaisPorAulas,
  buscarModulos,
  buscarItensPorModulos,
} from "@/lib/academy";
import { buscarComentarios, buscarReacoes } from "@/lib/social";
import TrilhaView from "./TrilhaView";

// Diretor e Analista com acesso admin a Academy também acessam essa página
// (sem redirecionar pra /academy) — eles têm o link "Academy Geral" separado
// pra editar; aqui é a visão de espectador da Netflix (rever aulas + módulos).
export default async function TrilhaFormacaoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("rank, role, full_name").eq("id", user.id).single();
  const isDiretor = profile?.role === "diretor";

  const trilhas = await buscarTrilhas(supabase);
  // profile.rank é null pra Diretor/Analista — sem esse filtro, `minhaTrilha`
  // bateria com a Arena (rank também null) e duplicaria ela ao lado de `arena`.
  const minhaTrilha = profile?.rank ? trilhas.find((t) => t.rank === profile.rank) : undefined;
  const arena = trilhas.find((t) => t.tipo === "arena");

  const trilhasRelevantes = [minhaTrilha, arena].filter((t): t is NonNullable<typeof t> => !!t);

  const aulasPorTrilha = await Promise.all(trilhasRelevantes.map((t) => buscarAulasDaTrilha(supabase, t.id)));
  const todasAulas = aulasPorTrilha.flat();
  const materiaisPorAula = await buscarMateriaisPorAulas(supabase, todasAulas.map((a) => a.id));

  // "Netflix" — pedido do Diretor, 2026-09-21: aulas OFICIAIS já fechadas
  // (material+presença+resumo) viram "filmes" pra rever, + módulos
  // alternativos (prateleiras livres, criadas em Academy Geral).
  const aulasFechadas = todasAulas.filter((a) => a.realizada);
  const [modulos, { data: pessoas }] = await Promise.all([
    buscarModulos(supabase, { soAtivos: true }),
    supabase.from("profiles").select("id, full_name").eq("ativo", true),
  ]);
  const itensPorModulo = await buscarItensPorModulos(supabase, modulos.map((m) => m.id));

  const idsAulas = aulasFechadas.map((a) => a.id);
  const idsItens = Object.values(itensPorModulo).flat().map((i) => i.id);
  const [comentariosAulas, reacoesAulas, comentariosItens, reacoesItens] = await Promise.all([
    buscarComentarios(supabase, "academy_aula", idsAulas),
    buscarReacoes(supabase, "academy_aula", idsAulas, user.id),
    buscarComentarios(supabase, "academy_modulo_item", idsItens),
    buscarReacoes(supabase, "academy_modulo_item", idsItens, user.id),
  ]);

  return (
    <TrilhaView
      trilhas={trilhasRelevantes}
      aulasPorTrilha={Object.fromEntries(trilhasRelevantes.map((t, i) => [t.id, aulasPorTrilha[i]]))}
      materiaisPorAula={materiaisPorAula}
      meuRank={(profile?.rank as string | undefined) ?? null}
      meId={user.id}
      isDiretor={isDiretor}
      pessoas={(pessoas ?? []).map((p) => ({ id: p.id, nome: p.full_name }))}
      modulos={modulos}
      itensPorModulo={itensPorModulo}
      comentariosAulas={Object.fromEntries(comentariosAulas)}
      reacoesAulas={Object.fromEntries(reacoesAulas)}
      comentariosItens={Object.fromEntries(comentariosItens)}
      reacoesItens={Object.fromEntries(reacoesItens)}
    />
  );
}
