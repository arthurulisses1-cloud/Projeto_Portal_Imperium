import { createClient } from "@/lib/supabase/server";
import { COMPROMISSO_STATUS_LABELS } from "@/lib/labels";
import { publicarMural } from "./mural-actions";
import Card from "@/components/ui/Card";
import Laurel from "@/components/ui/Laurel";
import Bussola from "@/components/ui/Bussola";
import RankBadge from "@/components/ui/RankBadge";
import BarraMeta from "@/components/ui/BarraMeta";
import ConfrontoWidget from "@/components/ui/Confronto";
import { buscarConfrontoExercitos, buscarConfrontoTribos, buscarTopCredito } from "@/lib/guerra";

const STATUS_TONE: Record<string, "good" | "warn" | "gold"> = {
  cumprido: "good",
  andamento: "gold",
  nao_cumprido: "warn",
};

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
    .select("id, tipo, titulo, corpo, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

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

  const [confrontoExercitos, confrontoTribos, topCredito] = await Promise.all([
    buscarConfrontoExercitos(supabase),
    buscarConfrontoTribos(supabase),
    buscarTopCredito(supabase, 5),
  ]);

  // meta individual: meta de crédito da firma dividida por Exército → Tribo → membros da Tribo
  let metaIndividual = 0;
  const triboId = (profile?.tribo as unknown as { id?: string } | null)?.id;
  if (triboId) {
    const { data: triboRow } = await supabase
      .from("tribos")
      .select("id, exercito_id")
      .eq("id", triboId)
      .single();
    if (triboRow) {
      const agora = new Date();
      const [{ data: metaMes }, { count: numExercitos }, { count: numTribos }, { count: numMembros }] =
        await Promise.all([
          supabase
            .from("metas_mensais")
            .select("meta_credito_total")
            .eq("ano", agora.getFullYear())
            .eq("mes", agora.getMonth() + 1)
            .maybeSingle(),
          supabase.from("exercitos").select("id", { count: "exact", head: true }),
          supabase
            .from("tribos")
            .select("id", { count: "exact", head: true })
            .eq("exercito_id", triboRow.exercito_id),
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("tribo_id", triboRow.id)
            .in("role", ["sdr", "closer"]),
        ]);
      const metaCredito = metaMes?.meta_credito_total ?? 0;
      if (metaCredito > 0 && numExercitos && numTribos && numMembros) {
        metaIndividual = metaCredito / numExercitos / numTribos / numMembros;
      }
    }
  }

  const ehExecutivo = profile?.role === "sdr" || profile?.role === "closer";
  const statusHoje = compromissoHoje
    ? COMPROMISSO_STATUS_LABELS[compromissoHoje.status]
    : "Não lançado";
  const statusTone = compromissoHoje ? STATUS_TONE[compromissoHoje.status] : "muted";

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

      <Card>
        <Bussola
          items={
            ehExecutivo
              ? [
                  { label: "Estrelas", value: String(profile?.stars_total ?? 0), tone: "gold" },
                  {
                    label: "Compromisso hoje",
                    value: statusHoje,
                    tone: statusTone as "good" | "warn" | "gold" | "muted",
                  },
                  {
                    label: "Pagos no mês",
                    value: pagosMes.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                      maximumFractionDigits: 0,
                    }),
                    tone: "gold",
                  },
                ]
              : [
                  { label: "Estrelas", value: String(profile?.stars_total ?? 0), tone: "gold" },
                  { label: "Nível", value: profile ? profile.rank.toUpperCase() : "—", tone: "muted" },
                  {
                    label: "Pagos no mês",
                    value: pagosMes.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                      maximumFractionDigits: 0,
                    }),
                    tone: "gold",
                  },
                ]
          }
        />
      </Card>

      {ehExecutivo && metaIndividual > 0 && (
        <Card title="Meta do mês">
          <BarraMeta realizado={pagosMes} meta={metaIndividual} />
        </Card>
      )}

      <Card title="Guerra Civil — Exércitos">
        <ConfrontoWidget
          dados={confrontoExercitos}
          crests={{ Templários: "/crests/templarios.jpg", Maximus: "/crests/maximus.jpg" }}
        />
      </Card>

      <Card title="Guerra de Tribos">
        <ConfrontoWidget dados={confrontoTribos} />
      </Card>

      <Card title="Ranking Individual de Crédito — Top 5">
        <ConfrontoWidget dados={topCredito} />
      </Card>

      {quote && (
        <Card className="watermark-spqr text-center">
          <p className="kicker mb-3">Conselho do Sábio</p>
          <p className="font-serif text-xl italic text-stone-100">&quot;{quote.texto}&quot;</p>
          <Laurel className="mx-auto my-3 h-3 w-24 text-gold/40" />
          <p className="text-xs text-stone-500">{quote.fonte}</p>
        </Card>
      )}

      {ehExecutivo && (
        <Card title="Compromisso de hoje">
          {compromissoHoje ? (
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-stone-500">Status</p>
                <p className={`font-medium ${statusTone === "good" ? "text-emerald-400" : statusTone === "warn" ? "text-wine-bright" : "text-gold"}`}>
                  {statusHoje}
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
          <form action={publicarMural} className="space-y-3">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-stone-300">
                <input type="radio" name="tipo" value="reconhecimento" defaultChecked />
                Reconhecimento
              </label>
              {(profile?.role === "lider" || profile?.role === "diretor") && (
                <label className="flex items-center gap-2 text-sm text-stone-300">
                  <input type="radio" name="tipo" value="aviso" />
                  Aviso
                </label>
              )}
            </div>
            <input name="titulo" required placeholder="Título" className="input-imp" />
            <textarea
              name="corpo"
              placeholder="Mensagem (opcional)"
              rows={2}
              className="input-imp"
            />
            <button type="submit" className="btn-gold">
              Publicar
            </button>
          </form>
        </Card>
      )}

      <Card title="Avisos e reconhecimentos">
        {muralPosts && muralPosts.length > 0 ? (
          <ul className="space-y-3">
            {muralPosts.map((post) => (
              <li key={post.id} className="flex gap-3 border-b border-imperium-line pb-3 last:border-0">
                <span className="mt-0.5 text-gold">{post.tipo === "aviso" ? "📯" : "🏅"}</span>
                <div>
                  <p className="text-sm text-stone-100">{post.titulo}</p>
                  {post.corpo && <p className="text-xs text-stone-400">{post.corpo}</p>}
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-stone-600">
                    {post.tipo === "aviso" ? "Aviso" : "Reconhecimento"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">Nenhum aviso publicado ainda.</p>
        )}
      </Card>
    </main>
  );
}
