import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import AppNav, { type NavEntry } from "@/components/ui/AppNav";
import NoticiasCompactas from "@/components/ui/NoticiasCompactas";
import CampanhasCompactas from "@/components/ui/CampanhasCompactas";
import SidebarRight from "@/components/ui/SidebarRight";
import UserMenu from "@/components/ui/UserMenu";
import MencoesBell from "@/components/ui/MencoesBell";
import { limparPreview } from "./preview-actions";
import { IconLaurel, IconEye } from "@/components/ui/icons";
import { buscarPendencias } from "@/lib/pendencias";
import { buscarMencoesPendentes } from "@/lib/social";
import { logErroSupabase } from "@/lib/log-erro-supabase";

export const dynamic = "force-dynamic";

type NavConfigEntry = (NavEntry | { type: "group"; label: string; items: { href: string; label: string }[] }) & {
  roles: string[];
};

// Central de Notificações agora vive dentro do Mural (não é mais aba própria);
// Visão Geral da Firma saiu (a Weekly de Receita cobre o mesmo terreno);
// Campanhas virou um atalho na lateral do Mural em vez de aba fixa.
const NAV_ITEMS: NavConfigEntry[] = [
  { type: "link", href: "/", label: "Mural", roles: ["sdr", "closer", "lider", "diretor"] },
  { type: "link", href: "/compromisso", label: "Compromisso", roles: ["sdr", "closer"] },
  { type: "link", href: "/producao", label: "Minha Produção", roles: ["sdr", "closer"] },
  { type: "link", href: "/tribo", label: "Minha Tribo", roles: ["closer"] },
  { type: "link", href: "/exercito", label: "Meu Exército", roles: ["lider"] },
  { type: "link", href: "/minha-producao", label: "Minha Produção", roles: ["lider"] },
  { type: "link", href: "/carreira", label: "Plano de Carreira", roles: ["sdr", "closer", "lider"] },
  { type: "link", href: "/estrelas", label: "Estrelas", roles: ["sdr", "closer"] },
  { type: "link", href: "/comissao", label: "Comissão do Mês", roles: ["sdr", "closer", "lider"] },
  { type: "link", href: "/ranking", label: "Ranking", roles: ["sdr", "closer", "lider", "diretor"] },
  { type: "link", href: "/forecast", label: "Forecast", roles: ["closer", "lider", "diretor"] },
  { type: "link", href: "/weekly", label: "Weekly de Receita", roles: ["lider", "diretor"] },
  { type: "link", href: "/trilha", label: "Trilha de Formação", roles: ["sdr", "closer", "lider"] },
  { type: "link", href: "/minerva", label: "Minerva", roles: ["sdr", "closer", "lider", "diretor"] },
  { type: "link", href: "/auditoria", label: "Auditoria", roles: ["diretor"] },
  {
    type: "group",
    label: "Pessoas",
    roles: ["diretor"],
    items: [
      { href: "/legado", label: "Meu Legado" },
      { href: "/gestao", label: "Gestão de Pessoas" },
    ],
  },
  { type: "link", href: "/metas", label: "Metas Mensais", roles: ["diretor"] },
  {
    type: "group",
    label: "Validações",
    roles: ["diretor"],
    items: [
      { href: "/validacao", label: "Fila de Validação" },
      { href: "/aprovacoes", label: "Aprovações de Carreira" },
      { href: "/contestacoes", label: "Fila de Contestação" },
    ],
  },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile, error: profileError } = user
    ? await supabase
        .from("profiles")
        .select("full_name, role, rank, avatar_url, tribo_id")
        .eq("id", user.id)
        .single()
    : { data: null, error: null };
  logErroSupabase(`AppLayout: profiles (id=${user?.id})`, profileError);

  const cookieStore = await cookies();

  // Pré-visualização (Diretor virar outra pessoa/papel pra revisar telas)
  // foi desativada a pedido (2026-08-22) — "só quero usar minha conta como
  // Diretor". Continua lendo preview_profile_id só de forma defensiva, pra
  // não deixar ninguém preso numa pré-visualização antiga sem UI pra sair
  // (o botão "Sair da pré-visualização" abaixo ainda cobre esse caso) — mas
  // não existe mais nenhum jeito de ATIVAR isso pela UI, e o cookie
  // "view_role" nem é mais lido, então "ver como <papel genérico>" some de
  // vez, mesmo que um cookie antigo ainda exista no navegador.
  const previewProfileId = profile?.role === "diretor" ? cookieStore.get("preview_profile_id")?.value ?? null : null;
  let previewPessoa: { id: string; nome: string; role: string; tribo_id: string | null } | null = null;
  if (profile?.role === "diretor" && previewProfileId) {
    const { data: encontrada } = await supabase
      .from("profiles")
      .select("id, full_name, role, tribo_id")
      .eq("id", previewProfileId)
      .maybeSingle();
    if (encontrada) previewPessoa = { id: encontrada.id, nome: encontrada.full_name, role: encontrada.role, tribo_id: encontrada.tribo_id };
  }

  const papelVisualizado = previewPessoa?.role ?? profile?.role;

  const itensVisiveis: NavEntry[] = NAV_ITEMS.filter(
    (item) => !profile || item.roles.includes(papelVisualizado ?? profile.role)
  ).map((entry) => {
    const { roles, ...rest } = entry;
    void roles;
    return rest;
  });

  const ehExecutivo = papelVisualizado === "sdr" || papelVisualizado === "closer" || papelVisualizado === "lider";
  // Diretor também ganha a lateral (2026-08-22, a pedido) — o conteúdo já
  // degrada bem pro papel dele (Cargo/Comissão do mês reaproveitam o que
  // já existia; Estrelas/Plano de Carreira/Minha Tribo simplesmente não
  // renderizam, porque já checavam role sdr/closer/lider antes disso).
  const mostraSidebarPapel = ehExecutivo || papelVisualizado === "diretor";
  // Antes a SidebarRight sumia no Mural pra SDR/Closer (reduzir densidade),
  // mas na prática isso lia como bug — quem loga pela primeira vez cai no
  // Mural e via a lateral "sumida", só aparecendo ao navegar pra outra
  // aba (2026-08-22, a pedido, depois de confirmado como confuso). Agora
  // aparece sempre, em toda rota, pra todo mundo.
  const mostraSidebarRight = true;

  const pendencias =
    user && profile
      ? await buscarPendencias(
          supabase,
          previewPessoa?.id ?? user.id,
          previewPessoa?.role ?? profile.role,
          previewPessoa?.tribo_id ?? profile.tribo_id
        )
      : {};

  // post_mencoes é da migration 0036 — se ainda não rodou nesse banco, o
  // select simplesmente retorna erro (Supabase não lança), buscarMencoesPendentes
  // já trata como lista vazia em vez de quebrar o layout inteiro.
  const mencoesPendentes = user ? await buscarMencoesPendentes(supabase, previewPessoa?.id ?? user.id) : [];

  return (
    <div className="flex min-h-screen">
      {user && (
        <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-imperium-line bg-imperium-surface">
          <div className="watermark-spqr flex items-center gap-2 border-b border-imperium-line p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/crests/senatus.webp"
              alt="Senatus"
              className="h-9 w-9 shrink-0 rounded-full border border-gold/40 object-cover"
            />
            <div className="min-w-0">
              <p className="truncate font-display text-xs tracking-wide text-gold-bright">
                SENATUS
              </p>
              <p className="truncate text-[9px] uppercase tracking-widest text-stone-500">
                Matri Bank · Imperium
              </p>
            </div>
          </div>

          <div className="overflow-y-auto p-3">
            <AppNav items={itensVisiveis} pendencias={pendencias} />
          </div>

          <NoticiasCompactas />
          <CampanhasCompactas />
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {previewPessoa && (
          <div className="flex items-center justify-between gap-3 border-b border-gold/40 bg-gold/10 px-6 py-2 text-xs text-gold-bright">
            <span className="flex items-center gap-1.5">
              <IconEye className="h-3.5 w-3.5 shrink-0" /> Pré-visualizando como <b>{previewPessoa.nome}</b> — os dados nas telas pessoais são dela(e), não seus.
            </span>
            <form action={limparPreview}>
              <button type="submit" className="rounded border border-gold/40 px-2 py-1 text-[10px] uppercase hover:bg-gold/20">
                Sair da pré-visualização
              </button>
            </form>
          </div>
        )}
        <header className="flex items-center justify-end gap-3 border-b border-imperium-line bg-imperium-surface px-6 py-3">
          {user && <MencoesBell mencoes={mencoesPendentes} />}
          {user && (
            <UserMenu
              avatarUrl={profile?.avatar_url ?? null}
              nome={profile?.full_name ?? user.email ?? "?"}
              role={profile?.role}
            />
          )}
        </header>

        <div className="flex flex-1">
          <div className="min-w-0 flex-1">{children}</div>
          {user && mostraSidebarPapel && mostraSidebarRight && <SidebarRight userId={previewPessoa?.id ?? user.id} />}
        </div>

        <footer className="flex items-center justify-center gap-3 py-6">
          <IconLaurel className="h-3 w-6 -scale-x-100 text-imperium-line-strong" />
          <p className="font-display text-[11px] tracking-[0.3em] text-imperium-line-strong">
            ESSE QUAM VIDERI
          </p>
          <IconLaurel className="h-3 w-6 text-imperium-line-strong" />
        </footer>
      </div>
    </div>
  );
}
