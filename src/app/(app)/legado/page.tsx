import { createClient } from "@/lib/supabase/server";
import { RANK_LABELS } from "@/lib/labels";
import { salvarObservacao, salvarAdmissao } from "./actions";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function iniciais(nome: string) {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export default async function LegadoPage() {
  const supabase = await createClient();

  const { data: pessoas } = await supabase
    .from("profiles")
    .select(
      "id, full_name, rank, avatar_url, observacao_diretor, data_admissao, tribo:tribos!profiles_tribo_id_fkey(nome, exercito:exercitos(nome))"
    )
    .in("role", ["sdr", "closer"])
    .order("full_name");

  const ids = (pessoas ?? []).map((p) => p.id);
  const hoje = new Date();
  const inicioMes = hoje.toISOString().slice(0, 7) + "-01";
  const inicioTrimestre = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1).toISOString().slice(0, 10);

  const [{ data: funilRows }, { data: vendasRows }, { data: vendasTrimestre }] = await Promise.all([
    ids.length > 0
      ? supabase.from("producao_funil").select("profile_id, etapa, realizado").in("profile_id", ids).gte("data", inicioMes)
      : Promise.resolve({ data: [] }),
    ids.length > 0
      ? supabase.from("vendas").select("profile_id, valor").in("profile_id", ids).gte("data", inicioMes)
      : Promise.resolve({ data: [] }),
    ids.length > 0
      ? supabase.from("vendas").select("profile_id, valor, data").in("profile_id", ids).gte("data", inicioTrimestre)
      : Promise.resolve({ data: [] }),
  ]);

  const funilPorPessoa = new Map<string, { entrevistas: number; assinaturas: number; pagos: number }>();
  for (const row of funilRows ?? []) {
    if (!["entrevistas", "assinaturas", "pagos"].includes(row.etapa)) continue;
    const bucket = funilPorPessoa.get(row.profile_id) ?? { entrevistas: 0, assinaturas: 0, pagos: 0 };
    bucket[row.etapa as "entrevistas" | "assinaturas" | "pagos"] += row.realizado;
    funilPorPessoa.set(row.profile_id, bucket);
  }

  const pagoPorPessoa = new Map<string, number>();
  for (const row of vendasRows ?? []) {
    pagoPorPessoa.set(row.profile_id, (pagoPorPessoa.get(row.profile_id) ?? 0) + Number(row.valor));
  }

  // Risco de queda: mês atual vs média dos 2 meses anteriores
  const mesAtualStr = hoje.toISOString().slice(0, 7);
  const pagoMesAnteriorPorPessoa = new Map<string, number>();
  for (const row of vendasTrimestre ?? []) {
    if (row.data.slice(0, 7) === mesAtualStr) continue;
    pagoMesAnteriorPorPessoa.set(row.profile_id, (pagoMesAnteriorPorPessoa.get(row.profile_id) ?? 0) + Number(row.valor));
  }
  function riscoQueda(profileId: string): boolean {
    const mediaAnterior = (pagoMesAnteriorPorPessoa.get(profileId) ?? 0) / 2;
    if (mediaAnterior < 1000) return false; // sem histórico relevante, não avalia
    const atual = pagoPorPessoa.get(profileId) ?? 0;
    const diaDoMes = hoje.getDate();
    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const projetado = (atual / Math.max(1, diaDoMes)) * diasNoMes;
    return projetado < mediaAnterior * 0.6;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Meu Legado</h1>
        <p className="kicker mt-1">Cada legionário sob seu comando · produção do mês</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(pessoas ?? []).map((p) => {
          const tribo = p.tribo as unknown as { nome: string; exercito: { nome: string } | null } | null;
          const f = funilPorPessoa.get(p.id) ?? { entrevistas: 0, assinaturas: 0, pagos: 0 };
          const pago = pagoPorPessoa.get(p.id) ?? 0;
          const emQueda = riscoQueda(p.id);

          return (
            <div key={p.id} className={`watermark-spqr card-imp p-4 ${emQueda ? "border-wine/50" : ""}`}>
              <div className="flex items-center gap-3">
                {p.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.avatar_url}
                    alt={p.full_name}
                    className="h-12 w-12 shrink-0 rounded-full border border-gold/40 object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-imperium-bg text-sm text-gold">
                    {iniciais(p.full_name)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base text-gold-bright">{p.full_name}</p>
                  <p className="truncate text-xs text-stone-500">
                    {RANK_LABELS[p.rank] ?? p.rank}
                    {tribo?.exercito?.nome ? ` · ${tribo.exercito.nome}` : ""}
                    {tribo?.nome ? ` · ${tribo.nome}` : ""}
                  </p>
                </div>
                {emQueda && (
                  <span
                    title="Ritmo do mês projeta bem abaixo da média dos últimos 2 meses"
                    className="shrink-0 rounded-full border border-wine/50 bg-wine/10 px-2 py-1 text-[10px] uppercase text-wine-bright"
                  >
                    ⚠ Queda
                  </span>
                )}
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
                <div>
                  <p className="text-stone-500">Entrevistas</p>
                  <p className="text-stone-100">{f.entrevistas}</p>
                </div>
                <div>
                  <p className="text-stone-500">Assinados</p>
                  <p className="text-stone-100">{f.assinaturas}</p>
                </div>
                <div>
                  <p className="text-stone-500">Pagos</p>
                  <p className="text-stone-100">{f.pagos}</p>
                </div>
                <div>
                  <p className="text-stone-500">Pago R$</p>
                  <p className="text-gold-bright">{moeda(pago)}</p>
                </div>
              </div>

              <form action={salvarObservacao} className="mt-4">
                <input type="hidden" name="profile_id" value={p.id} />
                <label className="mb-1 block text-[10px] uppercase tracking-wide text-stone-500">
                  Observação
                </label>
                <textarea
                  name="observacao"
                  rows={2}
                  defaultValue={p.observacao_diretor ?? ""}
                  placeholder="Uma nota sobre essa pessoa..."
                  className="input-imp text-xs"
                />
                <button type="submit" className="btn-outline mt-2 px-3 py-1 text-xs">
                  Salvar
                </button>
              </form>

              <form action={salvarAdmissao} className="mt-3 flex items-end gap-2">
                <input type="hidden" name="profile_id" value={p.id} />
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wide text-stone-500">
                    Data de admissão
                  </label>
                  <input
                    type="date"
                    name="data_admissao"
                    defaultValue={p.data_admissao ?? ""}
                    className="input-imp px-2 py-1 text-xs"
                  />
                </div>
                <button type="submit" className="btn-outline px-3 py-1 text-xs">
                  Salvar
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </main>
  );
}
