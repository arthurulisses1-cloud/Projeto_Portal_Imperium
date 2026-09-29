import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cumpriuCompromisso, type StreakRow } from "@/lib/streak";
import { marcarFaltaTime, desmarcarFaltaTime } from "@/app/(app)/exercito/actions";
import { hojeBR, ehFimDeSemana, paraDataUTC } from "@/lib/data-br";
import { podeVerArea } from "@/lib/permissoes-analista";

type Totais = {
  entrevistasComp: number;
  entrevistasReal: number;
  assinaturasComp: number;
  assinaturasReal: number;
  pagosComp: number;
  pagosReal: number;
  lancaram: number;
  total: number;
};

function totaisVazios(): Totais {
  return {
    entrevistasComp: 0,
    entrevistasReal: 0,
    assinaturasComp: 0,
    assinaturasReal: 0,
    pagosComp: 0,
    pagosReal: 0,
    lancaram: 0,
    total: 0,
  };
}

function somar(a: Totais, b: Totais): Totais {
  return {
    entrevistasComp: a.entrevistasComp + b.entrevistasComp,
    entrevistasReal: a.entrevistasReal + b.entrevistasReal,
    assinaturasComp: a.assinaturasComp + b.assinaturasComp,
    assinaturasReal: a.assinaturasReal + b.assinaturasReal,
    pagosComp: a.pagosComp + b.pagosComp,
    pagosReal: a.pagosReal + b.pagosReal,
    lancaram: a.lancaram + b.lancaram,
    total: a.total + b.total,
  };
}

// Dias úteis (sem sáb/dom) num intervalo [inicio, fim], os 2 inclusive —
// mesmo raciocínio de diasUteisEmIntervalo em src/lib/pace.ts, mas essa
// função é privada lá; pequena o bastante pra duplicar em vez de exportar
// cross-module só por isso.
function diasUteisEmIntervalo(inicio: string, fim: string): number {
  let n = 0;
  let cursor = inicio;
  while (cursor <= fim) {
    if (!ehFimDeSemana(cursor)) n++;
    const d = paraDataUTC(cursor);
    d.setUTCDate(d.getUTCDate() + 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return n;
}

function TotaisResumo({ t }: { t: Totais }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-400">
      <span>
        Entrevistas <span className="text-stone-200">{t.entrevistasReal}/{t.entrevistasComp}</span>
      </span>
      <span>
        Assinaturas <span className="text-stone-200">{t.assinaturasReal}/{t.assinaturasComp}</span>
      </span>
      <span>
        Pagos <span className="text-stone-200">{t.pagosReal}/{t.pagosComp}</span>
      </span>
    </div>
  );
}

export default async function CompromissosPage({
  searchParams,
}: {
  searchParams: { inicio?: string; fim?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  const analistaLiberado = profile?.role === "analista" && (await podeVerArea(supabase, user.id, profile.role, "dados"));
  const isLider = profile?.role === "lider";
  if (profile?.role !== "diretor" && !analistaLiberado && !isLider) redirect("/");

  const hoje = hojeBR();
  // Período personalizado — pedido do Diretor, 2026-09-29: "quero a opção
  // de ver período personalizado também, pra ver quanto se comprometeram x
  // quanto entregaram". Sem parâmetro na URL, comportamento de sempre (só
  // hoje, com os botões de marcar falta); com `inicio`/`fim`, agrega todos
  // os dias do intervalo por pessoa em vez de mostrar só um dia.
  const inicioParam = searchParams.inicio && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.inicio) ? searchParams.inicio : null;
  const fimParam = searchParams.fim && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.fim) ? searchParams.fim : hoje;
  const modoPeriodo = inicioParam !== null;
  const inicio = inicioParam ?? hoje;
  const fim = fimParam;
  const finalDeSemana = !modoPeriodo && ehFimDeSemana(hoje);

  // Líder só vê o próprio Exército (mesmo recorte de sempre — CentralNotificacoes,
  // Fechamento Semanal etc.); Diretor/Analista veem a firma inteira.
  const meuExercitoId = isLider
    ? (await supabase.from("exercitos").select("id").eq("legado_id", user.id).maybeSingle()).data?.id ?? null
    : null;

  const [{ data: pessoas }, { data: tribosRaw }, { data: exercitosRaw }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url, role, tribo_id")
      .in("role", ["sdr", "closer"])
      .eq("ativo", true)
      .order("full_name"),
    supabase.from("tribos").select("id, nome, exercito_id").order("nome"),
    supabase.from("exercitos").select("id, nome").order("nome"),
  ]);

  const tribosVisiveis = isLider ? (tribosRaw ?? []).filter((t) => t.exercito_id === meuExercitoId) : (tribosRaw ?? []);
  const idsTribosVisiveis = new Set(tribosVisiveis.map((t) => t.id));
  const pessoasVisiveis = isLider ? (pessoas ?? []).filter((p) => p.tribo_id && idsTribosVisiveis.has(p.tribo_id)) : (pessoas ?? []);
  const exercitosVisiveis = isLider ? (exercitosRaw ?? []).filter((e) => e.id === meuExercitoId) : (exercitosRaw ?? []);

  const idsPessoas = pessoasVisiveis.map((p) => p.id);
  const { data: compromissosPeriodo } = idsPessoas.length
    ? await supabase
        .from("compromissos")
        .select(
          "profile_id, data, entrevistas_comp, entrevistas_real, assinaturas_comp, assinaturas_real, pagos_comp, pagos_real, falta, lancado"
        )
        .gte("data", inicio)
        .lte("data", fim)
        .in("profile_id", idsPessoas)
    : { data: [] };

  // Modo "hoje": mantém o StreakRow de sempre (1 linha = 1 dia), usado pros
  // estados "ausente"/"não lançou"/cor da borda. Modo período: agrega todas
  // as linhas do intervalo por pessoa — não existe "a falta de hoje" pra um
  // intervalo de várias semanas, então os botões de falta somem nesse modo.
  const linhasHoje = new Map((compromissosPeriodo ?? []).filter((c) => c.data === hoje).map((c) => [c.profile_id, c as StreakRow]));
  const diasUteisNoPeriodo = diasUteisEmIntervalo(inicio, fim) || 1;

  type PessoaComCompromisso = {
    id: string;
    nome: string;
    avatarUrl: string | null;
    role: string;
    triboId: string | null;
    row: StreakRow | null;
    totais: Totais;
  };

  const pessoasComCompromisso: PessoaComCompromisso[] = pessoasVisiveis.map((p) => {
    if (modoPeriodo) {
      const linhasPessoa = (compromissosPeriodo ?? []).filter((c) => c.profile_id === p.id);
      const totais = linhasPessoa.reduce(
        (acc, c) =>
          somar(acc, {
            ...totaisVazios(),
            entrevistasComp: c.entrevistas_comp,
            entrevistasReal: c.entrevistas_real,
            assinaturasComp: c.assinaturas_comp,
            assinaturasReal: c.assinaturas_real,
            pagosComp: c.pagos_comp,
            pagosReal: c.pagos_real,
            lancaram: c.lancado && !c.falta ? 1 : 0,
          }),
        totaisVazios()
      );
      totais.total = diasUteisNoPeriodo;
      return { id: p.id, nome: p.full_name, avatarUrl: p.avatar_url, role: p.role, triboId: p.tribo_id, row: null, totais };
    }
    const row = linhasHoje.get(p.id) ?? null;
    const totais: Totais = {
      ...totaisVazios(),
      entrevistasComp: row?.entrevistas_comp ?? 0,
      entrevistasReal: row?.entrevistas_real ?? 0,
      assinaturasComp: row?.assinaturas_comp ?? 0,
      assinaturasReal: row?.assinaturas_real ?? 0,
      pagosComp: row?.pagos_comp ?? 0,
      pagosReal: row?.pagos_real ?? 0,
      lancaram: row?.lancado && !row.falta ? 1 : 0,
      total: 1,
    };
    return { id: p.id, nome: p.full_name, avatarUrl: p.avatar_url, role: p.role, triboId: p.tribo_id, row, totais };
  });

  const pessoasPorTribo = new Map<string, PessoaComCompromisso[]>();
  for (const p of pessoasComCompromisso) {
    if (!p.triboId) continue;
    if (!pessoasPorTribo.has(p.triboId)) pessoasPorTribo.set(p.triboId, []);
    pessoasPorTribo.get(p.triboId)!.push(p);
  }

  const tribosComPessoas = tribosVisiveis.map((t) => {
    const membros = pessoasPorTribo.get(t.id) ?? [];
    const totais = membros.reduce((acc, m) => somar(acc, m.totais), totaisVazios());
    return { id: t.id, nome: t.nome, exercitoId: t.exercito_id, membros, totais };
  });

  const exercitosComTribos = exercitosVisiveis.map((e) => {
    const tribos = tribosComPessoas.filter((t) => t.exercitoId === e.id);
    const totais = tribos.reduce((acc, t) => somar(acc, t.totais), totaisVazios());
    return { id: e.id, nome: e.nome, tribos, totais };
  });

  const totalFirma = exercitosComTribos.reduce((acc, e) => somar(acc, e.totais), totaisVazios());

  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const dataFmt = new Date(hoje + "T00:00:00");
  const fmtCurta = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    return `${d.getDate()} de ${MESES[d.getMonth()]}`;
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Compromissos</h1>
        <p className="kicker mt-1">
          {modoPeriodo
            ? `${fmtCurta(inicio)} — ${fmtCurta(fim)} · comprometido × entregue no período`
            : `${dataFmt.getDate()} de ${MESES[dataFmt.getMonth()]} · compromisso do dia, de cada pessoa até ${isLider ? "o Exército inteiro" : "o Império inteiro"}`}
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded border border-imperium-line bg-imperium-bg/40 p-3 text-xs">
        <div>
          <label className="mb-1 block text-[10px] uppercase text-stone-500">De</label>
          <input type="date" name="inicio" defaultValue={inicio} max={hoje} className="input-imp px-2 py-1 text-xs" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase text-stone-500">Até</label>
          <input type="date" name="fim" defaultValue={fim} max={hoje} className="input-imp px-2 py-1 text-xs" />
        </div>
        <button type="submit" className="btn-gold px-3 py-1.5 text-xs">Ver período</button>
        {modoPeriodo && (
          <a href="/compromissos" className="btn-outline px-3 py-1.5 text-xs">
            ← Voltar pra hoje
          </a>
        )}
      </form>

      {finalDeSemana && (
        <p className="rounded border border-imperium-line bg-imperium-bg/40 px-4 py-2 text-xs text-stone-500">
          Hoje é fim de semana — compromisso diário não é obrigatório em sábado/domingo.
        </p>
      )}

      <Card
        title={modoPeriodo ? "Comprometido × entregue no período · toda a visão" : "Compromisso do dia · toda a visão"}
        right={
          <Badge tone={finalDeSemana || totalFirma.lancaram === totalFirma.total ? "success" : "warning"} variant="solid">
            {totalFirma.lancaram}/{totalFirma.total} {modoPeriodo ? "dias com lançamento" : "lançaram"}
          </Badge>
        }
      >
        <TotaisResumo t={totalFirma} />
      </Card>

      {exercitosComTribos.map((exercito) => (
        <details key={exercito.id} open className="card-imp group">
          <summary className="mb-4 flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-3">
              <h2 className="font-display text-lg text-gold-bright">{exercito.nome}</h2>
              <Badge tone={finalDeSemana || exercito.totais.lancaram === exercito.totais.total ? "success" : "warning"} variant="tag">
                {exercito.totais.lancaram}/{exercito.totais.total} {modoPeriodo ? "dias" : "lançaram"}
              </Badge>
            </div>
            <span className="text-[10px] text-stone-500 transition group-open:rotate-180">▾</span>
          </summary>

          <div className="mb-4">
            <TotaisResumo t={exercito.totais} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {exercito.tribos.map((tribo) => (
              <div key={tribo.id} className="rounded-lg border border-imperium-line bg-imperium-bg/40 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-display text-base text-stone-100">{tribo.nome}</h3>
                  <Badge tone={finalDeSemana || tribo.totais.lancaram === tribo.totais.total ? "success" : "warning"} variant="tag">
                    {tribo.totais.lancaram}/{tribo.totais.total}
                  </Badge>
                </div>
                <div className="mb-3">
                  <TotaisResumo t={tribo.totais} />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {tribo.membros.map((m) => {
                    if (modoPeriodo) {
                      const t = m.totais;
                      return (
                        <div key={m.id} className="rounded border border-imperium-line bg-imperium-surface p-2.5">
                          <div className="mb-1.5 flex items-center gap-2">
                            {m.avatarUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={m.avatarUrl} alt={m.nome} className="h-6 w-6 shrink-0 rounded-full border border-imperium-line-strong object-cover" />
                            ) : (
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-imperium-line-strong bg-imperium-bg text-[9px] text-stone-500">
                                {m.nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                              </div>
                            )}
                            <p className="min-w-0 flex-1 truncate text-xs text-stone-200">{m.nome}</p>
                            <span className="shrink-0 text-[9px] text-stone-500">{t.lancaram}/{t.total} dias</span>
                          </div>
                          <div className="space-y-0.5 text-[11px] text-stone-400">
                            <p>
                              Entr. <span className={t.entrevistasReal >= t.entrevistasComp ? "text-success-bright" : "text-stone-300"}>{t.entrevistasReal}/{t.entrevistasComp}</span>
                            </p>
                            <p>
                              Assin. <span className={t.assinaturasReal >= t.assinaturasComp ? "text-success-bright" : "text-stone-300"}>{t.assinaturasReal}/{t.assinaturasComp}</span>
                            </p>
                            <p>
                              Pagos <span className={t.pagosReal >= t.pagosComp ? "text-success-bright" : "text-stone-300"}>{t.pagosReal}/{t.pagosComp}</span>
                            </p>
                          </div>
                        </div>
                      );
                    }

                    const cumpriu = m.row && !m.row.falta && m.row.lancado && cumpriuCompromisso(m.row);
                    const ausente = m.row?.falta;
                    const naoLancou = !finalDeSemana && (!m.row || !m.row.lancado);
                    const corBorda = ausente
                      ? "border-imperium-line-strong"
                      : naoLancou
                        ? "border-warning/40"
                        : cumpriu
                          ? "border-success/40"
                          : "border-imperium-line";
                    return (
                      <div key={m.id} className={`rounded border ${corBorda} bg-imperium-surface p-2.5`}>
                        <div className="mb-1.5 flex items-center gap-2">
                          {m.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={m.avatarUrl} alt={m.nome} className="h-6 w-6 shrink-0 rounded-full border border-imperium-line-strong object-cover" />
                          ) : (
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-imperium-line-strong bg-imperium-bg text-[9px] text-stone-500">
                              {m.nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
                            </div>
                          )}
                          <p className="min-w-0 flex-1 truncate text-xs text-stone-200">{m.nome}</p>
                          {ausente ? (
                            <form action={desmarcarFaltaTime}>
                              <input type="hidden" name="profile_id" value={m.id} />
                              <button type="submit" className="shrink-0 text-[9px] text-wine-bright hover:underline">
                                Remover falta
                              </button>
                            </form>
                          ) : (
                            <form action={marcarFaltaTime}>
                              <input type="hidden" name="profile_id" value={m.id} />
                              <button type="submit" className="shrink-0 text-[9px] text-stone-600 hover:text-wine-bright">
                                Falta
                              </button>
                            </form>
                          )}
                        </div>
                        {ausente ? (
                          <p className="text-[11px] text-stone-500">Ausente</p>
                        ) : !m.row && finalDeSemana ? (
                          <p className="text-[11px] text-stone-600">Fim de semana</p>
                        ) : naoLancou ? (
                          <p className="text-[11px] text-warning">Não lançou</p>
                        ) : (
                          <div className="space-y-0.5 text-[11px] text-stone-400">
                            <p>
                              Entr. <span className={m.row!.entrevistas_real >= m.row!.entrevistas_comp ? "text-success-bright" : "text-stone-300"}>{m.row!.entrevistas_real}/{m.row!.entrevistas_comp}</span>
                            </p>
                            <p>
                              Assin. <span className={m.row!.assinaturas_real >= m.row!.assinaturas_comp ? "text-success-bright" : "text-stone-300"}>{m.row!.assinaturas_real}/{m.row!.assinaturas_comp}</span>
                            </p>
                            <p>
                              Pagos <span className={m.row!.pagos_real >= m.row!.pagos_comp ? "text-success-bright" : "text-stone-300"}>{m.row!.pagos_real}/{m.row!.pagos_comp}</span>
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {tribo.membros.length === 0 && <p className="text-xs text-stone-600 sm:col-span-2">Sem membros nessa Tribo.</p>}
                </div>
              </div>
            ))}
          </div>
        </details>
      ))}
    </main>
  );
}
