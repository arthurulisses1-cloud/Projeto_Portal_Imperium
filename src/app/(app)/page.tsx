import { createClient } from "@/lib/supabase/server";
import MuralForm from "./mural-form";
import Card from "@/components/ui/Card";
import Laurel from "@/components/ui/Laurel";
import RankBadge from "@/components/ui/RankBadge";
import BarraMeta from "@/components/ui/BarraMeta";
import ConfrontoWidget from "@/components/ui/Confronto";
import EnquetePoll, { type EnqueteData } from "@/components/ui/EnquetePoll";
import { IconSwords, IconShield, IconCoin } from "@/components/ui/icons";
import { buscarConfrontoExercitos, buscarConfrontoTribos, buscarTopCredito, buscarCrestsTribos } from "@/lib/guerra";
import { buscarMetaIndividual } from "@/lib/metas";

export default async function MuralPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // middleware já garante que existe um user aqui, mas o TS não sabe disso
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, avatar_emoji, role, rank, stars_total, tribo:tribos!profiles_tribo_id_fkey(id, nome, exercito:exercitos(nome))"
    )
    .eq("id", user.id)
    .single();

  const { data: muralPosts } = await supabase
    .from("mural_posts")
    .select("id, tipo, titulo, corpo, midia_url, created_at, autor:profiles!mural_posts_autor_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(8);

  const hoje = new Date().toISOString().slice(0, 10);
  const { data: compromissoHoje } = await supabase
    .from("compromissos")
    .select("*")
    .eq("profile_id", user.id)
    .eq("data", hoje)
    .maybeSingle();

  const inicioMes = hoje.slice(0, 7) + "-01";
  const { data: vendasMes } = await supabase
    .from("vendas")
    .select("valor")
    .eq("profile_id", user.id)
    .gte("data", inicioMes);
  const pagosMes = (vendasMes ?? []).reduce((s, v) => s + Number(v.valor), 0);

  const { data: quotes } = await supabase
    .from("sage_quotes")
    .select("texto, fonte")
    .eq("ativo", true);

  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const quote =
    quotes && quotes.length > 0 ? quotes[dayOfYear % quotes.length] : null;

  const [confrontoExercitos, confrontoTribos, topCredito, crestsTribos] = await Promise.all([
    buscarConfrontoExercitos(supabase),
    buscarConfrontoTribos(supabase),
    buscarTopCredito(supabase, 5),
    buscarCrestsTribos(supabase),
  ]);

  const { metaCreditoIndividual: metaIndividual } = await buscarMetaIndividual(supabase, user.id);

  const ehExecutivo = profile?.role === "sdr" || profile?.role === "closer";

  // Enquetes: pré-computa opções + votos dos posts do tipo 'enquete' já carregados
  const enquetePostIds = (muralPosts ?? []).filter((p) => p.tipo === "enquete").map((p) => p.id);
  const enquetesPorPost = new Map<string, EnqueteData>();
  if (enquetePostIds.length > 0) {
    const { data: enquetesRows } = await supabase
      .from("enquetes")
      .select("id, mural_post_id")
      .in("mural_post_id", enquetePostIds);
    const enqueteIds = (enquetesRows ?? []).map((e) => e.id);
    const [{ data: opcoesRows }, { data: votosRows }] = await Promise.all([
      supabase.from("enquete_opcoes").select("id, enquete_id, texto, ordem").in("enquete_id", enqueteIds).order("ordem"),
      supabase.from("enquete_votos").select("enquete_id, opcao_id, profile_id").in("enquete_id", enqueteIds),
    ]);
    for (const e of enquetesRows ?? []) {
      const opcoes = (opcoesRows ?? [])
        .filter((o) => o.enquete_id === e.id)
        .map((o) => ({
          id: o.id,
          texto: o.texto,
          votos: (votosRows ?? []).filter((v) => v.opcao_id === o.id).length,
        }));
      const totalVotos = opcoes.reduce((s, o) => s + o.votos, 0);
      const meuVoto =
        (votosRows ?? []).find((v) => v.enquete_id === e.id && v.profile_id === user.id)?.opcao_id ?? null;
      enquetesPorPost.set(e.mural_post_id, { enqueteId: e.id, opcoes, totalVotos, meuVoto });
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-center gap-4">
        {profile && <RankBadge rank={profile.rank} size="lg" />}
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Mural</h1>
          <p className="text-sm text-stone-400">
            Salve, {profile?.full_name?.split(" ")[0] ?? "executivo"}.
          </p>
        </div>
      </div>

      {ehExecutivo && !compromissoHoje && new Date().getHours() >= 14 && (
        <div className="rounded border border-wine/50 bg-wine/10 px-4 py-3 text-sm text-wine-bright">
          ⚠ Você ainda não lançou o compromisso de hoje.{" "}
          <a href="/compromisso" className="underline hover:text-gold-bright">
            Lançar agora
          </a>
        </div>
      )}

      {ehExecutivo && metaIndividual > 0 && (
        <Card title="Meta do mês">
          <BarraMeta realizado={pagosMes} meta={metaIndividual} />
        </Card>
      )}

      {quote && (
        <Card className="watermark-spqr text-center">
          <p className="kicker mb-3">Conselho do Sábio</p>
          <p className="font-serif text-xl italic text-stone-100">&quot;{quote.texto}&quot;</p>
          <Laurel className="mx-auto my-3 h-3 w-24 text-gold/40" />
          <p className="text-xs text-stone-500">{quote.fonte}</p>
        </Card>
      )}

      <div className="grid gap-6 sm:grid-cols-3">
        <Card title="Guerra Civil" icon={<IconSwords className="h-4 w-4 text-wine-bright" />}>
          <ConfrontoWidget
            dados={confrontoExercitos}
            crests={{ Templários: "/crests/templarios.jpg", Maximus: "/crests/maximus.jpg" }}
          />
        </Card>

        <Card title="Guerra de Tribos" icon={<IconShield className="h-4 w-4 text-gold" />}>
          <ConfrontoWidget dados={confrontoTribos} crests={crestsTribos} />
        </Card>

        <Card title="Ranking de Crédito" icon={<IconCoin className="h-4 w-4 text-gold" />}>
          <ConfrontoWidget dados={topCredito} />
        </Card>
      </div>

      {ehExecutivo && (
        <Card title="Compromisso de hoje">
          {compromissoHoje ? (
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-stone-500">Status</p>
                <p className="font-medium text-gold">
                  {compromissoHoje.status === "cumprido"
                    ? "Cumprido"
                    : compromissoHoje.status === "nao_cumprido"
                      ? "Não cumprido"
                      : "Em andamento"}
                </p>
              </div>
              <div>
                <p className="text-stone-500">Entrevistas</p>
                <p className="text-stone-100">
                  {compromissoHoje.entrevistas_real}/{compromissoHoje.entrevistas_comp}
                </p>
              </div>
              <div>
                <p className="text-stone-500">Assinaturas</p>
                <p className="text-stone-100">
                  {compromissoHoje.assinaturas_real}/{compromissoHoje.assinaturas_comp}
                </p>
              </div>
              <div>
                <p className="text-stone-500">Pagos</p>
                <p className="text-stone-100">
                  {compromissoHoje.pagos_real}/{compromissoHoje.pagos_comp}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-stone-500">
              Você ainda não lançou o compromisso de hoje.{" "}
              <a href="/compromisso" className="text-gold hover:underline">
                Lançar agora
              </a>
            </p>
          )}
        </Card>
      )}

      {(profile?.role === "closer" || profile?.role === "lider" || profile?.role === "diretor") && (
        <Card title="Publicar no Mural">
          <MuralForm
            podeAviso={profile?.role === "lider" || profile?.role === "diretor"}
            podeEnquete={profile?.role === "diretor"}
          />
        </Card>
      )}

      <Card title="Avisos e Reconhecimentos">
        {muralPosts && muralPosts.length > 0 ? (
          <ul className="space-y-4">
            {muralPosts.map((post) => {
              const autor = post.autor as unknown as { full_name: string } | null;
              return (
                <li
                  key={post.id}
                  className="flex gap-4 rounded border border-imperium-line bg-imperium-bg/40 p-4"
                >
                  <span className="text-2xl">
                    {post.tipo === "aviso" ? "📯" : post.tipo === "enquete" ? "🗳️" : "🏅"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display text-base text-gold-bright">{post.titulo}</p>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-stone-600">
                        {post.tipo === "aviso" ? "Aviso" : post.tipo === "enquete" ? "Enquete" : "Reconhecimento"}
                      </span>
                    </div>
                    {post.corpo && <p className="mt-1 text-sm text-stone-300">{post.corpo}</p>}
                    {post.midia_url &&
                      (/\.(mp4|webm|mov|m4v)$/i.test(post.midia_url) ? (
                        <video
                          src={post.midia_url}
                          controls
                          className="mt-3 max-h-64 rounded border border-imperium-line"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.midia_url}
                          alt=""
                          className="mt-3 max-h-64 rounded border border-imperium-line object-cover"
                        />
                      ))}
                    {post.tipo === "enquete" && enquetesPorPost.get(post.id) && (
                      <EnquetePoll dados={enquetesPorPost.get(post.id)!} />
                    )}
                    <p className="mt-2 text-xs text-stone-600">
                      {autor?.full_name ?? "Gestão"} ·{" "}
                      {new Date(post.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">Nenhum aviso publicado ainda.</p>
        )}
      </Card>
    </main>
  );
}
