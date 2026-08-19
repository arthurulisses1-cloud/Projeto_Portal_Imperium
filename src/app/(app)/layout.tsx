import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import AppNav, { type NavEntry } from "@/components/ui/AppNav";
import NoticiasCompactas from "@/components/ui/NoticiasCompactas";
import SidebarRight from "@/components/ui/SidebarRight";
import UserMenu from "@/components/ui/UserMenu";
import VisualizacaoSelector from "@/components/ui/VisualizacaoSelector";
import { IconLaurel } from "@/components/ui/icons";
import { buscarPendencias } from "@/lib/pendencias";

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
  { type: "link", href: "/tarefas", label: "Follow-ups", roles: ["closer"] },
  { type: "link", href: "/exercito", label: "Meu Exército", roles: ["lider"] },
  { type: "link", href: "/minha-producao", label: "Minha Produção", roles: ["lider"] },
  { type: "link", href: "/carreira", label: "Plano de Carreira", roles: ["sdr", "closer", "lider"] },
  { type: "link", href: "/comissao", label: "Comissão do Mês", roles: ["sdr", "closer", "lider"] },
  { type: "link", href: "/ranking", label: "Ranking", roles: ["sdr", "closer", "lider", "diretor"] },
  { type: "link", href: "/forecast", label: "Forecast", roles: ["closer", "lider", "diretor"] },
  { type: "link", href: "/weekly", label: "Weekly de Receita", roles: ["lider", "diretor"] },
  { type: "link", href: "/trilha", label: "Trilha de Formação", roles: ["sdr", "closer", "lider"] },
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

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("full_name, role, rank, avatar_url, tribo_id")
        .eq("id", user.id)
        .single()
    : { data: null };

  // Diretor pode escolher "ver como" outro papel — troca só a lista de abas,
  // pra revisar qualquer tela antes do lançamento sem logar em outra conta.
  const cookieStore = await cookies();
  const papelVisualizado =
    profile?.role === "diretor" ? cookieStore.get("view_role")?.value || "diretor" : profile?.role;

  const itensVisiveis: NavEntry[] = NAV_ITEMS.filter(
    (item) => !profile || item.roles.includes(papelVisualizado ?? profile.role)
  ).map((entry) => {
    const { roles, ...rest } = entry;
    void roles;
    return rest;
  });

  const ehExecutivo = profile?.role === "sdr" || profile?.role === "closer";

  const pendencias =
    user && profile ? await buscarPendencias(supabase, user.id, profile.role, profile.tribo_id) : {};

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

          {profile?.role === "diretor" && <VisualizacaoSelector atual={papelVisualizado ?? "diretor"} />}

          <div className="overflow-y-auto p-3">
            <AppNav items={itensVisiveis} pendencias={pendencias} />
          </div>

          <NoticiasCompactas />
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-imperium-line bg-imperium-surface px-6 py-3">
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
          {user && ehExecutivo && <SidebarRight userId={user.id} />}
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
