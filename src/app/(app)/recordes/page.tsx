import { createClient } from "@/lib/supabase/server";
import { buscarRecordesAuto, buscarRecordesCurados, type RecordeAuto, type RecordeCurado } from "@/lib/recordes";
import { MESES_LABEL } from "@/lib/metas";
import { IconCrown, IconSwords, IconMedal, IconLaurel, IconScroll } from "@/components/ui/icons";
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

const CATEGORIA_ESTILO = {
  empresa: { icon: IconCrown, aura: "from-gold/25" },
  time: { icon: IconSwords, aura: "from-wine/25" },
  individual: { icon: IconMedal, aura: "from-purpura/25" },
} as const;

function CardRecorde({ r }: { r: RecordeAuto }) {
  const quando = formatarQuando(r.data);
  const { icon: Icon, aura } = CATEGORIA_ESTILO[r.categoria];
  return (
    <div className="card-imp group relative overflow-hidden p-6 transition hover:border-gold/50">
      <div className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${aura} to-transparent blur-2xl transition group-hover:scale-125`} />
      <Icon className="relative h-7 w-7 text-gold-bright drop-shadow-[0_0_6px_rgba(232,200,116,0.35)]" />
      <h3 className="kicker relative mt-3">{r.titulo}</h3>
      <p className="relative mt-1 font-display text-3xl leading-tight text-gold-bright drop-shadow-[0_0_10px_rgba(232,200,116,0.2)]">
        {formatarValor(r)}
      </p>
      <p className="relative mt-2 text-sm text-stone-200">{r.nome}</p>
      {quando && <p className="relative mt-0.5 text-[11px] uppercase tracking-wide text-stone-600">{quando}</p>}
    </div>
  );
}

function Secao({ titulo, recordes, icon: Icon }: { titulo: string; recordes: RecordeAuto[]; icon: typeof IconCrown }) {
  if (recordes.length === 0) return null;
  return (
    <section>
      <div className="mb-4 flex items-center gap-2.5 border-b border-gold/20 pb-2">
        <Icon className="h-5 w-5 text-gold-bright" />
        <h2 className="font-display text-lg tracking-wide text-gold-bright">{titulo}</h2>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {recordes.map((r) => (
          <CardRecorde key={r.titulo} r={r} />
        ))}
      </div>
    </section>
  );
}

function CardCurado({ r, souDiretor }: { r: RecordeCurado; souDiretor: boolean }) {
  return (
    <div className="card-imp relative overflow-hidden p-6">
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-gold/20 to-transparent blur-2xl" />
      <IconScroll className="relative h-6 w-6 text-gold-bright" />
      <h3 className="relative mt-3 font-display text-base text-gold-bright">{r.titulo}</h3>
      {r.valorTexto && <p className="relative mt-1 font-display text-2xl text-gold-bright">{r.valorTexto}</p>}
      {r.nomePessoa && <p className="relative mt-1 text-sm text-stone-200">{r.nomePessoa}</p>}
      {r.descricao && <p className="relative mt-2 text-xs text-stone-500">{r.descricao}</p>}
      {r.dataReferencia && (
        <p className="relative mt-2 text-[11px] uppercase tracking-wide text-stone-600">
          {new Date(r.dataReferencia + "T00:00:00").toLocaleDateString("pt-BR")}
        </p>
      )}
      {souDiretor && (
        <form action={excluirRecordeCurado} className="relative mt-3">
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
    <main className="mx-auto max-w-5xl space-y-10 px-6 py-8">
      <div className="relative overflow-hidden rounded-lg border border-gold/30 bg-gradient-to-b from-imperium-raised to-imperium-surface px-8 py-10 text-center shadow-[0_0_60px_-15px_rgba(232,200,116,0.25)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_0%,rgba(232,200,116,0.15),transparent)]" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/crests/imperium.jpg"
          alt=""
          className="relative mx-auto h-20 w-20 rounded-full border-2 border-gold/50 object-cover shadow-[0_0_25px_rgba(232,200,116,0.35)]"
        />
        <div className="relative mt-4 flex items-center justify-center gap-3">
          <IconLaurel className="h-6 w-10 -scale-x-100 text-gold" />
          <h1 className="font-display text-3xl tracking-wide text-gold-bright sm:text-4xl">Galeria de Recordes</h1>
          <IconLaurel className="h-6 w-10 text-gold" />
        </div>
        <p className="relative mt-2 text-sm uppercase tracking-[0.2em] text-stone-400">
          As maiores façanhas já registradas no Império
        </p>
      </div>

      <Secao titulo="Recordes da Empresa" recordes={empresa} icon={IconCrown} />
      <Secao titulo="Recordes de Time" recordes={time} icon={IconSwords} />
      <Secao titulo="Recordes Individuais" recordes={individuais} icon={IconMedal} />

      <section>
        <div className="mb-4 flex items-center gap-2.5 border-b border-gold/20 pb-2">
          <IconScroll className="h-5 w-5 text-gold-bright" />
          <h2 className="font-display text-lg tracking-wide text-gold-bright">Crônicas</h2>
        </div>
        {recordesCurados.length === 0 ? (
          <p className="text-xs text-stone-600">Nenhuma crônica registrada ainda.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
