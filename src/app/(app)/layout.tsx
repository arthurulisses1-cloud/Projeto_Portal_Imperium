import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import AppNav from "@/components/ui/AppNav";
import NoticiasCompactas from "@/components/ui/NoticiasCompactas";
import SidebarRight from "@/components/ui/SidebarRight";
import UserMenu from "@/components/ui/UserMenu";
import VisualizacaoSelector from "@/components/ui/VisualizacaoSelector";
import { IconLaurel } from "@/components/ui/icons";
import { buscarPendencias } from "@/lib/pendencias";

export const dynamic = "force-dynamic";

type NavItem = { href: string; label: string; roles: string[] };

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Mural", roles: ["sdr", "closer", "lider", "diretor"] },
  { href: "/compromisso", label: "Compromisso", roles: ["sdr", "closer"] },
  { href: "/producao", label: "Minha Produção", roles: ["sdr", "closer"] },
  { href: "/tribo", label: "Minha Tribo", roles: ["closer"] },
  { href: "/tarefas", label: "Follow-ups", roles: ["closer"] },
  { href: "/exercito", label: "Meu Exército", roles: ["lider"] },
  { href: "/carreira", label: "Plano de Carreira", roles: ["sdr", "closer", "lider"] },
  { href: "/comissao", label: "Comissão do Mês", roles: ["sdr", "closer", "lider"] },
  { href: "/ranking", label: "Ranking", roles: ["sdr", "closer", "lider", "diretor"] },
  { href: "/weekly", label: "Weekly de Receita", roles: ["lider", "diretor"] },
  { href: "/trilha", label: "Trilha de Formação", roles: ["sdr", "closer", "lider"] },
  { href: "/central", label: "Central de Notificações", roles: ["diretor"] },
  { href: "/geral", label: "Visão Geral da Firma", roles: ["diretor"] },
  { href: "/legado", label: "Meu Legado", roles: ["diretor"] },
  { href: "/auditoria", label: "Auditoria", roles: ["diretor"] },
  { href: "/gestao", label: "Gestão de Pessoas", roles: ["diretor"] },
  { href: "/campanhas", label: "Campanhas", roles: ["diretor"] },
  { href: "/metas", label: "Metas Mensais", roles: ["diretor"] },
  { href: "/validacao", label: "Fila de Validação", roles: ["diretor"] },
  { href: "/aprovacoes", label: "Aprovações de Carreira", roles: ["diretor"] },
  { href: "/contestacoes", label: "Fila de Contestação", roles: ["diretor"] },
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

  const itensVisiveis = NAV_ITEMS.filter(
    (item) => !profile || item.roles.includes(papelVisualizado ?? profile.role)
  );

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
            <UserMenu avatarUrl={profile?.avatar_url ?? null} nome={profile?.full_name ?? user.email ?? "?"} />
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
