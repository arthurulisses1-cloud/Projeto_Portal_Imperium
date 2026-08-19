import { createClient } from "@/lib/supabase/server";
import { RANK_LABELS } from "@/lib/labels";
import { FUNNEL_STAGES, type FunilEtapa } from "@/lib/funil";
import { calcularGargalo } from "@/lib/gargalo";
import { gerarParecer } from "@/lib/oraculo";
import { EXERCITO_CREST } from "@/lib/exercito-crests";
import { salvarAdmissao, salvarNascimento, alternarAtivo, salvarNomePlanilha } from "./actions";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function iniciais(nome: string) {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export default async function LegadoPage({
  searchParams,
}: {
  searchParams: { filtro?: string };
}) {
  const supabase = await createClient();
  const filtro = searchParams.filtro === "todos" ? "todos" : "ativos";

  let query = supabase
    .from("profiles")
    .select(
      "id, full_name, rank, avatar_url, data_admissao, data_nascimento, ativo, nome_planilha, tribo:tribos!profiles_tribo_id_fkey(nome, logo_url, exercito:exercitos(nome))"
    )
    .in("role", ["sdr", "closer"])
    .order("full_name");
  if (filtro === "ativos") query = query.eq("ativo", true);
  const { data: pessoas } = await query;

  const ids = (pessoas ?? []).map((p) => p.id);
  const hoje = new Date();
  const inicioMes = hoje.toISOString().slice(0, 7) + "-01";
  const inicioTrimestre = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1).toISOString().slice(0, 10);

  const { data: metaMes } = await supabase
    .from("metas_mensais")
    .select("id, meta_ticket_medio")
    .eq("ano", hoje.getFullYear())
    .eq("mes", hoje.getMonth() + 1)
    .maybeSingle();
  const { data: conversoes } = metaMes
    ? await supabase.from("metas_conversao").select("etapa_de, etapa_para, taxa_esperada").eq("meta_mensal_id", metaMes.id)
    : { data: [] };
  const taxaMap = new Map((conversoes ?? []).map((c) => [`${c.etapa_de}_${c.etapa_para}`, c.taxa_esperada]));
  const metaTicketMedio = metaMes?.meta_ticket_medio ?? 0;

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

  const funilPorPessoa = new Map<string, Record<FunilEtapa, number>>();
  for (const row of funilRows ?? []) {
    if (!funilPorPessoa.has(row.profile_id)) {
      funilPorPessoa.set(row.profile_id, Object.fromEntries(FUNNEL_STAGES.map((e) => [e, 0])) as Record<FunilEtapa, number>);
    }
    funilPorPessoa.get(row.profile_id)![row.etapa as FunilEtapa] += row.realizado;
  }

  const pagoPorPessoa = new Map<string, { total: number; qtd: number }>();
  for (const row of vendasRows ?? []) {
    const acc = pagoPorPessoa.get(row.profile_id) ?? { total: 0, qtd: 0 };
    acc.total += Number(row.valor);
    acc.qtd += 1;
    pagoPorPessoa.set(row.profile_id, acc);
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
    if (mediaAnterior < 1000) return false;
    const atual = pagoPorPessoa.get(profileId)?.total ?? 0;
    const diaDoMes = hoje.getDate();
    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    const projetado = (atual / Math.max(1, diaDoMes)) * diasNoMes;
    return projetado < mediaAnterior * 0.6;
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Meu Legado</h1>
          <p className="kicker mt-1">Cada legionário sob seu comando · produção do mês</p>
        </div>
        <div className="flex gap-2">
          <a
            href="/legado?filtro=ativos"
            className={`rounded px-3 py-1.5 text-xs uppercase transition ${
              filtro === "ativos" ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold"
            }`}
          >
            Ativos
          </a>
          <a
            href="/legado?filtro=todos"
            className={`rounded px-3 py-1.5 text-xs uppercase transition ${
              filtro === "todos" ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold"
            }`}
          >
            Todos
          </a>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(pessoas ?? []).map((p) => {
          const tribo = p.tribo as unknown as { nome: string; logo_url: string | null; exercito: { nome: string } | null } | null;
          const funilPessoa = funilPorPessoa.get(p.id) ?? (Object.fromEntries(FUNNEL_STAGES.map((e) => [e, 0])) as Record<FunilEtapa, number>);
          const vendasPessoa = pagoPorPessoa.get(p.id);
          const pago = vendasPessoa?.total ?? 0;
          const ticketMedio = vendasPessoa && vendasPessoa.qtd > 0 ? vendasPessoa.total / vendasPessoa.qtd : null;
          const emQueda = riscoQueda(p.id);
          const gargalo = calcularGargalo(funilPessoa, taxaMap);
          const parecer = gerarParecer({ gargalo, ticketMedio, metaTicketMedio, pctMeta: null });
          const inativo = p.ativo === false;

          return (
            <div
              key={p.id}
              className={`watermark-spqr card-imp p-4 ${emQueda ? "border-wine/50" : ""} ${inativo ? "opacity-50" : ""}`}
            >
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
                  <p className="truncate font-display text-base text-gold-bright">
                    {p.full_name}
                    {inativo && <span className="ml-2 text-[10px] uppercase text-stone-500">Inativo</span>}
                  </p>
                  <p className="truncate text-xs text-stone-500">{RANK_LABELS[p.rank] ?? p.rank}</p>
                </div>
                <div className="flex shrink-0 -space-x-2">
                  {tribo?.exercito?.nome && EXERCITO_CREST[tribo.exercito.nome] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={EXERCITO_CREST[tribo.exercito.nome]}
                      alt={tribo.exercito.nome}
                      title={tribo.exercito.nome}
                      className="h-6 w-6 rounded-full border border-imperium-surface object-cover"
                    />
                  )}
                  {tribo?.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={tribo.logo_url}
                      alt={tribo.nome}
                      title={tribo.nome}
                      className="h-6 w-6 rounded-full border border-imperium-surface object-cover"
                    />
                  )}
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
                  <p className="text-stone-100">{funilPessoa.entrevistas}</p>
                </div>
                <div>
                  <p className="text-stone-500">Assinados</p>
                  <p className="text-stone-100">{funilPessoa.assinaturas}</p>
                </div>
                <div>
                  <p className="text-stone-500">Pagos</p>
                  <p className="text-stone-100">{funilPessoa.pagos}</p>
                </div>
                <div>
                  <p className="text-stone-500">Pago R$</p>
                  <p className="text-gold-bright">{moeda(pago)}</p>
                </div>
              </div>

              <div className="mt-4 rounded border border-imperium-line bg-imperium-bg/40 p-2.5">
                <p className="mb-1.5 text-[10px] uppercase tracking-wide text-stone-500">Parecer do Oráculo</p>
                <ul className="space-y-1">
                  {parecer.slice(0, 2).map((item, i) => (
                    <li
                      key={i}
                      className={`text-xs ${
                        item.tom === "alerta" ? "text-wine-bright" : item.tom === "elogio" ? "text-emerald-400" : "text-stone-300"
                      }`}
                    >
                      {item.texto}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-3 flex flex-wrap items-end gap-3">
                <form action={salvarAdmissao} className="flex items-end gap-2">
                  <input type="hidden" name="profile_id" value={p.id} />
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wide text-stone-500">Admissão</label>
                    <input
                      type="date"
                      name="data_admissao"
                      defaultValue={p.data_admissao ?? ""}
                      className="input-imp px-2 py-1 text-xs"
                    />
                  </div>
                  <button type="submit" className="btn-outline px-2 py-1 text-xs">
                    Salvar
                  </button>
                </form>

                <form action={salvarNascimento} className="flex items-end gap-2">
                  <input type="hidden" name="profile_id" value={p.id} />
                  <div>
                    <label className="mb-1 block text-[10px] uppercase tracking-wide text-stone-500">Aniversário</label>
                    <input
                      type="date"
                      name="data_nascimento"
                      defaultValue={p.data_nascimento ?? ""}
                      className="input-imp px-2 py-1 text-xs"
                    />
                  </div>
                  <button type="submit" className="btn-outline px-2 py-1 text-xs">
                    Salvar
                  </button>
                </form>
              </div>

              <form action={salvarNomePlanilha} className="mt-3 flex items-end gap-2">
                <input type="hidden" name="profile_id" value={p.id} />
                <div className="flex-1">
                  <label className="mb-1 block text-[10px] uppercase tracking-wide text-stone-500">
                    Nome na planilha
                  </label>
                  <input
                    type="text"
                    name="nome_planilha"
                    defaultValue={p.nome_planilha ?? ""}
                    placeholder={p.full_name}
                    className="input-imp w-full px-2 py-1 text-xs"
                  />
                </div>
                <button type="submit" className="btn-outline px-2 py-1 text-xs">
                  Salvar
                </button>
              </form>
              <p className="mt-1 text-[10px] text-stone-600">
                Preencha só se o nome na planilha do Google Sheets for diferente do cadastro — a sync
                passa a usar esse nome pra achar essa pessoa.
              </p>

              <form action={alternarAtivo} className="mt-3">
                <input type="hidden" name="profile_id" value={p.id} />
                <input type="hidden" name="ativo" value={inativo ? "true" : "false"} />
                <button
                  type="submit"
                  className={`w-full rounded border px-3 py-1.5 text-xs ${
                    inativo
                      ? "border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10"
                      : "border-wine/50 text-wine-bright hover:bg-wine/10"
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
