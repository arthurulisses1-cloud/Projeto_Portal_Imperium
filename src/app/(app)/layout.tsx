import { createClient } from "@/lib/supabase/server";
import { RANK_LABELS } from "@/lib/labels";
import RankBadge from "@/components/ui/RankBadge";
import AppNav from "@/components/ui/AppNav";
import ThemeToggle from "@/components/ui/ThemeToggle";
import NoticiasCompactas from "@/components/ui/NoticiasCompactas";
import SidebarRight from "@/components/ui/SidebarRight";
import AvatarUpload from "@/components/ui/AvatarUpload";
import { IconLaurel } from "@/components/ui/icons";
import { EXERCITO_CREST, TRIBO_TAG } from "@/lib/exercito-crests";

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
  { href: "/trilha", label: "Trilha de Formação", roles: ["sdr", "closer", "lider"] },
  { href: "/central", label: "Central de Notificações", roles: ["diretor"] },
  { href: "/geral", label: "Visão Geral da Firma", roles: ["diretor"] },
  { href: "/legado", label: "Meu Legado", roles: ["diretor"] },
  { href: "/auditoria", label: "Auditoria", roles: ["diretor"] },
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
        .select(
          "full_name, role, rank, avatar_url, tribo:tribos!profiles_tribo_id_fkey(nome, exercito:exercitos(nome))"
        )
        .eq("id", user.id)
        .single()
    : { data: null };

  const tribo = profile?.tribo as unknown as
    | { nome: string; exercito: { nome: string } | null }
    | null;
  const exercitoNome = tribo?.exercito?.nome;

  const itensVisiveis = NAV_ITEMS.filter(
    (item) => !profile || item.roles.includes(profile.role)
  );

  const ehExecutivo = profile?.role === "sdr" || profile?.role === "closer";

  return (
    <div className="flex min-h-screen">
      {user && (
        <aside className="flex w-56 shrink-0 flex-col border-r border-imperium-line bg-imperium-surface">
          <div className="watermark-spqr flex items-center gap-2 border-b border-imperium-line p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/crests/imperium.jpg"
              alt="Imperium"
              className="h-9 w-9 shrink-0 rounded-full border border-gold/40 object-cover"
            />
            <div className="min-w-0">
              <p className="truncate font-display text-xs tracking-wide text-gold-bright">
                PRAETORIUM
              </p>
              <p className="truncate text-[9px] uppercase tracking-widest text-stone-500">
                Matri Bank · Imperium
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <AppNav items={itensVisiveis} />
          </div>

          <NoticiasCompactas />
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b border-imperium-line bg-imperium-surface px-6 py-3">
          {user && (
            <>
              <ThemeToggle />
              {profile && <RankBadge rank={profile.rank} size="sm" />}
              <AvatarUpload avatarUrl={profile?.avatar_url ?? null} nome={profile?.full_name ?? "?"} />
              <div className="text-right">
                <p className="text-sm text-stone-100">{profile?.full_name ?? user.email}</p>
                {profile && (
                  <p className="flex items-center justify-end gap-1.5 text-xs text-stone-500">
                    {RANK_LABELS[profile.rank]}
                    {tribo?.nome ? ` · ${tribo.nome}` : ""}
                    {exercitoNome && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-1.5 text-[10px] ${
                          TRIBO_TAG[exercitoNome] ?? "border-gold/40 text-gold"
                        }`}
                      >
                        {EXERCITO_CREST[exercitoNome] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={EXERCITO_CREST[exercitoNome]}
                            alt={exercitoNome}
                            className="h-3.5 w-3.5 rounded-full object-cover"
                          />
                        )}
                        {exercitoNome}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <form action="/auth/signout" method="post">
                <button className="btn-outline">Sair</button>
              </form>
            </>
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
