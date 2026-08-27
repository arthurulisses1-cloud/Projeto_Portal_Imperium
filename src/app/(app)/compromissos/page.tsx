import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { cumpriuCompromisso, type StreakRow } from "@/lib/streak";
import { marcarFaltaTime, desmarcarFaltaTime } from "@/app/(app)/exercito/actions";

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

export default async function CompromissosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "diretor") redirect("/");

  const hoje = new Date().toISOString().slice(0, 10);

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

  const idsPessoas = (pessoas ?? []).map((p) => p.id);
  const { data: compromissosHoje } = idsPessoas.length
    ? await supabase
        .from("compromissos")
        .select(
          "profile_id, data, entrevistas_comp, entrevistas_real, assinaturas_comp, assinaturas_real, pagos_comp, pagos_real, falta, lancado"
        )
        .eq("data", hoje)
        .in("profile_id", idsPessoas)
    : { data: [] };
  const compromissoPorPessoa = new Map((compromissosHoje ?? []).map((c) => [c.profile_id, c as StreakRow]));

  type PessoaComCompromisso = {
    id: string;
    nome: string;
    avatarUrl: string | null;
    role: string;
    triboId: string | null;
    row: StreakRow | null;
    totais: Totais;
  };

  const pessoasComCompromisso: PessoaComCompromisso[] = (pessoas ?? []).map((p) => {
    const row = compromissoPorPessoa.get(p.id) ?? null;
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

  const tribosComPessoas = (tribosRaw ?? []).map((t) => {
    const membros = pessoasPorTribo.get(t.id) ?? [];
    const totais = membros.reduce((acc, m) => somar(acc, m.totais), totaisVazios());
    return { id: t.id, nome: t.nome, exercitoId: t.exercito_id, membros, totais };
  });

  const exercitosComTribos = (exercitosRaw ?? []).map((e) => {
    const tribos = tribosComPessoas.filter((t) => t.exercitoId === e.id);
    const totais = tribos.reduce((acc, t) => somar(acc, t.totais), totaisVazios());
    return { id: e.id, nome: e.nome, tribos, totais };
  });

  const totalFirma = exercitosComTribos.reduce((acc, e) => somar(acc, e.totais), totaisVazios());

  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const dataFmt = new Date(hoje + "T00:00:00");

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Compromissos</h1>
        <p className="kicker mt-1">
          {dataFmt.getDate()} de {MESES[dataFmt.getMonth()]} · compromisso do dia, de cada pessoa até o Império inteiro
        </p>
      </div>

      <Card
        title="Compromisso do dia · Império inteiro"
        right={
          <Badge tone={totalFirma.lancaram === totalFirma.total ? "success" : "warning"} variant="solid">
            {totalFirma.lancaram}/{totalFirma.total} lançaram
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
              <Badge tone={exercito.totais.lancaram === exercito.totais.total ? "success" : "warning"} variant="tag">
                {exercito.totais.lancaram}/{exercito.totais.total} lançaram
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
                  <Badge tone={tribo.totais.lancaram === tribo.totais.total ? "success" : "warning"} variant="tag">
                    {tribo.totais.lancaram}/{tribo.totais.total}
                  </Badge>
                </div>
                <div className="mb-3">
                  <TotaisResumo t={tribo.totais} />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {tribo.membros.map((m) => {
                    const cumpriu = m.row && !m.row.falta && m.row.lancado && cumpriuCompromisso(m.row);
                    const ausente = m.row?.falta;
                    const naoLancou = !m.row || !m.row.lancado;
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
