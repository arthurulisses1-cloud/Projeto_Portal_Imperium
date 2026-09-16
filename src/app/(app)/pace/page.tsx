import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { buscarPaceMes, type PaceDia } from "@/lib/pace";
import type { EscopoTime } from "@/lib/metas";
import Card from "@/components/ui/Card";

const MESES = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function num(v: number) {
  return Math.round(v).toLocaleString("pt-BR");
}
function pct(v: number | null) {
  return v === null ? "—" : `${(v * 100).toFixed(1)}%`;
}
function pctDia(realizado: number, meta: number) {
  return meta > 0 ? `${((realizado / meta) * 100).toFixed(0)}%` : "—";
}

// Linha do resumo Meta/Realizado (mesmo par etapa+conversão que a
// planilha de Forecast mostra: "Alôs: 48.000 (50,0%)").
function LinhaResumo({ label, valor, percentual, formato }: { label: string; valor: number; percentual: number | null; formato: "num" | "moeda" }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-stone-400">{label}</span>
      <span className="text-stone-100">
        {formato === "moeda" ? moeda(valor) : num(valor)}
        {percentual !== null && <span className="ml-1.5 text-xs text-gold">({pct(percentual)})</span>}
      </span>
    </div>
  );
}

const CAMPOS_ACUMULAVEIS = ["tentativas", "alos", "conexoes", "entrevistas", "assinadosQtd", "assinadosValor", "pagosQtd", "pagosValor"] as const;
type CampoAcumulavel = (typeof CAMPOS_ACUMULAVEIS)[number];

type Pill = { label: string; href: string; ativo: boolean };

export default async function PacePage({
  searchParams,
}: {
  searchParams: { exercito?: string; tribo?: string; pessoa?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: meuPerfil } = await supabase.from("profiles").select("role, tribo_id, full_name").eq("id", user.id).single();
  if (!meuPerfil || !["sdr", "closer", "lider", "diretor"].includes(meuPerfil.role)) redirect("/");

  const [{ data: exercitos }, { data: tribos }] = await Promise.all([
    supabase.from("exercitos").select("id, nome, legado_id").order("nome"),
    supabase.from("tribos").select("id, nome, exercito_id, closer:profiles!tribos_closer_id_fkey(id, full_name)").order("nome"),
  ]);
  const nomeExercitoPorId = new Map((exercitos ?? []).map((e) => [e.id, e.nome]));
  const nomeTriboPorId = new Map((tribos ?? []).map((t) => [t.id, t.nome]));

  // Resolve o escopo pedido (searchParams), validando permissão por papel
  // — pedido do Diretor, 2026-09-16: Diretor escolhe Geral/Exército/Tribo à
  // vontade; Líder vê o próprio Exército e pode entrar em cada Tribo dele;
  // Closer vê a própria Tribo e pode entrar em cada pessoa dela; SDR só
  // enxerga o próprio pace, sem seletor.
  let escopo: EscopoTime = null;
  let subtitulo = "Geral da firma";
  let pills: { titulo: string; itens: Pill[] }[] = [];

  if (meuPerfil.role === "sdr") {
    escopo = { tipo: "individual", profileId: user.id };
    subtitulo = "Seu pace pessoal";
  } else if (meuPerfil.role === "closer") {
    const minhaTribo = (tribos ?? []).find((t) => (t.closer as unknown as { id: string } | null)?.id === user.id);
    if (!minhaTribo) {
      return (
        <main className="mx-auto max-w-lg px-6 py-16 text-center">
          <h1 className="font-display text-xl text-gold-bright">Sem Tribo vinculada</h1>
          <p className="mt-2 text-sm text-stone-400">Você ainda não tem uma Tribo. Crie uma em &ldquo;Minha Tribo&rdquo; primeiro.</p>
        </main>
      );
    }
    const { data: sdrsDaTribo } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("tribo_id", minhaTribo.id)
      .eq("role", "sdr")
      .eq("ativo", true)
      .order("full_name");
    const pessoasValidas = new Set([user.id, ...(sdrsDaTribo ?? []).map((s) => s.id)]);
    if (searchParams.pessoa && pessoasValidas.has(searchParams.pessoa)) {
      escopo = { tipo: "individual", profileId: searchParams.pessoa };
      subtitulo = searchParams.pessoa === user.id ? "Seu pace pessoal" : (sdrsDaTribo ?? []).find((s) => s.id === searchParams.pessoa)?.full_name ?? "Pessoa";
    } else {
      escopo = { tipo: "tribo", triboId: minhaTribo.id };
      subtitulo = `Tribo ${minhaTribo.nome}`;
    }
    pills = [
      {
        titulo: "Ver",
        itens: [
          { label: `Geral da Tribo`, href: "/pace", ativo: !searchParams.pessoa },
          { label: "Eu", href: "/pace?pessoa=" + user.id, ativo: searchParams.pessoa === user.id },
          ...(sdrsDaTribo ?? []).map((s) => ({ label: s.full_name, href: `/pace?pessoa=${s.id}`, ativo: searchParams.pessoa === s.id })),
        ],
      },
    ];
  } else if (meuPerfil.role === "lider") {
    const meuExercito = (exercitos ?? []).find((e) => e.legado_id === user.id);
    if (!meuExercito) {
      return (
        <main className="mx-auto max-w-lg px-6 py-16 text-center">
          <h1 className="font-display text-xl text-gold-bright">Sem Exército vinculado</h1>
          <p className="mt-2 text-sm text-stone-400">Peça pro Diretor te vincular como Legado de um Exército.</p>
        </main>
      );
    }
    const minhasTribos = (tribos ?? []).filter((t) => t.exercito_id === meuExercito.id);
    const triboValida = searchParams.tribo && minhasTribos.some((t) => t.id === searchParams.tribo) ? searchParams.tribo : null;
    if (triboValida) {
      escopo = { tipo: "tribo", triboId: triboValida };
      subtitulo = `Tribo ${nomeTriboPorId.get(triboValida) ?? ""}`;
    } else {
      escopo = { tipo: "exercito", exercitoId: meuExercito.id };
      subtitulo = `Exército ${meuExercito.nome}`;
    }
    pills = [
      {
        titulo: "Ver",
        itens: [
          { label: `Meu Exército`, href: "/pace", ativo: !triboValida },
          ...minhasTribos.map((t) => ({ label: t.nome, href: `/pace?tribo=${t.id}`, ativo: triboValida === t.id })),
        ],
      },
    ];
  } else {
    // diretor
    const triboValida = searchParams.tribo && (tribos ?? []).some((t) => t.id === searchParams.tribo) ? searchParams.tribo : null;
    const exercitoValido = searchParams.exercito && (exercitos ?? []).some((e) => e.id === searchParams.exercito) ? searchParams.exercito : null;
    if (triboValida) {
      escopo = { tipo: "tribo", triboId: triboValida };
      subtitulo = `Tribo ${nomeTriboPorId.get(triboValida) ?? ""}`;
    } else if (exercitoValido) {
      escopo = { tipo: "exercito", exercitoId: exercitoValido };
      subtitulo = `Exército ${nomeExercitoPorId.get(exercitoValido) ?? ""}`;
    } else {
      escopo = null;
      subtitulo = "Geral da firma (IMPERIUM)";
    }
    pills = [
      {
        titulo: "Visão geral",
        itens: [
          { label: "IMPERIUM (geral)", href: "/pace", ativo: !triboValida && !exercitoValido },
          ...(exercitos ?? []).map((e) => ({ label: e.nome, href: `/pace?exercito=${e.id}`, ativo: exercitoValido === e.id })),
        ],
      },
      {
        titulo: "Tribos",
        itens: (tribos ?? []).map((t) => ({
          label: `${t.nome} (${nomeExercitoPorId.get(t.exercito_id) ?? ""})`,
          href: `/pace?tribo=${t.id}`,
          ativo: triboValida === t.id,
        })),
      },
    ];
  }

  const pace = await buscarPaceMes(supabase, escopo);
  const agora = new Date();

  // Acumulado = soma corrida de (realizado - meta) dia a dia, mesma
  // fórmula da planilha — computado aqui pra não guardar estado redundante
  // em buscarPaceMes.
  const acumulado: Record<CampoAcumulavel, number> = {
    tentativas: 0, alos: 0, conexoes: 0, entrevistas: 0,
    assinadosQtd: 0, assinadosValor: 0, pagosQtd: 0, pagosValor: 0,
  };
  const linhas = pace.dias.map((dia) => {
    const acc: Record<CampoAcumulavel, number> = { ...acumulado };
    for (const campo of CAMPOS_ACUMULAVEIS) {
      acumulado[campo] += dia[campo].realizado - dia[campo].meta;
      acc[campo] = acumulado[campo];
    }
    return { dia, acc };
  });

  return (
    <main className="mx-auto max-w-[1400px] space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Pace</h1>
        <p className="kicker mt-1">
          Ritmo diário do funil — {MESES[agora.getUTCMonth() + 1]}, {subtitulo}
        </p>
      </div>

      {pills.length > 0 && (
        <div className="space-y-2">
          {pills.map((grupo) => (
            <div key={grupo.titulo} className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-stone-500">{grupo.titulo}:</span>
              {grupo.itens.map((p) => (
                <a
                  key={p.href}
                  href={p.href}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    p.ativo ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold/40"
                  }`}
                >
                  {p.label}
                </a>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Meta do mês">
          <div className="space-y-1.5">
            <LinhaResumo label="Tentativas" valor={pace.meta.tentativas} percentual={null} formato="num" />
            <LinhaResumo label="Alôs" valor={pace.meta.alos} percentual={pace.meta.alosPct} formato="num" />
            <LinhaResumo label="Conexões" valor={pace.meta.conexoes} percentual={pace.meta.conexoesPct} formato="num" />
            <LinhaResumo label="Entrevistas" valor={pace.meta.entrevistas} percentual={pace.meta.entrevistasPct} formato="num" />
            <LinhaResumo label="Assinados" valor={pace.meta.assinados} percentual={pace.meta.assinadosPct} formato="num" />
            <LinhaResumo label="Pagos" valor={pace.meta.pagos} percentual={pace.meta.pagosPct} formato="num" />
            <div className="mt-2 border-t border-imperium-line pt-2">
              <LinhaResumo label="Ticket médio" valor={pace.meta.tkm} percentual={null} formato="moeda" />
              <LinhaResumo label="Crédito" valor={pace.meta.credito} percentual={null} formato="moeda" />
            </div>
          </div>
        </Card>

        <Card title="Realizado do mês">
          <div className="space-y-1.5">
            <LinhaResumo label="Tentativas" valor={pace.realizado.tentativas} percentual={null} formato="num" />
            <LinhaResumo label="Alôs" valor={pace.realizado.alos} percentual={pace.realizado.alosPct} formato="num" />
            <LinhaResumo label="Conexões" valor={pace.realizado.conexoes} percentual={pace.realizado.conexoesPct} formato="num" />
            <LinhaResumo label="Entrevistas" valor={pace.realizado.entrevistas} percentual={pace.realizado.entrevistasPct} formato="num" />
            <LinhaResumo label="Assinados" valor={pace.realizado.assinados} percentual={pace.realizado.assinadosPct} formato="num" />
            <LinhaResumo label="Pagos" valor={pace.realizado.pagos} percentual={pace.realizado.pagosPct} formato="num" />
            <div className="mt-2 border-t border-imperium-line pt-2">
              <LinhaResumo label="Ticket médio" valor={pace.realizado.tkm} percentual={null} formato="moeda" />
              <LinhaResumo label="Crédito" valor={pace.realizado.credito} percentual={null} formato="moeda" />
            </div>
          </div>
        </Card>
      </div>

      <Card title="Pace diário">
        <div className="overflow-x-auto">
          <table className="min-w-[2200px] border-collapse text-xs">
            <thead>
              <tr>
                <th colSpan={3} className="sticky left-0 z-10 bg-imperium-surface" />
                <GrupoHeader titulo="Tentativas" cor="bg-stone-700/40" />
                <GrupoHeader titulo="Alôs" cor="bg-wine/20" />
                <GrupoHeader titulo="Conexões" cor="bg-gold/20" />
                <GrupoHeader titulo="Entrevistas" cor="bg-stone-700/40" />
                <GrupoHeader titulo="Assinados R$" cor="bg-success/20" />
                <GrupoHeader titulo="Assinados Qtd" cor="bg-success/10" />
                <GrupoHeader titulo="Pagos R$" cor="bg-gold/30" />
                <GrupoHeader titulo="Pagos Qtd" cor="bg-gold/15" />
                <th colSpan={3} className="border-b border-imperium-line px-2 py-1 text-center text-[10px] uppercase tracking-wide text-stone-400">
                  Ticket Médio
                </th>
              </tr>
              <tr className="text-[10px] uppercase tracking-wide text-stone-500">
                <th className="sticky left-0 z-10 bg-imperium-surface px-2 py-1 text-left">Dia</th>
                <th className="px-2 py-1 text-left">Data</th>
                <th className="px-2 py-1 text-left">Útil</th>
                {Array.from({ length: 8 }).map((_, i) => (
                  <SubHeader key={i} comAcumulado />
                ))}
                <SubHeaderTkm />
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ dia, acc }) => (
                <LinhaDia key={dia.data} dia={dia} acc={acc} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </main>
  );
}

function GrupoHeader({ titulo, cor }: { titulo: string; cor: string }) {
  return (
    <th colSpan={4} className={`border-b border-imperium-line px-2 py-1 text-center text-[10px] uppercase tracking-wide text-stone-300 ${cor}`}>
      {titulo}
    </th>
  );
}

function SubHeader({ comAcumulado }: { comAcumulado: boolean }) {
  return (
    <>
      <th className="px-1.5 py-1 text-right">Real.</th>
      <th className="px-1.5 py-1 text-right">Meta</th>
      <th className="px-1.5 py-1 text-right">Ating.</th>
      {comAcumulado && <th className="px-1.5 py-1 text-right">Acum.</th>}
    </>
  );
}

function SubHeaderTkm() {
  return (
    <>
      <th className="px-1.5 py-1 text-right">Real.</th>
      <th className="px-1.5 py-1 text-right">Meta</th>
      <th className="px-1.5 py-1 text-right">Ating.</th>
    </>
  );
}

function Celula({ children, mut }: { children: React.ReactNode; mut?: boolean }) {
  return <td className={`px-1.5 py-1 text-right ${mut ? "text-stone-500" : "text-stone-100"}`}>{children}</td>;
}

function CelulaAcum({ v, moedaFmt }: { v: number; moedaFmt?: boolean }) {
  const cor = v > 0 ? "text-success-bright" : v < 0 ? "text-wine-bright" : "text-stone-500";
  return <td className={`px-1.5 py-1 text-right ${cor}`}>{moedaFmt ? moeda(v) : num(v)}</td>;
}

function GrupoCelulas({
  par,
  acumulado,
  moedaFmt,
}: {
  par: { realizado: number; meta: number };
  acumulado: number;
  moedaFmt?: boolean;
}) {
  return (
    <>
      <Celula>{moedaFmt ? moeda(par.realizado) : num(par.realizado)}</Celula>
      <Celula mut>{moedaFmt ? moeda(par.meta) : num(par.meta)}</Celula>
      <Celula mut>{pctDia(par.realizado, par.meta)}</Celula>
      <CelulaAcum v={acumulado} moedaFmt={moedaFmt} />
    </>
  );
}

function LinhaDia({ dia, acc }: { dia: PaceDia; acc: Record<CampoAcumulavel, number> }) {
  return (
    <tr className={`border-b border-imperium-line/50 ${!dia.util ? "opacity-40" : ""}`}>
      <td className="sticky left-0 z-10 bg-imperium-bg px-2 py-1 capitalize text-stone-300">{dia.diaSemana.replace("-feira", "")}</td>
      <td className="px-2 py-1 text-stone-400">{new Date(dia.data + "T00:00:00").toLocaleDateString("pt-BR")}</td>
      <td className="px-2 py-1 text-stone-500">{dia.util ? "Útil" : "—"}</td>
      <GrupoCelulas par={dia.tentativas} acumulado={acc.tentativas} />
      <GrupoCelulas par={dia.alos} acumulado={acc.alos} />
      <GrupoCelulas par={dia.conexoes} acumulado={acc.conexoes} />
      <GrupoCelulas par={dia.entrevistas} acumulado={acc.entrevistas} />
      <GrupoCelulas par={dia.assinadosValor} acumulado={acc.assinadosValor} moedaFmt />
      <GrupoCelulas par={dia.assinadosQtd} acumulado={acc.assinadosQtd} />
      <GrupoCelulas par={dia.pagosValor} acumulado={acc.pagosValor} moedaFmt />
      <GrupoCelulas par={dia.pagosQtd} acumulado={acc.pagosQtd} />
      <Celula>{moeda(dia.tkm.realizado)}</Celula>
      <Celula mut>{moeda(dia.tkm.meta)}</Celula>
      <Celula mut>{pctDia(dia.tkm.realizado, dia.tkm.meta)}</Celula>
    </tr>
  );
}
