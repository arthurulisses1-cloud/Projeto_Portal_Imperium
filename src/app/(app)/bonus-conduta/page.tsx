import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hojeBR } from "@/lib/data-br";
import { CARGO_LABEL, NEGOCIO_COR, nomeEquipe, type CargoNegocio } from "@/lib/negocios";
import { buscarDecisoesBonus, chaveBonus, estadoDoBonus } from "@/lib/bonus-conduta";
import BonusCondutaForm, { type LinhaBonus } from "@/components/negocio/BonusCondutaForm";

export const dynamic = "force-dynamic";

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Fechamento do Auxílio Transporte: quem recebe os R$ 200 do fixo fechado no mês, condicionado à aprovação da direção. Só o Diretor. */
export default async function BonusCondutaPage({ searchParams }: { searchParams: { mes?: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: eu } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (eu?.role !== "diretor") redirect("/");

  const hoje = hojeBR();
  const m = /^(\d{4})-(\d{2})$/.exec(searchParams.mes ?? "");
  const ano = m ? Number(m[1]) : Number(hoje.slice(0, 4));
  const mes = m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? Number(m[2]) : Number(hoje.slice(5, 7));
  const ant = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  const seg = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };

  const { data: vinculos, error } = await supabase
    .from("profile_negocios")
    .select("profile_id, negocio_id, cargo, fixo, bonus_conduta, negocios!inner(slug, nome, equipe_nome, status, ordem), profiles!inner(full_name, ativo)")
    .gt("bonus_conduta", 0);

  if (error) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-6 py-8">
        <h1 className="font-display text-2xl text-gold-bright">Auxílio Transporte</h1>
        <p className="rounded border border-amber-400/40 bg-imperium-surface p-3 text-sm text-amber-300">
          Ainda não dá para fechar o Auxílio Transporte: o banco não tem a coluna dele. Rode as migrations 0122 (estrutura) e o script 0122b dos fixos e volte aqui.
        </p>
      </main>
    );
  }

  type N = { slug: string; nome: string; equipe_nome: string | null; status: string; ordem: number | null };
  type P = { full_name: string; ativo: boolean };
  type V = { profile_id: string; negocio_id: string; cargo: string; fixo: number | null; bonus_conduta: number; negocios: N | N[]; profiles: P | P[] };
  const decisoes = await buscarDecisoesBonus(supabase, ano, mes);
  const linhas: (LinhaBonus & { ordem: number })[] = ((vinculos ?? []) as unknown as V[])
    .map((v) => ({ v, n: Array.isArray(v.negocios) ? v.negocios[0] : v.negocios, p: Array.isArray(v.profiles) ? v.profiles[0] : v.profiles }))
    .filter((x) => x.n?.status === "ativo" && x.p?.ativo)
    .map((x) => ({
      chave: chaveBonus(x.v.profile_id, x.v.negocio_id),
      nome: x.p.full_name,
      cargo: CARGO_LABEL[x.v.cargo as CargoNegocio] ?? x.v.cargo,
      negocio: nomeEquipe(x.n),
      cor: NEGOCIO_COR[x.n.slug] ?? "201 162 74",
      fixo: Number(x.v.fixo ?? 0),
      bonus: Number(x.v.bonus_conduta),
      estado: estadoDoBonus(decisoes.get(chaveBonus(x.v.profile_id, x.v.negocio_id))),
      ordem: x.n.ordem ?? 99,
    }))
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <main className="mx-auto max-w-4xl space-y-5 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Auxílio Transporte</h1>
          <p className="mt-1 text-sm text-stone-400">
            {MESES[mes]} de {ano} · o fixo base é pago no dia 5; o Auxílio Transporte de R$ 200 é condicionado à aprovação da direção: você libera no fim do mês. Marque quem recebe.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/bonus-conduta?mes=${ant.ano}-${pad(ant.mes)}`} className="rounded border border-imperium-line px-3 py-1 text-stone-300 hover:text-stone-100">
            ← {MESES[ant.mes]}
          </Link>
          <Link href={`/bonus-conduta?mes=${seg.ano}-${pad(seg.mes)}`} className="rounded border border-imperium-line px-3 py-1 text-stone-300 hover:text-stone-100">
            {MESES[seg.mes]} →
          </Link>
        </div>
      </div>

      {linhas.length === 0 ? (
        <p className="text-sm text-stone-500">Ninguém tem Auxílio Transporte cadastrado.</p>
      ) : (
        <BonusCondutaForm key={`${ano}-${mes}`} ano={ano} mes={mes} linhas={linhas} />
      )}

      <p className="text-xs text-stone-500">
        Quem ainda não foi decidido aparece marcado e já conta no custo do mês (DRE e Financeiro por Negócio) como previsão; desmarcar e salvar tira o auxílio do custo.
      </p>
    </main>
  );
}
