import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { carregarCatalogo } from "@/lib/imperioflix";
import { buscarMateriais } from "@/lib/academy";
import { buscarComentarios, buscarReacoes } from "@/lib/social";
import PlayerView, { type MaterialAula } from "@/components/imperioflix/PlayerView";

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
  const [comentariosMap, reacoesMap, materiaisAula, { data: pessoas }] = await Promise.all([
    buscarComentarios(supabase, alvoTipo, [episodio.id]),
    buscarReacoes(supabase, alvoTipo, [episodio.id], user.id),
    episodio.tipo === "aula" ? buscarMateriais(supabase, episodio.id) : Promise.resolve([]),
    supabase.from("profiles").select("id, full_name").eq("ativo", true),
  ]);

  const materiais: MaterialAula[] = materiaisAula.map((m) => ({ id: m.id, nome: m.nome, url: m.url, enviadoPorNome: m.enviadoPorNome }));
  if (episodio.tipo === "item" && episodio.arquivoUrl) {
    materiais.push({ id: `arquivo-${episodio.id}`, nome: "Material da aula", url: episodio.arquivoUrl, enviadoPorNome: null });
  }

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <PlayerView
        serie={serie}
        episodio={episodio}
        indice={indice}
        vistos={Array.from(catalogo.assistidos)}
        materiais={materiais}
        comentarios={comentariosMap.get(episodio.id) ?? []}
        reacoes={reacoesMap.get(episodio.id) ?? { porEmoji: [], minhaReacao: null }}
        meId={user.id}
        isDiretor={catalogo.isDiretor}
        pessoas={(pessoas ?? []).map((p) => ({ id: p.id, nome: p.full_name }))}
      />
    </main>
  );
}
