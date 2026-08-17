import { createClient } from "@/lib/supabase/server";
import { registrarCompromisso } from "./actions";

type CompromissoRow = {
  data: string;
  entrevistas_comp: number;
  entrevistas_real: number;
  assinaturas_comp: number;
  assinaturas_real: number;
  pagos_comp: number;
  pagos_real: number;
  falta: boolean;
  lancado: boolean;
};

function cumpriu(row: CompromissoRow) {
  return (
    row.entrevistas_real >= row.entrevistas_comp &&
    row.assinaturas_real >= row.assinaturas_comp &&
    row.pagos_real >= row.pagos_comp
  );
}

function statusLabel(row: CompromissoRow, isHoje: boolean) {
  if (row.falta) return { texto: "Ausente", cor: "text-stone-500" };
  if (cumpriu(row)) return { texto: "Cumprido", cor: "text-emerald-400" };
  if (isHoje) return { texto: "Em andamento", cor: "text-amber-400" };
  return { texto: "Não cumprido", cor: "text-red-400" };
}

export default async function CompromissoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const hoje = new Date().toISOString().slice(0, 10);

  const { data: hojeRow } = await supabase
    .from("compromissos")
    .select("*")
    .eq("profile_id", user.id)
    .eq("data", hoje)
    .maybeSingle();

  const primeiroDiaMes = hoje.slice(0, 7) + "-01";
  const { data: historico } = await supabase
    .from("compromissos")
    .select("*")
    .eq("profile_id", user.id)
    .gte("data", primeiroDiaMes)
    .lt("data", hoje)
    .order("data", { ascending: false })
    .limit(30);

  const diasComRegistro = (historico ?? []).filter((r) => r.lancado && !r.falta);
  const diasCumpridos = diasComRegistro.filter((r) => cumpriu(r));
  const pctCumprido =
    diasComRegistro.length > 0
      ? Math.round((diasCumpridos.length / diasComRegistro.length) * 100)
      : null;

  return (
    <>
      <main className="mx-auto max-w-2xl space-y-6 px-6 py-8">
        <div>
          <h1 className="font-serif text-xl text-amber-400">Compromisso</h1>
          <p className="text-xs text-stone-400">Meta e acompanhamento do dia</p>
        </div>
        <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-stone-400">
            Hoje
          </h2>

          {!hojeRow ? (
            <form action={registrarCompromisso} className="space-y-4">
              <p className="text-sm text-stone-400">
                Você ainda não lançou o compromisso de hoje. Define sua meta:
              </p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-xs text-stone-400">Entrevistas</label>
                  <input
                    name="entrevistas_comp"
                    type="number"
                    min={0}
                    defaultValue={0}
                    className="w-full rounded border border-stone-700 bg-[#0b0f19] px-3 py-2 text-stone-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-stone-400">Assinaturas</label>
                  <input
                    name="assinaturas_comp"
                    type="number"
                    min={0}
                    defaultValue={0}
                    className="w-full rounded border border-stone-700 bg-[#0b0f19] px-3 py-2 text-stone-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-stone-400">Pagos</label>
                  <input
                    name="pagos_comp"
                    type="number"
                    min={0}
                    defaultValue={0}
                    className="w-full rounded border border-stone-700 bg-[#0b0f19] px-3 py-2 text-stone-100"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="rounded bg-amber-500 px-4 py-2 text-sm font-medium text-[#0b0f19] hover:bg-amber-400"
              >
                Registrar compromisso do dia
              </button>
            </form>
          ) : (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className={`text-sm font-medium ${statusLabel(hojeRow, true).cor}`}>
                  {statusLabel(hojeRow, true).texto}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-stone-500">Entrevistas</p>
                  <p className="text-stone-100">
                    {hojeRow.entrevistas_real}/{hojeRow.entrevistas_comp}
                  </p>
                </div>
                <div>
                  <p className="text-stone-500">Assinaturas</p>
                  <p className="text-stone-100">
                    {hojeRow.assinaturas_real}/{hojeRow.assinaturas_comp}
                  </p>
                </div>
                <div>
                  <p className="text-stone-500">Pagos</p>
                  <p className="text-stone-100">
                    {hojeRow.pagos_real}/{hojeRow.pagos_comp}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs text-stone-600">
                O &quot;realizado&quot; atualiza automaticamente quando a integração com a
                planilha estiver ligada. Por enquanto fica em 0.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-stone-800 bg-[#111827] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-stone-400">
              Histórico do mês
            </h2>
            {pctCumprido !== null && (
              <span className="text-sm text-amber-400">{pctCumprido}% cumprido</span>
            )}
          </div>

          {historico && historico.length > 0 ? (
            <ul className="space-y-2">
              {historico.map((row) => {
                const s = statusLabel(row, false);
                return (
                  <li
                    key={row.data}
                    className="flex items-center justify-between border-b border-stone-800 pb-2 text-sm last:border-0"
                  >
                    <span className="text-stone-300">
                      {new Date(row.data + "T00:00:00").toLocaleDateString("pt-BR")}
                    </span>
                    <span className={s.cor}>{s.texto}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-stone-500">Nenhum registro anterior neste mês.</p>
          )}
        </section>
      </main>
    </>
  );
}
