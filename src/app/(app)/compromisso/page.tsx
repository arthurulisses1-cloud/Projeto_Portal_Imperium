import { createClient } from "@/lib/supabase/server";
import { registrarCompromisso } from "./actions";
import Card from "@/components/ui/Card";

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
  if (isHoje) return { texto: "Em andamento", cor: "text-gold" };
  return { texto: "Não cumprido", cor: "text-wine-bright" };
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
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Compromisso</h1>
        <p className="kicker mt-1">Meta e acompanhamento do dia</p>
      </div>
      <Card title="Hoje">
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
                  className="input-imp"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-stone-400">Assinaturas</label>
                <input
                  name="assinaturas_comp"
                  type="number"
                  min={0}
                  defaultValue={0}
                  className="input-imp"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-stone-400">Pagos</label>
                <input
                  name="pagos_comp"
                  type="number"
                  min={0}
                  defaultValue={0}
                  className="input-imp"
                />
              </div>
            </div>
            <button type="submit" className="btn-gold">
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
              planilha estiver ligada.
            </p>
          </div>
        )}
      </Card>

      <Card
        title="Histórico do mês"
        right={
          pctCumprido !== null && (
            <span className="text-sm text-gold">{pctCumprido}% cumprido</span>
          )
        }
      >
        {historico && historico.length > 0 ? (
          <ul className="space-y-3">
            {historico.map((row) => {
              const s = statusLabel(row, false);
              return (
                <li key={row.data} className="border-b border-imperium-line pb-3 text-sm last:border-0">
                  <div className="flex items-center justify-between">
                    <span className="text-stone-300">
                      {new Date(row.data + "T00:00:00").toLocaleDateString("pt-BR", {
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                    <span className={s.cor}>{s.texto}</span>
                  </div>
                  {row.lancado && !row.falta && (
                    <div className="mt-1.5 flex gap-4 text-xs text-stone-500">
                      <span>
                        Entrevistas{" "}
                        <span className={row.entrevistas_real >= row.entrevistas_comp ? "text-emerald-400" : "text-stone-400"}>
                          {row.entrevistas_real}/{row.entrevistas_comp}
                        </span>
                      </span>
                      <span>
                        Assinaturas{" "}
                        <span className={row.assinaturas_real >= row.assinaturas_comp ? "text-emerald-400" : "text-stone-400"}>
                          {row.assinaturas_real}/{row.assinaturas_comp}
                        </span>
                      </span>
                      <span>
                        Pagos{" "}
                        <span className={row.pagos_real >= row.pagos_comp ? "text-emerald-400" : "text-stone-400"}>
                          {row.pagos_real}/{row.pagos_comp}
                        </span>
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">Nenhum registro anterior neste mês.</p>
        )}
      </Card>
    </main>
  );
}
