import { createClient } from "@/lib/supabase/server";
import {
  buscarRecordesAuto,
  buscarRecordesCurados,
  buscarTopClosersHistorico,
  buscarTopSdrsHistorico,
  buscarContadorGuerraCivil,
  type RecordeAuto,
  type RecordeCurado,
  type RankingHistorico,
  type ContadorGuerraCivil,
} from "@/lib/recordes";
import { MESES_LABEL } from "@/lib/metas";
import { IconCrown, IconSwords, IconMedal, IconLaurel, IconScroll } from "@/components/ui/icons";
import RecordeForm from "./recorde-form";
import { excluirRecordeCurado } from "./actions";

const fmtMoeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

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

  // Recorde de time com brasão conhecido: o brasão vira metade do cartão,
  // bem grande, em vez do ícone pequeno — pedido explícito do Diretor pra
  // dar mais "peso" visual a Exército/Tribo.
  if (r.crestUrl) {
    return (
      <div className="card-imp relative flex overflow-hidden p-0">
        <div className="relative w-2/5 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.crestUrl} alt={r.nome} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-imperium-surface" />
        </div>
        <div className="flex-1 p-5">
          <h3 className="kicker">{r.titulo}</h3>
          <p className="mt-1 font-display text-2xl leading-tight text-gold-bright drop-shadow-[0_0_10px_rgba(232,200,116,0.2)]">
            {formatarValor(r)}
          </p>
          <p className="mt-2 text-sm text-stone-200">{r.nome}</p>
          {quando && <p className="mt-0.5 text-[11px] uppercase tracking-wide text-stone-600">{quando}</p>}
        </div>
      </div>
    );
  }

  const avatares = (r.avatarUrls ?? []).filter((_, i) => i < 3);

  return (
    <div className="card-imp group relative overflow-hidden p-6 transition hover:border-gold/50">
      <div className={`pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${aura} to-transparent blur-2xl transition group-hover:scale-125`} />
      {avatares.length > 0 ? (
        <div className="relative flex -space-x-3">
          {avatares.map((url, i) =>
            url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={url}
                alt=""
                className="h-11 w-11 rounded-full border-2 border-imperium-surface object-cover shadow-[0_0_10px_rgba(232,200,116,0.3)]"
              />
            ) : (
              <div
                key={i}
                className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-imperium-surface bg-imperium-raised text-stone-500"
              >
                <IconMedal className="h-5 w-5" />
              </div>
            )
          )}
        </div>
      ) : (
        <Icon className="relative h-7 w-7 text-gold-bright drop-shadow-[0_0_6px_rgba(232,200,116,0.35)]" />
      )}
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

function Top5Lista({ titulo, ranking }: { titulo: string; ranking: RankingHistorico[] }) {
  if (ranking.length === 0) return null;
  const [primeiro, ...resto] = ranking;
  return (
    <div className="card-imp relative overflow-hidden p-6">
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-gold/25 to-transparent blur-2xl" />
      <div className="relative flex items-center gap-2">
        <IconMedal className="h-5 w-5 text-gold-bright" />
        <h3 className="font-display text-base tracking-wide text-gold-bright">{titulo}</h3>
      </div>
      <div className="relative mt-4 rounded border border-gold/40 bg-gold/5 p-4 text-center">
        {primeiro.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primeiro.avatarUrl}
            alt=""
            className="mx-auto h-14 w-14 rounded-full border-2 border-gold object-cover shadow-[0_0_15px_rgba(232,200,116,0.45)]"
          />
        ) : (
          <IconCrown className="mx-auto h-6 w-6 text-gold-bright drop-shadow-[0_0_8px_rgba(232,200,116,0.4)]" />
        )}
        <p className="mt-1 font-display text-xl text-gold-bright">{primeiro.nome}</p>
        <p className="text-sm text-stone-300">{fmtMoeda(primeiro.valor)}</p>
      </div>
      {resto.length > 0 && (
        <ol className="relative mt-3 space-y-1.5">
          {resto.map((r) => (
            <li key={r.nome} className="flex items-center justify-between text-sm">
              <span className="text-stone-400">
                {r.posicao}. {r.nome}
              </span>
              <span className="text-stone-300">{fmtMoeda(r.valor)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function LadoGuerraCivil({ nome, vitorias, credito, crest, borda }: { nome: string; vitorias: number; credito: number; crest: string | null; borda?: boolean }) {
  return (
    <div className={`relative flex flex-col items-center justify-center gap-1 overflow-hidden p-8 ${borda ? "border-l border-gold/20" : ""}`}>
      {crest && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={crest} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-15" />
      )}
      <p className="relative font-display text-4xl text-gold-bright drop-shadow-[0_0_10px_rgba(232,200,116,0.2)]">{vitorias}</p>
      <p className="relative text-sm text-stone-300">meses de {nome}</p>
      <p className="relative mt-1 text-xs text-stone-500">{fmtMoeda(credito)} pagos no total</p>
    </div>
  );
}

function ScoreboardGuerraCivil({ contador }: { contador: ContadorGuerraCivil }) {
  const total = contador.vitoriasA + contador.vitoriasB;
  return (
    <div className="card-imp relative overflow-hidden p-0 sm:col-span-2 lg:col-span-3">
      <div className="relative flex items-center justify-center gap-2 border-b border-gold/20 p-4">
        <IconSwords className="h-5 w-5 text-gold-bright" />
        <h3 className="font-display text-base tracking-wide text-gold-bright">Guerra Civil Histórica</h3>
      </div>
      <div className="grid grid-cols-2">
        <LadoGuerraCivil nome={contador.nomeA} vitorias={contador.vitoriasA} credito={contador.creditoA} crest={contador.crestA} />
        <LadoGuerraCivil nome={contador.nomeB} vitorias={contador.vitoriasB} credito={contador.creditoB} crest={contador.crestB} borda />
      </div>
      {total === 0 && <p className="relative p-3 text-center text-xs text-stone-600">Sem meses computados ainda.</p>}
    </div>
  );
}

function CardCurado({ r, souDiretor }: { r: RecordeCurado; souDiretor: boolean }) {
  return (
    <div className="card-imp relative overflow-hidden p-6">
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-gold/20 to-transparent blur-2xl" />
      {r.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={r.avatarUrl}
          alt=""
          className="relative h-11 w-11 rounded-full border-2 border-gold/50 object-cover shadow-[0_0_10px_rgba(232,200,116,0.3)]"
        />
      ) : (
        <IconScroll className="relative h-6 w-6 text-gold-bright" />
      )}
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

  const [recordesAuto, recordesCurados, topClosers, topSdrs, contadorGuerraCivil] = await Promise.all([
    buscarRecordesAuto(supabase),
    buscarRecordesCurados(supabase),
    buscarTopClosersHistorico(supabase),
    buscarTopSdrsHistorico(supabase),
    buscarContadorGuerraCivil(supabase),
  ]);

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

      <section>
        <div className="mb-4 flex items-center gap-2.5 border-b border-gold/20 pb-2">
          <IconSwords className="h-5 w-5 text-gold-bright" />
          <h2 className="font-display text-lg tracking-wide text-gold-bright">Recordes de Time</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {time.map((r) => (
            <CardRecorde key={r.titulo} r={r} />
          ))}
          {contadorGuerraCivil && <ScoreboardGuerraCivil contador={contadorGuerraCivil} />}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2.5 border-b border-gold/20 pb-2">
          <IconMedal className="h-5 w-5 text-gold-bright" />
          <h2 className="font-display text-lg tracking-wide text-gold-bright">Recordes Individuais</h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {individuais.map((r) => (
            <CardRecorde key={r.titulo} r={r} />
          ))}
          <Top5Lista titulo="Top 5 Closers da História" ranking={topClosers} />
          <Top5Lista titulo="Top 5 SDRs da História" ranking={topSdrs} />
        </div>
      </section>

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
