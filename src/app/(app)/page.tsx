import { createClient } from "@/lib/supabase/server";
import MuralForm from "./mural-form";
import Card from "@/components/ui/Card";
import Laurel from "@/components/ui/Laurel";
import BarraMeta from "@/components/ui/BarraMeta";
import ConfrontoWidget from "@/components/ui/Confronto";
import EnquetePoll, { type EnqueteData } from "@/components/ui/EnquetePoll";
import CentralNotificacoes from "@/components/CentralNotificacoes";
import { IconSwords, IconShield, IconCoin } from "@/components/ui/icons";
import { buscarConfrontoExercitos, buscarConfrontoTribos, buscarTopCredito, buscarCrestsTribos } from "@/lib/guerra";
import { buscarMetaIndividual } from "@/lib/metas";
import { buscarCampanhasAtivas, type CampanhaComProgresso } from "@/lib/campanhas";
import { FUNNEL_LABELS, type FunilEtapa } from "@/lib/funil";
import { getViewerContext } from "@/lib/preview";

export default async function MuralPage() {
  const supabase = await createClient();

  // Preview-aware: se o Diretor tá pré-visualizando como outra pessoa, o Mural
  // (igual Forecast/Comissão/Minha Produção) mostra os dados DELA, não os
  // dele — antes essa página ignorava a pré-visualização inteira.
  const viewer = await getViewerContext(supabase);
  if (!viewer) return null;
  const meId = viewer.effectiveId;
  const meRole = viewer.effectiveRole;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, avatar_emoji, avatar_url, role, rank, stars_total, tribo:tribos!profiles_tribo_id_fkey(id, nome, exercito:exercitos(nome))"
    )
    .eq("id", meId)
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
    .eq("profile_id", meId)
    .eq("data", hoje)
    .maybeSingle();

  const inicioMes = hoje.slice(0, 7) + "-01";
  const { data: vendasMes } = await supabase
    .from("vendas")
    .select("valor")
    .eq("profile_id", meId)
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

  const { metaCreditoIndividual: metaIndividual } = await buscarMetaIndividual(supabase, meId);

  const campanhasAtivas = await buscarCampanhasAtivas(supabase);

  const ehExecutivo = meRole === "sdr" || meRole === "closer";

  // Central de Notificações: Diretor vê a firma inteira (sem escopo), Líder só
  // o próprio Exército, Closer só a própria Tribo. Líder não tem tribo_id (lidera
  // o Exército inteiro, não uma Tribo) — resolve via exercitos.legado_id.
  const triboAtual = profile?.tribo as unknown as { id: string; nome: string; exercito: { nome: string } | null } | null;
  let escopoCentral: { tipo: "exercito"; exercitoId: string } | { tipo: "tribo"; triboId: string } | null = null;
  if (meRole === "lider") {
    const { data: exercitoLiderado } = await supabase.from("exercitos").select("id").eq("legado_id", meId).maybeSingle();
    if (exercitoLiderado) escopoCentral = { tipo: "exercito", exercitoId: exercitoLiderado.id };
  } else if (meRole === "closer" && triboAtual?.id) {
    escopoCentral = { tipo: "tribo", triboId: triboAtual.id };
  }

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
        (votosRows ?? []).find((v) => v.enquete_id === e.id && v.profile_id === meId)?.opcao_id ?? null;
      enquetesPorPost.set(e.mural_post_id, { enqueteId: e.id, opcoes, totalVotos, meuVoto });
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-center gap-4">
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt={profile.full_name}
            className="h-20 w-20 shrink-0 rounded-full border-2 border-gold/50 object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-gold/50 bg-imperium-bg font-display text-2xl text-gold">
            {(profile?.full_name ?? "?")
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((p: string) => p[0])
              .join("")
              .toUpperCase()}
          </div>
        )}
        <p className="font-display text-2xl text-gold-bright">
          Salve, {profile?.full_name?.split(" ")[0] ?? "executivo"}.
        </p>
      </div>

      {(meRole === "diretor" || meRole === "lider" || meRole === "closer") && (
        <CentralNotificacoes escopo={escopoCentral} />
      )}

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
          <p className="kicker mb-3">Oráculo</p>
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

      {campanhasAtivas.length > 0 && (
        <div className="space-y-2">
          <CampanhasCard campanhas={campanhasAtivas} />
          {(meRole === "lider" || meRole === "diretor") && (
            <a
              href="/campanhas"
              className="block rounded border border-imperium-line px-3 py-2 text-center text-xs text-gold transition hover:border-gold hover:bg-gold/10"
            >
              + Gerenciar campanhas
            </a>
          )}
        </div>
      )}

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

      {meRole !== "sdr" && (
        <Card title="Publicar no Mural">
          <MuralForm podeAviso={meRole === "lider" || meRole === "diretor"} podeEnquete={meRole === "diretor"} />
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
                  id={`post-${post.id}`}
                  className="flex gap-4 rounded border border-imperium-line bg-imperium-bg/40 p-4 scroll-mt-20"
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

function CampanhasCard({ campanhas }: { campanhas: CampanhaComProgresso[] }) {
  return (
    <Card title="Campanhas do mês">
      <div className="grid gap-4 sm:grid-cols-2">
        {campanhas.map((c) => {
          const metricaLabel = c.metrica === "credito" ? "R$" : FUNNEL_LABELS[c.metrica as FunilEtapa] ?? c.metrica;
          const fmt = (v: number) =>
            c.metrica === "credito"
              ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
              : `${v} ${metricaLabel}`;
          const max = Math.max(...c.participantes.map((p) => p.valor), c.metaValor ?? 0, 1);

          return (
            <div key={c.id} className="overflow-hidden rounded-lg border border-gold/30">
              {c.imagemUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.imagemUrl} alt={c.titulo} className="h-32 w-full object-cover" />
              )}
              <div className="p-3">
                <p className="font-display text-base text-gold-bright">{c.titulo}</p>
                {c.descricao && <p className="mt-1 text-xs text-stone-400">{c.descricao}</p>}
                <p className="mt-1 text-[10px] uppercase tracking-wide text-stone-600">
                  até {new Date(c.dataFim + "T00:00:00").toLocaleDateString("pt-BR")}
                </p>

                <div className="mt-3 space-y-2">
                  {c.participantes.map((p, i) => (
                    <div key={p.refId}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className={i === 0 && c.alvo !== "geral" ? "text-gold-bright" : "text-stone-300"}>
                          {i === 0 && c.alvo !== "geral" && "👑 "}
                          {p.label}
                        </span>
                        <span className="text-stone-400">
                          {fmt(p.valor)}
                          {c.metaValor ? ` / ${fmt(c.metaValor)}` : ""}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-imperium-line">
                        <div
                          className={`h-full rounded-full ${
                            i === 0 ? "bg-gradient-to-r from-gold to-gold-bright" : "bg-wine"
                          }`}
                          style={{ width: `${Math.min(100, (p.valor / max) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
