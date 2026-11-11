import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import { hojeBR } from "@/lib/data-br";
import { NEGOCIO_COR, nomeEquipe, type CargoNegocio } from "@/lib/negocios";
import FormLancarVenda from "@/components/negocio/FormLancarVenda";
import { excluirVendaManual } from "./actions";

export const dynamic = "force-dynamic";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
}
function dataCurta(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export default async function LancarVendasPage({
  searchParams,
}: {
  searchParams: { negocio?: string; ok?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: eu } = await supabase.from("profiles").select("role").eq("id", user.id).single();

  // Diretor lança em qualquer negócio ativo; Head só no(s) negócio(s) que chefia.
  type Neg = { id: string; slug: string; nome: string; equipe_nome: string | null };
  let negocios: Neg[] = [];
  if (eu?.role === "diretor") {
    const { data } = await supabase.from("negocios").select("id, slug, nome, equipe_nome").eq("status", "ativo").order("ordem");
    negocios = (data ?? []) as Neg[];
  } else {
    const { data } = await supabase
      .from("profile_negocios")
      .select("cargo, negocios(id, slug, nome, equipe_nome, status, ordem)")
      .eq("profile_id", user.id)
      .eq("cargo", "head");
    type L = { negocios: (Neg & { status: string }) | (Neg & { status: string })[] | null };
    negocios = ((data ?? []) as unknown as L[])
      .map((l) => (Array.isArray(l.negocios) ? l.negocios[0] : l.negocios))
      .filter((n): n is Neg & { status: string } => !!n && n.status === "ativo");
  }

  if (negocios.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-8">
        <Card>
          <p className="text-sm text-stone-300">Só o Diretor e o Head de um negócio lançam vendas por aqui.</p>
        </Card>
      </main>
    );
  }

  const atual = negocios.find((n) => n.slug === searchParams.negocio) ?? negocios[0];
  const cor = NEGOCIO_COR[atual.slug] ?? "201 162 74";
  const hoje = hojeBR();
  const inicioMes = hoje.slice(0, 7) + "-01";

  const [{ data: membros }, { data: todos }, { data: lancados }] = await Promise.all([
    supabase.from("profile_negocios").select("cargo, profiles(id, full_name)").eq("negocio_id", atual.id),
    supabase.from("profiles").select("id, full_name").order("full_name"),
    supabase
      .from("vendas")
      .select("id, data, valor, cliente, produto, profile:profiles!vendas_profile_id_fkey(full_name)")
      .eq("negocio_id", atual.id)
      .eq("lancamento_manual", true)
      .gte("data", inicioMes)
      .order("data", { ascending: false })
      .order("synced_at", { ascending: false })
      .limit(100),
  ]);

  type M = { cargo: CargoNegocio; profiles: { id: string; full_name: string } | { id: string; full_name: string }[] | null };
  const vendedores = ((membros ?? []) as unknown as M[])
    .map((m) => ({ cargo: m.cargo, p: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles }))
    .filter((x): x is { cargo: CargoNegocio; p: { id: string; full_name: string } } => !!x.p)
    .sort((a, b) => a.p.full_name.localeCompare(b.p.full_name, "pt-BR"));

  type Lanc = { id: string; data: string; valor: number; cliente: string | null; produto: string | null; profile: { full_name: string } | { full_name: string }[] | null };
  const linhas = (lancados ?? []) as unknown as Lanc[];
  const totalMes = linhas.reduce((s, l) => s + Number(l.valor), 0);

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Lançar vendas</h1>
        <p className="mt-1 text-sm text-stone-400">
          Registre o valor <strong>recebido</strong>. Parcelas e recorrências entram uma a uma, na data em que o dinheiro cai.
          Alimenta o painel do Mural.
        </p>
      </div>

      {negocios.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {negocios.map((n) => (
            <Link
              key={n.id}
              href={`/lancar-vendas?negocio=${n.slug}`}
              className={`rounded border px-3 py-1 text-sm ${n.id === atual.id ? "text-stone-100" : "border-imperium-line text-stone-400 hover:text-stone-100"}`}
              style={n.id === atual.id ? { borderColor: `rgb(${cor})`, backgroundColor: `rgb(${cor} / 0.15)` } : undefined}
            >
              {nomeEquipe(n)}
            </Link>
          ))}
        </div>
      )}

      {searchParams.ok && <p className="rounded border border-success/50 px-3 py-2 text-sm text-success-bright">Venda lançada.</p>}

      <Card>
        <p className="mb-3 text-sm font-semibold" style={{ color: `rgb(${cor})` }}>
          {nomeEquipe(atual)}
        </p>
        <FormLancarVenda
          slug={atual.slug}
          hoje={hoje}
          todos={todos ?? []}
          vendedores={vendedores.map((v) => ({ id: v.p.id, nome: v.p.full_name, cargo: v.cargo }))}
        />
      </Card>

      <Card>
        <div className="mb-3 flex items-baseline justify-between">
          <p className="text-[10px] uppercase tracking-widest text-stone-500">Lançado neste mês</p>
          <p className="text-sm text-stone-300">{moeda(totalMes)}</p>
        </div>
        {linhas.length === 0 ? (
          <p className="text-sm text-stone-500">Nenhum lançamento ainda.</p>
        ) : (
          <ul className="divide-y divide-imperium-line text-sm">
            {linhas.map((l) => {
              const nome = Array.isArray(l.profile) ? l.profile[0]?.full_name : l.profile?.full_name;
              return (
                <li key={l.id} className="flex items-center gap-3 py-2">
                  <span className="w-12 shrink-0 text-stone-500">{dataCurta(l.data)}</span>
                  <span className="min-w-0 flex-1 truncate text-stone-200">
                    {nome} {l.cliente ? `· ${l.cliente}` : ""} {l.produto ? `· ${l.produto}` : ""}
                  </span>
                  <span className="shrink-0 text-stone-100">{moeda(Number(l.valor))}</span>
                  <form action={excluirVendaManual}>
                    <input type="hidden" name="id" value={l.id} />
                    <input type="hidden" name="negocio_slug" value={atual.slug} />
                    <button type="submit" className="text-xs text-wine-bright hover:underline">
                      Excluir
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </main>
  );
}
