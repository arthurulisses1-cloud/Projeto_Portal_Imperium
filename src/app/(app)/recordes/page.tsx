import { createClient } from "@/lib/supabase/server";
import { buscarRecordesAuto, buscarRecordesCurados, type RecordeAuto, type RecordeCurado } from "@/lib/recordes";
import { MESES_LABEL } from "@/lib/metas";
import { IconMedal } from "@/components/ui/icons";
import RecordeForm from "./recorde-form";
import { excluirRecordeCurado } from "./actions";

function formatarValor(r: Pick<RecordeAuto, "valor" | "formato">) {
  if (r.formato === "moeda") return r.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  if (r.formato === "dias") return `${r.valor.toLocaleString("pt-BR")} dias`;
  return r.valor.toLocaleString("pt-BR");
}

function formatarQuando(data?: string) {
  if (!data) return null;
  if (/^\d{4}-\d{2}$/.test(data)) {
    const [ano, mes] = data.split("-").map(Number);
    return `${MESES_LABEL[mes - 1]}/${ano}`;
  }
  return new Date(data + "T00:00:00").toLocaleDateString("pt-BR");
}

function CardRecorde({ r }: { r: RecordeAuto }) {
  const quando = formatarQuando(r.data);
  return (
    <div className="watermark-spqr card-imp flex flex-col gap-1 p-4">
      <div className="flex items-center gap-1.5">
        <IconMedal className="h-4 w-4 text-gold-bright" />
        <h3 className="kicker">{r.titulo}</h3>
      </div>
      <p className="font-display text-lg text-gold-bright">{formatarValor(r)}</p>
      <p className="text-sm text-stone-300">{r.nome}</p>
      {quando && <p className="text-[11px] text-stone-600">{quando}</p>}
    </div>
  );
}

function Secao({ titulo, recordes }: { titulo: string; recordes: RecordeAuto[] }) {
  if (recordes.length === 0) return null;
  return (
    <section>
      <h2 className="kicker mb-3">{titulo}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {recordes.map((r) => (
          <CardRecorde key={r.titulo} r={r} />
        ))}
      </div>
    </section>
  );
}

function CardCurado({ r, souDiretor }: { r: RecordeCurado; souDiretor: boolean }) {
  return (
    <div className="watermark-spqr card-imp flex flex-col gap-1 p-4">
      <h3 className="kicker">{r.titulo}</h3>
      {r.valorTexto && <p className="font-display text-lg text-gold-bright">{r.valorTexto}</p>}
      {r.nomePessoa && <p className="text-sm text-stone-300">{r.nomePessoa}</p>}
      {r.descricao && <p className="text-xs text-stone-500">{r.descricao}</p>}
      {r.dataReferencia && (
        <p className="text-[11px] text-stone-600">{new Date(r.dataReferencia + "T00:00:00").toLocaleDateString("pt-BR")}</p>
      )}
      {souDiretor && (
        <form action={excluirRecordeCurado} className="mt-1">
          <input type="hidden" name="id" value={r.id} />
          <button type="submit" className="text-[11px] text-wine hover:underline">
            Remover
          </button>
        </form>
      )}
    </div>
  );
}

export default async function RecordesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("role").eq("id", user.id).single() : { data: null };
  const souDiretor = profile?.role === "diretor";

  const [recordesAuto, recordesCurados] = await Promise.all([buscarRecordesAuto(supabase), buscarRecordesCurados(supabase)]);

  const empresa = recordesAuto.filter((r) => r.categoria === "empresa");
  const time = recordesAuto.filter((r) => r.categoria === "time");
  const individuais = recordesAuto.filter((r) => r.categoria === "individual");

  let pessoas: { id: string; full_name: string }[] = [];
  if (souDiretor) {
    const { data } = await supabase.from("profiles").select("id, full_name").order("full_name");
    pessoas = data ?? [];
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Anais do Império</h1>
        <p className="kicker mt-1">Os recordes históricos da operação</p>
      </div>

      <Secao titulo="Recordes da Empresa" recordes={empresa} />
      <Secao titulo="Recordes de Time" recordes={time} />
      <Secao titulo="Recordes Individuais" recordes={individuais} />

      <section>
        <h2 className="kicker mb-3">Crônicas</h2>
        {recordesCurados.length === 0 ? (
          <p className="text-xs text-stone-600">Nenhuma crônica registrada ainda.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recordesCurados.map((r) => (
              <CardCurado key={r.id} r={r} souDiretor={souDiretor} />
            ))}
          </div>
        )}
      </section>

      {souDiretor && (
        <section>
          <h2 className="kicker mb-3">Registrar nova crônica</h2>
          <RecordeForm pessoas={pessoas} />
        </section>
      )}
    </main>
  );
}
