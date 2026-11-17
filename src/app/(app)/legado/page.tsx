import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { podeVerArea } from "@/lib/permissoes-analista";
import { NEGOCIO_COR, nomeEquipe, rotuloCargo, type CargoNegocio } from "@/lib/negocios";
import { buscarPaceNegocios, calcularPace, type PaceNegocio, type StatusPace } from "@/lib/pace-negocio";
import { salvarAdmissao, salvarNascimento, alternarAtivo } from "./actions";
import { hojeBR } from "@/lib/data-br";

export const dynamic = "force-dynamic";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function iniciais(nome: string) {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

const STATUS: Record<StatusPace, { texto: string; classe: string }> = {
  sem_meta: { texto: "sem meta", classe: "border-imperium-line text-stone-500" },
  adiantado: { texto: "adiantado", classe: "border-success/50 text-success-bright" },
  no_ritmo: { texto: "no ritmo", classe: "border-warning/50 text-warning-bright" },
  atrasado: { texto: "atrasado", classe: "border-wine/50 text-wine-bright" },
  critico: { texto: "crítico", classe: "border-wine/60 text-wine-bright" },
};

type Perfil = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  data_admissao: string | null;
  data_nascimento: string | null;
  ativo: boolean;
  role?: string | null;
};
type Negocio = { slug: string; nome: string; equipe_nome: string | null; equipe_bandeira: string | null; status: string; ordem: number | null };

/** Meu Legado no modelo multinegócio: o time por negócio, produção do mês e dados de cadastro. */
export default async function LegadoPage({ searchParams }: { searchParams: { filtro?: string; negocio?: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: meuPerfil } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  // Meu Legado é do Diretor, ou do Analista com a área "pessoas" liberada.
  const analistaLiberado = meuPerfil?.role === "analista" && (await podeVerArea(supabase, user.id, meuPerfil.role, "pessoas"));
  if (meuPerfil?.role !== "diretor" && !analistaLiberado) redirect("/");

  const filtro = searchParams.filtro === "todos" ? "todos" : "ativos";
  const hoje = hojeBR();
  const [ano, mes] = hoje.split("-").map(Number);

  const { data: vincRaw } = await supabase
    .from("profile_negocios")
    .select("cargo, principal, negocios(slug, nome, equipe_nome, equipe_bandeira, status, ordem), profiles(id, full_name, avatar_url, data_admissao, data_nascimento, ativo, role)");
  type L = { cargo: CargoNegocio; principal: boolean; negocios: Negocio | Negocio[] | null; profiles: Perfil | Perfil[] | null };
  const vinculos = ((vincRaw ?? []) as unknown as L[])
    .map((l) => ({
      cargo: l.cargo,
      principal: l.principal,
      negocio: Array.isArray(l.negocios) ? l.negocios[0] : l.negocios,
      pessoa: Array.isArray(l.profiles) ? l.profiles[0] : l.profiles,
    }))
    .filter((v): v is { cargo: CargoNegocio; principal: boolean; negocio: Negocio; pessoa: Perfil } => !!v.negocio && !!v.pessoa && v.negocio.status === "ativo");

  const negocios = Array.from(new Map(vinculos.map((v) => [v.negocio.slug, v.negocio])).values()).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
  const foco = negocios.find((n) => n.slug === searchParams.negocio) ?? null;

  // Pessoas (uma vez cada), com os vínculos de negócio dela.
  const porPessoa = new Map<string, { pessoa: Perfil; vinculos: typeof vinculos }>();
  for (const v of vinculos) {
    if (foco && !vinculos.some((x) => x.pessoa.id === v.pessoa.id && x.negocio.slug === foco.slug)) continue;
    const atual = porPessoa.get(v.pessoa.id) ?? { pessoa: v.pessoa, vinculos: [] };
    atual.vinculos.push(v);
    porPessoa.set(v.pessoa.id, atual);
  }
  const pessoas = Array.from(porPessoa.values())
    .filter((p) => filtro === "todos" || p.pessoa.ativo)
    .sort((a, b) => a.pessoa.full_name.localeCompare(b.pessoa.full_name, "pt-BR"));

  const pace: PaceNegocio[] = await buscarPaceNegocios(supabase, ano, mes, hoje, foco ? [foco.slug] : negocios.map((n) => n.slug));
  const paceDe = (profileId: string, slug: string) => {
    const eu = pace.find((p) => p.negocio.slug === slug)?.pessoas.find((x) => x.id === profileId);
    return eu ? { recebido: eu.recebido, vendas: eu.vendas, meta: eu.meta } : null;
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Meu Legado</h1>
          <p className="kicker mt-1">Seu time por negócio · produção do mês</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/legado?filtro=ativos${foco ? `&negocio=${foco.slug}` : ""}`}
            className={`rounded px-3 py-1.5 text-xs uppercase transition ${filtro === "ativos" ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold"}`}
          >
            Ativos
          </Link>
          <Link
            href={`/legado?filtro=todos${foco ? `&negocio=${foco.slug}` : ""}`}
            className={`rounded px-3 py-1.5 text-xs uppercase transition ${filtro === "todos" ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold"}`}
          >
            Todos
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href={`/legado?filtro=${filtro}`}
          className={`rounded border px-3 py-1 ${!foco ? "border-gold text-stone-100" : "border-imperium-line text-stone-400 hover:text-stone-100"}`}
        >
          Todos os negócios
        </Link>
        {negocios.map((n) => (
          <Link
            key={n.slug}
            href={`/legado?filtro=${filtro}&negocio=${n.slug}`}
            className={`rounded border px-3 py-1 ${foco?.slug === n.slug ? "border-gold text-stone-100" : "border-imperium-line text-stone-400 hover:text-stone-100"}`}
          >
            {nomeEquipe(n)}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {pessoas.length === 0 && <p className="text-sm text-stone-500">Ninguém por aqui.</p>}
        {pessoas.map(({ pessoa: p, vinculos: vs }) => {
          const inativo = p.ativo === false;
          const principal = [...vs].sort((a, b) => Number(b.principal) - Number(a.principal))[0];
          const dados = paceDe(p.id, (foco ?? principal.negocio).slug);
          const alvo = foco ?? principal.negocio;
          const individual = dados && dados.meta !== null ? calcularPace({ meta: dados.meta, recebido: dados.recebido, hoje, ano, mes }) : null;
          const cor = NEGOCIO_COR[alvo.slug] ?? "201 162 74";
          return (
            <div key={p.id} className={`card-imp p-4 ${inativo ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-3">
                {p.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.avatar_url} alt={p.full_name} className="h-12 w-12 shrink-0 rounded-full border border-gold/40 object-cover" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-imperium-bg text-sm text-gold">
                    {iniciais(p.full_name)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base text-gold-bright">
                    {p.full_name}
                    {inativo && <span className="ml-2 text-[10px] uppercase text-stone-500">Inativo</span>}
                  </p>
                  <p className="truncate text-xs text-stone-500">
                    {vs.map((v) => `${rotuloCargo(v.cargo, p.role)} · ${nomeEquipe(v.negocio)}`).join("  |  ")}
                  </p>
                </div>
                {individual && <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${STATUS[individual.status].classe}`}>{STATUS[individual.status].texto}</span>}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <p className="text-stone-500">Recebido</p>
                  <p className="text-gold-bright">{moeda(dados?.recebido ?? 0)}</p>
                </div>
                <div>
                  <p className="text-stone-500">Vendas</p>
                  <p className="text-stone-100">{dados?.vendas ?? 0}</p>
                </div>
                <div>
                  <p className="text-stone-500">Meta</p>
                  <p className="text-stone-100">{dados && dados.meta !== null ? moeda(dados.meta) : "—"}</p>
                </div>
              </div>
              {individual && individual.meta > 0 && (
                <div className="mt-2">
                  <div className="relative h-1.5 overflow-hidden rounded-full bg-imperium-raised" title={`Deveria estar em ${moeda(individual.esperadoAteHoje)} hoje`}>
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (individual.recebido / individual.meta) * 100)}%`, backgroundColor: `rgb(${cor})` }} />
                    <div className="absolute inset-y-0 w-0.5 bg-stone-100/80" style={{ left: `${Math.min(100, (individual.esperadoAteHoje / individual.meta) * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-[11px] text-stone-500">deveria estar em {moeda(individual.esperadoAteHoje)}</p>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <form action={salvarAdmissao} className="flex items-end gap-2">
                  <input type="hidden" name="profile_id" value={p.id} />
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wide text-stone-500">Admissão</label>
                    <input type="date" name="data_admissao" defaultValue={p.data_admissao ?? ""} className="input-imp px-2 py-1 text-xs" />
                  </div>
                  <button type="submit" className="btn-outline px-2 py-1 text-xs">
                    Salvar
                  </button>
                </form>

                <form action={salvarNascimento} className="flex items-end gap-2">
                  <input type="hidden" name="profile_id" value={p.id} />
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wide text-stone-500">Aniversário</label>
                    <input type="date" name="data_nascimento" defaultValue={p.data_nascimento ?? ""} className="input-imp px-2 py-1 text-xs" />
                  </div>
                  <button type="submit" className="btn-outline px-2 py-1 text-xs">
                    Salvar
                  </button>
                </form>
              </div>

              <form action={alternarAtivo} className="mt-3 space-y-2">
                <input type="hidden" name="profile_id" value={p.id} />
                <input type="hidden" name="ativo" value={inativo ? "true" : "false"} />
                {!inativo && (
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wide text-stone-500">Último dia de trabalho</label>
                    <input type="date" name="data_saida" defaultValue={hoje} required className="input-imp px-2 py-1 text-xs" />
                  </div>
                )}
                <button
                  type="submit"
                  className={`w-full rounded border px-3 py-1.5 text-xs ${
                    inativo ? "border-success/50 text-success-bright hover:bg-success/10" : "border-wine/50 text-wine-bright hover:bg-wine/10"
                  }`}
                >
                  {inativo ? "Reativar" : "Desativar (saiu da empresa)"}
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </main>
  );
}
