import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, COMPROMISSO_STATUS_LABELS } from "@/lib/labels";
import { publicarMural } from "./mural-actions";

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
      "full_name, avatar_emoji, role, rank, tribo:tribos!profiles_tribo_id_fkey(nome, exercito:exercitos(nome))"
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

  const { data: quotes } = await supabase
    .from("sage_quotes")
    .select("texto, fonte")
    .eq("ativo", true);

  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const quote =
    quotes && quotes.length > 0 ? quotes[dayOfYear % quotes.length] : null;

  return (
    <>
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <h1 className="font-serif text-xl text-amber-400">Mural</h1>
        {quote && (
          <section className="rounded-lg border border-amber-500/20 bg-[#111827] p-6 text-center">
            <p className="mb-2 text-xs uppercase tracking-widest text-amber-500">
              Conselho do Sábio
            </p>
            <p className="font-serif text-lg italic text-stone-100">“{quote.texto}”</p>
            <p className="mt-2 text-xs text-stone-500">{quote.fonte}</p>
          </section>
        )}

        {(profile?.role === "sdr" || profile?.role === "closer") && (
        <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-400">
            Compromisso de hoje
          </h2>
          {compromissoHoje ? (
            <div className="flex gap-6 text-sm">
              <div>
                <p className="text-stone-500">Status</p>
                <p className="text-stone-100">
                  {COMPROMISSO_STATUS_LABELS[compromissoHoje.status]}
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
              Você ainda não lançou o compromisso de hoje.
            </p>
          )}
        </section>
        )}

        {(profile?.role === "closer" || profile?.role === "lider" || profile?.role === "diretor") && (
          <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-400">
              Publicar no Mural
            </h2>
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
              <input
                name="titulo"
                required
                placeholder="Título"
                className="w-full rounded border border-stone-700 bg-[#0b0f19] px-3 py-2 text-stone-100"
              />
              <textarea
                name="corpo"
                placeholder="Mensagem (opcional)"
                rows={2}
                className="w-full rounded border border-stone-700 bg-[#0b0f19] px-3 py-2 text-stone-100"
              />
              <button
                type="submit"
                className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-[#0b0f19] hover:bg-amber-400"
              >
                Publicar
              </button>
            </form>
          </section>
        )}

        <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-stone-400">
            Avisos e reconhecimentos
          </h2>
          {muralPosts && muralPosts.length > 0 ? (
            <ul className="space-y-3">
              {muralPosts.map((post) => (
                <li key={post.id} className="border-b border-stone-800 pb-3 last:border-0">
                  <p className="text-sm text-stone-100">{post.titulo}</p>
                  {post.corpo && <p className="text-xs text-stone-400">{post.corpo}</p>}
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-stone-600">
                    {post.tipo === "aviso" ? "Aviso" : "Reconhecimento"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-500">Nenhum aviso publicado ainda.</p>
          )}
        </section>

        <p className="text-center text-xs text-stone-600">
          Logado como {profile ? ROLE_LABELS[profile.role] : ""} · dados de produção
          aparecem aqui assim que a integração com o Sheets estiver ligada.
        </p>
      </main>
    </>
  );
}
