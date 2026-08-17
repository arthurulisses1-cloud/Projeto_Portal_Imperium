import { createClient } from "@/lib/supabase/server";
import { RANK_LABELS } from "@/lib/labels";
import Link from "next/link";

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

  const itensVisiveis = NAV_ITEMS.filter(
    (item) => !profile || item.roles.includes(profile.role)
  );

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-amber-500/20 bg-[#111827] px-6 py-4">
        <div>
          <p className="font-serif text-lg text-amber-400">Portal Executivo</p>
          <p className="text-xs text-stone-400">Matri Bank · Imperium</p>
        </div>
        {user && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm text-stone-100">{profile?.full_name ?? user.email}</p>
              {profile && (
                <p className="text-xs text-stone-400">
                  {RANK_LABELS[profile.rank]}
                  {tribo?.nome ? ` · ${tribo.nome}` : ""}
                  {tribo?.exercito?.nome ? ` · ${tribo.exercito.nome}` : ""}
                </p>
              )}
            </div>
            <form action="/auth/signout" method="post">
              <button className="rounded border border-stone-700 px-3 py-1.5 text-xs text-stone-300 hover:border-amber-500 hover:text-amber-400">
                Sair
              </button>
            </form>
          </div>
        )}
      </header>

      {user && (
        <nav className="flex gap-1 border-b border-stone-800 bg-[#0d1220] px-6">
          {itensVisiveis.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="px-3 py-2 text-sm text-stone-300 hover:text-amber-400"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}

      {children}
    </div>
  );
}
