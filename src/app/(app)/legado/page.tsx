import { createClient } from "@/lib/supabase/server";
import { RANK_LABELS } from "@/lib/labels";
import { FUNNEL_STAGES, type FunilEtapa } from "@/lib/funil";
import { calcularGargalo } from "@/lib/gargalo";
import { gerarParecer } from "@/lib/oraculo";
import { EXERCITO_CREST } from "@/lib/exercito-crests";
import { salvarAdmissao, salvarNascimento, alternarAtivo, confirmarResgateMarco } from "./actions";
import { buscarTudoPaginado } from "@/lib/supabase/paginate";
import { IconAlert, IconGift } from "@/components/ui/icons";
import { Badge } from "@/components/ui/Badge";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function iniciais(nome: string) {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

export default async function LegadoPage({
  searchParams,
}: {
  searchParams: { filtro?: string; papel?: string };
}) {
  const supabase = await createClient();
  const filtro = searchParams.filtro === "todos" ? "todos" : "ativos";
  const papelFiltro: "tudo" | "sdr" | "closer" =
    searchParams.papel === "sdr" || searchParams.papel === "closer" ? searchParams.papel : "tudo";

  let query = supabase
    .from("profiles")
    .select(
      "id, full_name, rank, avatar_url, data_admissao, data_nascimento, ativo, tribo:tribos!profiles_tribo_id_fkey(nome, logo_url, exercito:exercitos(nome))"
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

  // producao_funil facilmente passa de 1000 linhas nesse recorte (6 etapas x
  // ~20 pessoas x dias do mês) — sem paginar, o Supabase corta em silêncio e
  // gente aparecia com funil zerado no card.
  const funilRowsPromise =
    ids.length > 0
      ? buscarTudoPaginado<{ profile_id: string; etapa: string; realizado: number; papel: string }>((from, to) =>
          supabase
            .from("producao_funil")
            .select("profile_id, etapa, realizado, papel")
            .in("profile_id", ids)
            .gte("data", inicioMes)
            .range(from, to)
        )
      : Promise.resolve([]);

  const [funilRows, { data: vendasRows }, { data: vendasTrimestre }, { data: marcosCat }, { data: resgatesTodos }] = await Promise.all([
    funilRowsPromise,
    ids.length > 0
      ? supabase.from("vendas").select("profile_id, valor, papel").in("profile_id", ids).gte("data", inicioMes)
      : Promise.resolve({ data: [] }),
    ids.length > 0
      ? supabase.from("vendas").select("profile_id, valor, data, papel").in("profile_id", ids).gte("data", inicioTrimestre)
      : Promise.resolve({ data: [] }),
    supabase.from("marcos").select("id, nome, threshold, icone").order("ordem"),
    ids.length > 0
      ? supabase.from("marcos_resgates").select("profile_id, marco_id, competencia").in("profile_id", ids)
      : Promise.resolve({ data: [] }),
  ]);

  // Produção pessoal do mês SEM o filtro de papel da tela (marco é sobre a
  // produção total da pessoa, não sobre o recorte SDR/Closer que o Diretor
  // escolheu ver) — mesma base de src/lib/marcos.ts.
  const producaoMesTotalPorPessoa = new Map<string, number>();
  for (const row of vendasRows ?? []) {
    producaoMesTotalPorPessoa.set(row.profile_id, (producaoMesTotalPorPessoa.get(row.profile_id) ?? 0) + Number(row.valor));
  }
  function marcosElegiveis(profileId: string): { id: string; nome: string }[] {
    const producao = producaoMesTotalPorPessoa.get(profileId) ?? 0;
    const resgatesPessoa = (resgatesTodos ?? []).filter((r) => r.profile_id === profileId);
    if (resgatesPessoa.some((r) => r.competencia === inicioMes)) return []; // já usou o resgate do mês
    const idsResgatados = new Set(resgatesPessoa.map((r) => r.marco_id));
    return (marcosCat ?? [])
      .filter((m) => !idsResgatados.has(m.id) && producao >= m.threshold)
      .map((m) => ({ id: m.id, nome: m.nome }));
  }

  // "ambos" (fez os dois papéis na mesma venda/entrevista) conta em qualquer
  // filtro — só "sdr" ou "closer" puros ficam de fora do outro lado.
  function contaComoPapel(papel: string): boolean {
    if (papelFiltro === "tudo") return true;
    return papel === papelFiltro || papel === "ambos";
  }

  const funilPorPessoa = new Map<string, Record<FunilEtapa, number>>();
  for (const row of funilRows) {
    if (!contaComoPapel(row.papel)) continue;
    if (!funilPorPessoa.has(row.profile_id)) {
      funilPorPessoa.set(row.profile_id, Object.fromEntries(FUNNEL_STAGES.map((e) => [e, 0])) as Record<FunilEtapa, number>);
    }
    funilPorPessoa.get(row.profile_id)![row.etapa as FunilEtapa] += row.realizado;
  }

  const pagoPorPessoa = new Map<string, { total: number; qtd: number }>();
  for (const row of vendasRows ?? []) {
    if (!contaComoPapel(row.papel)) continue;
    const acc = pagoPorPessoa.get(row.profile_id) ?? { total: 0, qtd: 0 };
    acc.total += Number(row.valor);
    acc.qtd += 1;
    pagoPorPessoa.set(row.profile_id, acc);
  }

  // Risco de queda: mês atual vs média dos 2 meses anteriores
  const mesAtualStr = hoje.toISOString().slice(0, 7);
  const pagoMesAnteriorPorPessoa = new Map<string, number>();
  for (const row of vendasTrimestre ?? []) {
    if (!contaComoPapel(row.papel)) continue;
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
        <div className="flex flex-wrap gap-2">
          <a
            href={`/legado?filtro=ativos&papel=${papelFiltro}`}
            className={`rounded px-3 py-1.5 text-xs uppercase transition ${
              filtro === "ativos" ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold"
            }`}
          >
            Ativos
          </a>
          <a
            href={`/legado?filtro=todos&papel=${papelFiltro}`}
            className={`rounded px-3 py-1.5 text-xs uppercase transition ${
              filtro === "todos" ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold"
            }`}
          >
            Todos
          </a>
          <span className="mx-1 self-center text-stone-700">·</span>
          <a
            href={`/legado?filtro=${filtro}&papel=tudo`}
            className={`rounded px-3 py-1.5 text-xs uppercase transition ${
              papelFiltro === "tudo" ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold"
            }`}
          >
            Tudo
          </a>
          <a
            href={`/legado?filtro=${filtro}&papel=sdr`}
            className={`rounded px-3 py-1.5 text-xs uppercase transition ${
              papelFiltro === "sdr" ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold"
            }`}
          >
            Só SDR
          </a>
          <a
            href={`/legado?filtro=${filtro}&papel=closer`}
            className={`rounded px-3 py-1.5 text-xs uppercase transition ${
              papelFiltro === "closer" ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold"
            }`}
          >
            Só Closer
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
          const elegiveis = marcosElegiveis(p.id);

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
                  <Badge
                    tone="wine"
                    variant="tag"
                    className="shrink-0"
                  >
                    <span title="Ritmo do mês projeta bem abaixo da média dos últimos 2 meses" className="flex items-center gap-1">
                      <IconAlert className="h-3 w-3" /> Queda
                    </span>
                  </Badge>
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

              {elegiveis.length > 0 && (
                <div className="mt-4 rounded border border-gold/40 bg-gold/5 p-2.5">
                  <p className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-gold">
                    <IconGift className="h-3 w-3" /> Marco batido este mês — confirmar resgate
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {elegiveis.map((m) => (
                      <form key={m.id} action={confirmarResgateMarco}>
                        <input type="hidden" name="profile_id" value={p.id} />
                        <input type="hidden" name="marco_id" value={m.id} />
                        <button type="submit" className="btn-outline px-2 py-1 text-xs">
                          Confirmar: {m.nome}
                        </button>
                      </form>
                    ))}
                  </div>
                  {elegiveis.length > 1 && (
                    <p className="mt-1.5 text-[10px] text-stone-500">
                      Só dá pra confirmar um por mês — escolha um dos {elegiveis.length}.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 rounded border border-imperium-line bg-imperium-bg/40 p-2.5">
                <p className="mb-1.5 text-[10px] uppercase tracking-wide text-stone-500">Parecer do Oráculo</p>
                <ul className="space-y-1">
                  {parecer.slice(0, 2).map((item, i) => (
                    <li
                      key={i}
                      className={`text-xs ${
                        item.tom === "alerta" ? "text-wine-bright" : item.tom === "elogio" ? "text-success-bright" : "text-stone-300"
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

              <form action={alternarAtivo} className="mt-3">
                <input type="hidden" name="profile_id" value={p.id} />
                <input type="hidden" name="ativo" value={inativo ? "true" : "false"} />
                <button
                  type="submit"
                  className={`w-full rounded border px-3 py-1.5 text-xs ${
                    inativo
                      ? "border-success/50 text-success-bright hover:bg-success/10"
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
