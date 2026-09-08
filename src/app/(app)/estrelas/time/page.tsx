import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NEXT_RANK, STAR_PACE, type Rank } from "@/lib/carreira";
import { RANK_LABELS } from "@/lib/labels";
import { buscarHistoricoEstrelas, ultimosMesesChaves, type PessoaEstrelas } from "@/lib/estrelas-historico";
import { hojeBR } from "@/lib/data-br";
import Card from "@/components/ui/Card";

const MESES_NOME = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmtMesChave(chave: string) {
  const [, mes] = chave.split("-").map(Number);
  return MESES_NOME[mes - 1];
}

function DeltaChip({ delta }: { delta: number }) {
  if (delta === 0) {
    return <span className="inline-flex h-6 w-9 items-center justify-center rounded text-[11px] text-stone-700">—</span>;
  }
  const positivo = delta > 0;
  const texto = `${positivo ? "+" : ""}${delta % 1 === 0 ? delta : delta.toFixed(1)}`;
  return (
    <span
      className={`inline-flex h-6 w-9 items-center justify-center rounded text-[11px] font-medium ${
        positivo ? "bg-success/15 text-success-bright" : "bg-wine/15 text-wine-bright"
      }`}
    >
      {texto}
    </span>
  );
}

export default async function EstrelasTimePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: meProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (meProfile?.role !== "diretor" && meProfile?.role !== "lider") redirect("/");

  let exercitoIdFiltro: string | null = null;
  if (meProfile.role === "lider") {
    const { data: meuExercito } = await supabase.from("exercitos").select("id").eq("legado_id", user.id).maybeSingle();
    exercitoIdFiltro = meuExercito?.id ?? null;
  }

  const { data: pessoasRaw } = await supabase
    .from("profiles")
    .select("id, full_name, role, rank, stars_total, tribo:tribos!profiles_tribo_id_fkey(nome, exercito_id, exercito:exercitos(nome))")
    .in("role", ["sdr", "closer"])
    .eq("ativo", true);

  const pessoas: (PessoaEstrelas & { triboExercitoId: string | null })[] = (pessoasRaw ?? [])
    .map((p) => {
      const tribo = p.tribo as unknown as { nome: string; exercito_id: string | null; exercito: { nome: string } | null } | null;
      return {
        id: p.id,
        nome: p.full_name,
        role: p.role,
        rank: p.rank as Rank,
        starsTotal: Number(p.stars_total),
        triboNome: tribo?.exercito?.nome ?? tribo?.nome ?? null,
        triboExercitoId: tribo?.exercito_id ?? null,
      };
    })
    .filter((p) => !exercitoIdFiltro || p.triboExercitoId === exercitoIdFiltro)
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const meses = ultimosMesesChaves(6, hojeBR());
  const historico = await buscarHistoricoEstrelas(supabase, pessoas, meses);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Estrelas do Time</h1>
        <p className="kicker mt-1">Quantas estrelas cada pessoa tem e como isso evoluiu mês a mês.</p>
      </div>

      <p className="rounded border border-imperium-line bg-imperium-bg/40 px-4 py-2 text-xs text-stone-500">
        Os meses passados são reconstruídos a partir do histórico de vendas pagas (mesma regra da auditoria de agosto/2026) — não
        refletem ajustes manuais feitos fora dessa fórmula.
      </p>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-imperium-line text-left text-[11px] uppercase tracking-wide text-stone-500">
                <th className="py-2 pr-3">Pessoa</th>
                <th className="py-2 pr-3 text-right">Estrelas</th>
                <th className="py-2 pr-3 text-right">Progresso</th>
                {meses.map((m) => (
                  <th key={m} className="py-2 px-1 text-center">
                    {fmtMesChave(m)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pessoas.map((p) => {
                const proximoRank = NEXT_RANK[p.rank];
                const pace = proximoRank ? STAR_PACE[proximoRank] : null;
                const pct = pace && pace.estrelas > 0 ? Math.min(100, (p.starsTotal / pace.estrelas) * 100) : null;
                return (
                  <tr key={p.id} className="border-b border-imperium-line/60">
                    <td className="py-2 pr-3">
                      <p className="text-stone-100">{p.nome}</p>
                      <p className="text-[11px] text-stone-600">
                        {RANK_LABELS[p.rank] ?? p.rank}
                        {p.triboNome ? ` · ${p.triboNome}` : ""}
                      </p>
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className="font-display text-base text-gold-bright">{p.starsTotal}</span>
                    </td>
                    <td className="py-2 pr-3">
                      {pct === null ? (
                        <span className="block text-right text-[11px] text-stone-600">topo</span>
                      ) : (
                        <div className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-imperium-line">
                          <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </td>
                    {meses.map((m) => (
                      <td key={m} className="px-1 py-2 text-center">
                        <DeltaChip delta={historico.get(m)?.get(p.id)?.delta ?? 0} />
                      </td>
                    ))}
                  </tr>
                );
              })}
              {pessoas.length === 0 && (
                <tr>
                  <td colSpan={3 + meses.length} className="py-6 text-center text-sm text-stone-500">
                    Ninguém encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}
