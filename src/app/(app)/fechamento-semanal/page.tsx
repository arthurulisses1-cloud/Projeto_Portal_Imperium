import { createClient } from "@/lib/supabase/server";
import { hojeBR, paraDataUTC } from "@/lib/data-br";

// Fechamento Semanal — pedido do Diretor, 2026-09-22: aba só de líderes,
// recorte do próprio Exército (RLS de weekly_operacoes é aberta pra
// líder ver tudo — ver migration 0024 — então o filtro por membro do
// Exército é feito aqui, na mão; entrevistas_leads já vem escopado pela
// RLS: is_lider_of_exercito, migration 0053).
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function fmtData(iso: string | null) {
  if (!iso) return "—";
  const d = paraDataUTC(iso);
  return `${DIAS_SEMANA[d.getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function addDias(dataISO: string, dias: number): string {
  const d = paraDataUTC(dataISO);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function addMeses(dataISO: string, meses: number): string {
  const [ano, mes] = dataISO.split("-").map(Number);
  const total = mes - 1 + meses;
  const anoNovo = ano + Math.floor(total / 12);
  const mesNovo = (((total % 12) + 12) % 12) + 1;
  return `${anoNovo}-${String(mesNovo).padStart(2, "0")}-01`;
}

// Segunda-feira da semana de `dataISO`, até o domingo seguinte (fim exclusivo).
function semanaDe(dataISO: string): { inicio: string; fimExclusivo: string } {
  const seg = paraDataUTC(dataISO);
  const diaSemana = seg.getUTCDay(); // 0=domingo
  seg.setUTCDate(seg.getUTCDate() - ((diaSemana + 6) % 7));
  const inicio = seg.toISOString().slice(0, 10);
  return { inicio, fimExclusivo: addDias(inicio, 7) };
}

function mesDe(dataISO: string): { inicio: string; fimExclusivo: string } {
  const [ano, mes] = dataISO.split("-").map(Number);
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
  return { inicio, fimExclusivo: addMeses(inicio, 1) };
}

export default async function FechamentoSemanalPage({
  searchParams,
}: {
  searchParams: { data?: string; visao?: string };
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: meProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (meProfile?.role !== "lider") {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-xl text-gold-bright">Acesso restrito</h1>
        <p className="mt-2 text-sm text-stone-400">Fechamento Semanal é uma visão exclusiva dos líderes de Exército.</p>
      </main>
    );
  }

  const { data: exercitoLiderado } = await supabase.from("exercitos").select("id, nome").eq("legado_id", user.id).maybeSingle();
  if (!exercitoLiderado) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-xl text-gold-bright">Sem Exército vinculado</h1>
        <p className="mt-2 text-sm text-stone-400">Seu usuário não está marcado como líder de nenhum Exército ainda — fala com o Diretor.</p>
      </main>
    );
  }

  const visao = searchParams.visao === "mes" ? "mes" : "semana";
  const dataRef = searchParams.data && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.data) ? searchParams.data : hojeBR();
  const periodo = visao === "mes" ? mesDe(dataRef) : semanaDe(dataRef);
  const { inicio, fimExclusivo } = periodo;
  const periodoAnterior = visao === "mes" ? addMeses(inicio, -1) : addDias(inicio, -7);
  const periodoSeguinte = visao === "mes" ? addMeses(inicio, 1) : addDias(inicio, 7);
  const fimInclusivo = addDias(fimExclusivo, -1);

  // Membros do Exército — pra filtrar weekly_operacoes na mão (RLS libera
  // líder pra ver TODAS as operações, não só as do próprio Exército).
  const { data: pessoasRaw } = await supabase
    .from("profiles")
    .select("id, full_name, tribo:tribos!profiles_tribo_id_fkey(exercito_id)")
    .in("role", ["sdr", "closer", "lider"])
    .eq("ativo", true);
  const nomePorId = new Map((pessoasRaw ?? []).map((p) => [p.id, p.full_name]));
  const idsExercito = new Set(
    (pessoasRaw ?? [])
      .filter((p) => {
        const tribo = p.tribo as unknown as { exercito_id: string } | null;
        return tribo?.exercito_id === exercitoLiderado.id || p.id === user.id;
      })
      .map((p) => p.id)
  );

  const [{ data: entrevistasRaw }, { data: assinaturasRaw }, { data: pagosRaw }] = await Promise.all([
    // RLS (is_lider_of_exercito) já escopa pro Exército certo.
    supabase
      .from("entrevistas_leads")
      .select("id, lead_nome, id_msp, data, sdr_profile_id, closer_profile_id")
      .gte("data", inicio)
      .lt("data", fimExclusivo)
      .order("data", { ascending: false }),
    supabase
      .from("weekly_operacoes")
      .select("id, cliente, valor, data, sdr_profile_id, closer_profile_id")
      .gte("data", inicio)
      .lt("data", fimExclusivo),
    supabase
      .from("weekly_operacoes")
      .select("id, cliente, valor, pago_em, sdr_profile_id, closer_profile_id")
      .eq("status", "PAGO")
      .gte("pago_em", inicio)
      .lt("pago_em", fimExclusivo),
  ]);

  const doExercito = (sdrId: string | null, closerId: string | null) =>
    (sdrId && idsExercito.has(sdrId)) || (closerId && idsExercito.has(closerId));

  const entrevistas = (entrevistasRaw ?? []).filter((e) => doExercito(e.sdr_profile_id, e.closer_profile_id));
  const assinaturas = (assinaturasRaw ?? []).filter((o) => doExercito(o.sdr_profile_id, o.closer_profile_id));
  const pagos = (pagosRaw ?? []).filter((o) => doExercito(o.sdr_profile_id, o.closer_profile_id));

  const valorAssinado = assinaturas.reduce((s, o) => s + Number(o.valor), 0);
  const valorPago = pagos.reduce((s, o) => s + Number(o.valor), 0);

  const hrefPeriodo = (data: string, v: string) => `/fechamento-semanal?data=${data}&visao=${v}`;

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Fechamento Semanal</h1>
        <p className="text-xs text-stone-400">{exercitoLiderado.nome} — entrevistas, assinaturas e pagos do período.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <a href={hrefPeriodo(dataRef, "semana")} className={`rounded-full px-3 py-1.5 text-xs font-medium ${visao === "semana" ? "btn-gold" : "btn-outline"}`}>
            Semana
          </a>
          <a href={hrefPeriodo(dataRef, "mes")} className={`rounded-full px-3 py-1.5 text-xs font-medium ${visao === "mes" ? "btn-gold" : "btn-outline"}`}>
            Mês
          </a>
        </div>
        <div className="flex items-center gap-3">
          <a href={hrefPeriodo(periodoAnterior, visao)} className="btn-outline px-2.5 py-1.5 text-xs">
            ← {visao === "mes" ? "mês anterior" : "semana anterior"}
          </a>
          <span className="font-display text-sm text-stone-200">
            {visao === "mes"
              ? paraDataUTC(inicio).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
              : `${fmtData(inicio)} — ${fmtData(fimInclusivo)}`}
          </span>
          <a href={hrefPeriodo(periodoSeguinte, visao)} className="btn-outline px-2.5 py-1.5 text-xs">
            {visao === "mes" ? "mês seguinte" : "semana seguinte"} →
          </a>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card-imp text-center">
          <p className="font-display text-3xl text-gold-bright">{entrevistas.length}</p>
          <p className="kicker mt-1">Entrevistas</p>
        </div>
        <div className="card-imp text-center">
          <p className="font-display text-3xl text-gold-bright">{assinaturas.length}</p>
          <p className="kicker mt-1">Assinaturas</p>
        </div>
        <div className="card-imp text-center">
          <p className="font-display text-3xl text-gold-bright">{pagos.length}</p>
          <p className="kicker mt-1">Pagos</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card-imp text-center">
          <p className="font-display text-2xl text-success-bright">{moeda(valorAssinado)}</p>
          <p className="kicker mt-1">Valor assinado</p>
        </div>
        <div className="card-imp text-center">
          <p className="font-display text-2xl text-success-bright">{moeda(valorPago)}</p>
          <p className="kicker mt-1">Valor pago</p>
        </div>
      </div>

      <TabelaEntrevistas linhas={entrevistas} nomePorId={nomePorId} />
      <TabelaOperacoes titulo="Assinaturas" colunaData="Data da assinatura" linhas={assinaturas.map((o) => ({ ...o, dataRef: o.data }))} nomePorId={nomePorId} />
      <TabelaOperacoes titulo="Pagos" colunaData="Data do pagamento" linhas={pagos.map((o) => ({ ...o, dataRef: o.pago_em }))} nomePorId={nomePorId} />
    </main>
  );
}

type EntrevistaLinha = { id: string; lead_nome: string; id_msp: string | null; data: string; sdr_profile_id: string | null; closer_profile_id: string | null };

function TabelaEntrevistas({ linhas, nomePorId }: { linhas: EntrevistaLinha[]; nomePorId: Map<string, string> }) {
  return (
    <section className="card-imp space-y-3">
      <h2 className="font-display text-lg text-gold-bright">Entrevistas ({linhas.length})</h2>
      {linhas.length === 0 ? (
        <p className="text-xs text-stone-500">Nenhuma entrevista nesse período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-imperium-line text-stone-500">
                <th className="py-2 pr-3 font-normal">Lead</th>
                <th className="py-2 pr-3 font-normal">ID do lead</th>
                <th className="py-2 pr-3 font-normal">Data</th>
                <th className="py-2 pr-3 font-normal">SDR</th>
                <th className="py-2 font-normal">Closer</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-b border-imperium-line/50">
                  <td className="py-2 pr-3 text-stone-100">{l.lead_nome}</td>
                  <td className="py-2 pr-3 text-stone-500">{l.id_msp ?? "—"}</td>
                  <td className="py-2 pr-3 text-stone-400">{fmtData(l.data)}</td>
                  <td className="py-2 pr-3 text-stone-300">{l.sdr_profile_id ? (nomePorId.get(l.sdr_profile_id) ?? "—") : "—"}</td>
                  <td className="py-2 text-stone-300">{l.closer_profile_id ? (nomePorId.get(l.closer_profile_id) ?? "—") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type OperacaoLinha = { id: string; cliente: string | null; valor: number; dataRef: string | null; sdr_profile_id: string | null; closer_profile_id: string | null };

function TabelaOperacoes({
  titulo,
  colunaData,
  linhas,
  nomePorId,
}: {
  titulo: string;
  colunaData: string;
  linhas: OperacaoLinha[];
  nomePorId: Map<string, string>;
}) {
  return (
    <section className="card-imp space-y-3">
      <h2 className="font-display text-lg text-gold-bright">
        {titulo} ({linhas.length})
      </h2>
      {linhas.length === 0 ? (
        <p className="text-xs text-stone-500">Nenhuma operação nesse período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-imperium-line text-stone-500">
                <th className="py-2 pr-3 font-normal">Lead</th>
                <th className="py-2 pr-3 font-normal">Valor do crédito</th>
                <th className="py-2 pr-3 font-normal">{colunaData}</th>
                <th className="py-2 pr-3 font-normal">SDR</th>
                <th className="py-2 font-normal">Closer</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-b border-imperium-line/50">
                  <td className="py-2 pr-3 text-stone-100">{l.cliente ?? "—"}</td>
                  <td className="py-2 pr-3 text-gold">{moeda(Number(l.valor))}</td>
                  <td className="py-2 pr-3 text-stone-400">{fmtData(l.dataRef)}</td>
                  <td className="py-2 pr-3 text-stone-300">{l.sdr_profile_id ? (nomePorId.get(l.sdr_profile_id) ?? "—") : "—"}</td>
                  <td className="py-2 text-stone-300">{l.closer_profile_id ? (nomePorId.get(l.closer_profile_id) ?? "—") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
