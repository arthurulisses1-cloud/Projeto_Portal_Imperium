import { createClient } from "@/lib/supabase/server";
import { RANK_LABELS } from "@/lib/labels";
import RankBadge from "@/components/ui/RankBadge";
import AppNav from "@/components/ui/AppNav";

export const dynamic = "force-dynamic";

type NavItem = { href: string; label: string; roles: string[] };

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Mural", roles: ["sdr", "closer", "lider", "diretor"] },
  { href: "/compromisso", label: "Compromisso", roles: ["sdr", "closer"] },
  { href: "/producao", label: "Minha Produção", roles: ["sdr", "closer"] },
  { href: "/tribo", label: "Minha Tribo", roles: ["closer"] },
  { href: "/exercito", label: "Meu Exército", roles: ["lider"] },
  { href: "/carreira", label: "Plano de Carreira", roles: ["sdr", "closer", "lider"] },
  { href: "/comissao", label: "Comissão do Mês", roles: ["sdr", "closer", "lider"] },
  { href: "/ranking", label: "Ranking", roles: ["sdr", "closer", "lider", "diretor"] },
  { href: "/trilha", label: "Trilha de Formação", roles: ["sdr", "closer", "lider"] },
  { href: "/geral", label: "Visão Geral da Firma", roles: ["diretor"] },
  { href: "/metas", label: "Metas Mensais", roles: ["diretor"] },
  { href: "/validacao", label: "Fila de Validação", roles: ["diretor"] },
  { href: "/aprovacoes", label: "Aprovações de Carreira", roles: ["diretor"] },
  { href: "/contestacoes", label: "Fila de Contestação", roles: ["diretor"] },
];

const TRIBO_TAG: Record<string, string> = {
  Templários: "border-templar/50 text-templar bg-templar/10",
  Maximus: "border-maximus/50 text-maximus bg-maximus/10",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select(
          "full_name, role, rank, tribo:tribos!profiles_tribo_id_fkey(nome, exercito:exercitos(nome))"
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

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-imperium-line bg-imperium-surface px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 text-gold">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M12 2c1.6 2.1 4.3 3.2 8.4 3.2-2.1 2.1-4.3 3.2-4.3 6.4 0 4.2-2.1 8.5-4.1 9.4-2-.9-4.1-5.2-4.1-9.4 0-3.2-2.2-4.3-4.3-6.4C7.7 5.2 10.4 4.1 12 2Z" />
            </svg>
          </div>
          <div>
            <p className="font-display text-sm tracking-wide text-gold-bright">
              PORTAL EXECUTIVO
            </p>
            <p className="text-[11px] uppercase tracking-widest text-stone-500">
              Matri Bank · Imperium
            </p>
          </div>
        </div>
        {user && (
          <div className="flex items-center gap-3">
            {profile && <RankBadge rank={profile.rank} size="sm" />}
            <div className="text-right">
              <p className="text-sm text-stone-100">{profile?.full_name ?? user.email}</p>
              {profile && (
                <p className="flex items-center justify-end gap-1.5 text-xs text-stone-500">
                  {RANK_LABELS[profile.rank]}
                  {tribo?.nome ? ` · ${tribo.nome}` : ""}
                  {exercitoNome && (
                    <span
                      className={`rounded-full border px-1.5 py-0.5 text-[10px] ${
                        TRIBO_TAG[exercitoNome] ?? "border-gold/40 text-gold"
                      }`}
                    >
                      {exercitoNome}
                    </span>
                  )}
                </p>
              )}
            </div>
            <form action="/auth/signout" method="post">
              <button className="btn-outline">Sair</button>
            </form>
          </div>
        )}
      </header>

      {user && <AppNav items={itensVisiveis} />}

      {children}

      <footer className="mt-16 pb-8 text-center">
        <p className="font-display text-[11px] tracking-[0.3em] text-imperium-line-strong">
          ESSE QUAM VIDERI
        </p>
      </footer>
    </div>
  );
}
