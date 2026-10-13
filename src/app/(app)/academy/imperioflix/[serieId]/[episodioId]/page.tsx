import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { carregarCatalogo } from "@/lib/imperioflix";
import { buscarMateriais, buscarMateriaisDoItem, buscarComplementos, buscarAssistidos } from "@/lib/academy";
import { buscarComentarios, buscarReacoes } from "@/lib/social";
import PlayerView from "@/components/imperioflix/PlayerView";
import type { Recurso } from "@/components/imperioflix/MateriaisPainel";

// Página da aula (padrão G4/Conquer): player grande com a lista de aulas ao
// lado, abas Visão geral / Materiais / Comentários e navegação entre aulas.
export default async function AulaPage({ params }: { params: { serieId: string; episodioId: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const catalogo = await carregarCatalogo(supabase, user.id);
  const serie = catalogo.series.find((s) => s.id === params.serieId);
  if (!serie) notFound();
  if (serie.bloqueado) redirect(`/academy/imperioflix/${serie.id}`);
  const indice = serie.episodios.findIndex((e) => e.id === params.episodioId);
  if (indice < 0) notFound();
  const episodio = serie.episodios[indice];

  const alvoTipo = episodio.tipo === "aula" ? "academy_aula" : "academy_modulo_item";
  const [comentariosMap, reacoesMap, materiaisBrutos, complementosBrutos, { data: pessoas }] = await Promise.all([
    buscarComentarios(supabase, alvoTipo, [episodio.id]),
    buscarReacoes(supabase, alvoTipo, [episodio.id], user.id),
    episodio.tipo === "aula" ? buscarMateriais(supabase, episodio.id) : buscarMateriaisDoItem(supabase, episodio.id),
    buscarComplementos(supabase, alvoTipo, episodio.id),
    supabase.from("profiles").select("id, full_name").eq("ativo", true),
  ]);

  const materiais: Recurso[] = materiaisBrutos.map((m) => ({
    id: m.id,
    titulo: m.nome,
    url: m.url,
    tipo: "arquivo",
    autorId: m.enviadoPorId ?? null,
    autorNome: m.enviadoPorNome,
  }));
  if (episodio.tipo === "item" && episodio.arquivoUrl) {
    materiais.unshift({ id: `arquivo-${episodio.id}`, titulo: "Material da aula", url: episodio.arquivoUrl, tipo: "arquivo", autorId: null, legado: true });
  }
  const complementos: Recurso[] = complementosBrutos.map((c) => ({
    id: c.id,
    titulo: c.titulo,
    url: c.url,
    tipo: c.tipo,
    autorId: c.enviadoPorId,
  }));

  // Check de "visto" dos materiais e complementares (academy_progresso).
  const idsRecursos = [...materiais.filter((m) => !m.legado).map((m) => m.id), ...complementos.map((c) => c.id)];
  const recursosVistos = await buscarAssistidos(supabase, user.id, idsRecursos, []);

  // Quem pode enviar/adicionar: Diretor e o instrutor da própria aula.
  const podeGerenciar = catalogo.isDiretor || (episodio.tipo === "aula" && episodio.instrutorId === user.id);

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <PlayerView
        serie={serie}
        episodio={episodio}
        indice={indice}
        vistos={Array.from(catalogo.assistidos)}
        materiais={materiais}
        complementos={complementos}
        recursosVistos={Array.from(recursosVistos)}
        podeGerenciar={podeGerenciar}
        comentarios={comentariosMap.get(episodio.id) ?? []}
        reacoes={reacoesMap.get(episodio.id) ?? { porEmoji: [], minhaReacao: null }}
        meId={user.id}
        isDiretor={catalogo.isDiretor}
        pessoas={(pessoas ?? []).map((p) => ({ id: p.id, nome: p.full_name }))}
      />
    </main>
  );
}
