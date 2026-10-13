import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buscarTrilhas,
  buscarTodasAulas,
  buscarAulasDaTrilha,
  buscarModulos,
  buscarItensPorModulos,
  buscarAssistidos,
  moduloLiberadoPara,
  CATEGORIAS_MODULO,
  type Aula,
} from "@/lib/academy";
import { visualDaTrilha } from "@/lib/academy-visual";
import type { Rank } from "@/lib/carreira";
import type { Serie } from "@/lib/imperioflix-util";

export type CatalogoImperioflix = {
  series: Serie[];
  assistidos: Set<string>;
  isDiretor: boolean;
  categorias: { value: string; label: string }[];
};

const GRADIENTE_MODULO = "linear-gradient(135deg, #c9a227, #8a6d1a)";

// Monta o catálogo que ESSA pessoa pode ver (mesmas regras de sempre):
// Diretor vê todas as trilhas e nunca vê cadeado; o resto do time vê só a
// própria trilha + a Arena, e os módulos de rank que não liberam o dele
// aparecem com cadeado. Aula só entra depois de fechada (realizada).
export async function carregarCatalogo(supabase: SupabaseClient, userId: string): Promise<CatalogoImperioflix> {
  const { data: profile } = await supabase.from("profiles").select("rank, role").eq("id", userId).single();
  const isDiretor = profile?.role === "diretor";
  const meuRank = isDiretor ? null : ((profile?.rank as Rank | undefined) ?? null);

  const todasTrilhas = await buscarTrilhas(supabase);
  let trilhas = todasTrilhas;
  let aulasPorTrilha: Record<string, Aula[]> = {};

  if (isDiretor) {
    const todasAulas = await buscarTodasAulas(supabase);
    for (const a of todasAulas) (aulasPorTrilha[a.trilhaId] ??= []).push(a);
  } else {
    const minhaTrilha = profile?.rank ? todasTrilhas.find((t) => t.rank === profile.rank) : undefined;
    const arena = todasTrilhas.find((t) => t.tipo === "arena");
    trilhas = [minhaTrilha, arena].filter((t): t is NonNullable<typeof t> => !!t);
    const porTrilha = await Promise.all(trilhas.map((t) => buscarAulasDaTrilha(supabase, t.id)));
    aulasPorTrilha = Object.fromEntries(trilhas.map((t, i) => [t.id, porTrilha[i]]));
  }

  const modulos = await buscarModulos(supabase, { soAtivos: !isDiretor });
  const itensPorModulo = await buscarItensPorModulos(supabase, modulos.map((m) => m.id));

  const seriesTrilhas: Serie[] = trilhas.map((t) => {
    const visual = visualDaTrilha(t.nome);
    return {
      id: t.id,
      tipo: "trilha",
      titulo: t.nome,
      descricao: null,
      capaUrl: t.capaUrl,
      gradiente: visual.gradiente,
      cor: visual.cor,
      icone: visual.icone,
      categoria: null,
      destaque: false,
      bloqueado: false,
      episodios: (aulasPorTrilha[t.id] ?? [])
        .filter((a) => a.realizada)
        .sort((a, b) => a.ordem - b.ordem)
        .map((a) => ({
          id: a.id,
          tipo: "aula" as const,
          ordem: a.ordem,
          titulo: a.tema,
          resumo: a.resumo ?? a.descricao,
          videoUrl: a.videoUrl,
          arquivoUrl: null,
          instrutorNome: a.instrutorNome,
          data: a.data,
          marco: a.marco,
        })),
    };
  });

  // Módulo sem nenhum episódio ainda só aparece pro Diretor (pro time seria um
  // card vazio).
  const seriesModulos: Serie[] = modulos
    .filter((m) => isDiretor || (itensPorModulo[m.id] ?? []).length > 0)
    .map((m) => ({
      id: m.id,
      tipo: "modulo" as const,
      titulo: m.titulo,
      descricao: m.descricao,
      capaUrl: m.capaUrl,
      gradiente: GRADIENTE_MODULO,
      cor: "#c9a227",
      icone: "🎬",
      categoria: m.categoria,
      destaque: m.destaque,
      bloqueado: !isDiretor && !moduloLiberadoPara(m, meuRank),
      episodios: (itensPorModulo[m.id] ?? []).map((i) => ({
        id: i.id,
        tipo: "item" as const,
        ordem: i.ordem,
        titulo: i.titulo,
        resumo: i.resumo,
        videoUrl: i.videoUrl,
        arquivoUrl: i.arquivoUrl,
        instrutorNome: null,
        data: null,
        marco: false,
      })),
    }));

  const series = [...seriesTrilhas, ...seriesModulos];
  const idsAulas = series.filter((s) => s.tipo === "trilha").flatMap((s) => s.episodios.map((e) => e.id));
  const idsItens = series.filter((s) => s.tipo === "modulo").flatMap((s) => s.episodios.map((e) => e.id));
  const assistidos = await buscarAssistidos(supabase, userId, idsAulas, idsItens);

  return { series, assistidos, isDiretor, categorias: CATEGORIAS_MODULO };
}
