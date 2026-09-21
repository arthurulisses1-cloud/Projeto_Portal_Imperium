"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { FunilContagem, PessoaVisao } from "@/lib/visao-diaria";
import type { Confronto } from "@/lib/guerra";
import type { CampanhaComProgresso } from "@/lib/campanhas";
import type { RecordeAuto, RecordeCurado } from "@/lib/recordes";

const INTERVALO_SLIDE_MS = 15_000;
// Painel fica ligado o dia todo numa TV — refetch periódico pros números
// (ligações, entrevistas, guerra...) não ficarem parados na hora que
// carregou pela manhã. Não interfere no ciclo local dos slides (estado
// do client component sobrevive ao refresh, só as props mudam).
const INTERVALO_REFRESH_MS = 120_000;

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

type Props = {
  funilHoje: FunilContagem;
  topConexoesHoje: PessoaVisao[];
  topEntrevistasMes: PessoaVisao[];
  topCreditoMes: Confronto[];
  confrontoExercitos: Confronto[];
  confrontoTribos: Confronto[];
  crestsTribos: Record<string, string>;
  campanhasAtivas: CampanhaComProgresso[];
  recordesAuto: RecordeAuto[];
  recordesCurados: RecordeCurado[];
};

export default function TvDisplay(props: Props) {
  const router = useRouter();
  const [slide, setSlide] = useState(0);

  const slides = [
    <SlideLigacoesHoje key="ligacoes" funil={props.funilHoje} />,
    <SlideRanking key="conexoes" titulo="Top 10 Conexões do dia" icone="📞" pessoas={props.topConexoesHoje} campo="conexoes" />,
    <SlideGuerra key="tribos" titulo="Guerra de Tribos" dados={props.confrontoTribos} crests={props.crestsTribos} />,
    <SlideRanking key="credito" titulo="Top 10 Crédito do mês" icone="💰" credito={props.topCreditoMes} />,
    <SlideGuerra key="exercitos" titulo="Guerra de Exércitos" dados={props.confrontoExercitos} />,
    <SlideCampanhas key="campanhas" campanhas={props.campanhasAtivas} />,
    <SlideRanking key="entrevistas" titulo="Top 5 Entrevistas do mês" icone="🎙️" pessoas={props.topEntrevistasMes} campo="entrevistas" />,
    <SlideRecordes key="recordes" auto={props.recordesAuto} curados={props.recordesCurados} />,
  ];

  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % slides.length), INTERVALO_SLIDE_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length]);

  useEffect(() => {
    const id = setInterval(() => router.refresh(), INTERVALO_REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-imperium-bg">
      {slides[slide % slides.length]}
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
        {slides.map((_, i) => (
          <span
            key={i}
            className="h-1.5 w-8 rounded-full transition-colors"
            style={{ background: i === slide ? "#c9a227" : "rgba(255,255,255,0.15)" }}
          />
        ))}
      </div>
    </div>
  );
}

function SlideShell({
  titulo,
  icone,
  children,
}: {
  titulo: string;
  icone?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full w-full flex-col px-16 py-14">
      <h1 className="font-display text-5xl text-gold-bright">
        {icone} {titulo}
      </h1>
      <div className="mt-10 flex-1">{children}</div>
    </div>
  );
}

function SlideLigacoesHoje({ funil }: { funil: FunilContagem }) {
  const tiles: { label: string; valor: number; cor: string }[] = [
    { label: "Tentativas", valor: funil.tentativas, cor: "#9c9070" },
    { label: "Alôs", valor: funil.alos, cor: "#5b8aa6" },
    { label: "Conexões", valor: funil.conexoes, cor: "#b08d57" },
    { label: "Entrevistas", valor: funil.entrevistas, cor: "#b3453f" },
  ];
  return (
    <SlideShell titulo="Ligações do dia — ao vivo" icone="📈">
      <div className="grid h-full grid-cols-2 gap-8">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="flex flex-col items-center justify-center rounded-2xl border border-imperium-line"
            style={{ background: `${t.cor}1a` }}
          >
            <p className="font-display text-8xl" style={{ color: t.cor }}>
              {t.valor.toLocaleString("pt-BR")}
            </p>
            <p className="mt-3 text-2xl uppercase tracking-widest text-stone-300">{t.label}</p>
          </div>
        ))}
      </div>
    </SlideShell>
  );
}

function SlideRanking({
  titulo,
  icone,
  pessoas,
  campo,
  credito,
}: {
  titulo: string;
  icone: string;
  pessoas?: PessoaVisao[];
  campo?: "conexoes" | "entrevistas";
  credito?: Confronto[];
}) {
  const linhas = credito
    ? credito.map((c) => ({ nome: c.nome, valor: c.valor, formatoMoeda: true }))
    : (pessoas ?? []).map((p) => ({ nome: p.nome, valor: campo ? p.funil[campo] : 0, formatoMoeda: false }));

  return (
    <SlideShell titulo={titulo} icone={icone}>
      {linhas.length === 0 ? (
        <p className="text-2xl text-stone-500">Sem dados ainda.</p>
      ) : (
        <div className="space-y-3">
          {linhas.map((l, i) => (
            <div key={l.nome} className="flex items-center gap-5">
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-display text-xl ${
                  i === 0 ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-400"
                }`}
              >
                {i + 1}
              </span>
              <span className={`flex-1 text-2xl ${i === 0 ? "text-gold-bright" : "text-stone-100"}`}>{l.nome}</span>
              <span className={`font-display text-3xl ${i === 0 ? "text-gold-bright" : "text-stone-300"}`}>
                {l.formatoMoeda ? moeda(l.valor) : l.valor.toLocaleString("pt-BR")}
              </span>
            </div>
          ))}
        </div>
      )}
    </SlideShell>
  );
}

function SlideGuerra({ titulo, dados, crests }: { titulo: string; dados: Confronto[]; crests?: Record<string, string> }) {
  const max = Math.max(...dados.map((d) => d.valor), 1);
  return (
    <SlideShell titulo={titulo} icone="⚔️">
      {dados.length === 0 ? (
        <p className="text-2xl text-stone-500">Sem produção registrada neste mês ainda.</p>
      ) : (
        <div className="space-y-6">
          {dados.map((d, i) => (
            <div key={d.nome}>
              <div className="mb-2 flex items-center justify-between">
                <span className={`flex items-center gap-3 text-2xl ${i === 0 ? "text-gold-bright" : "text-stone-200"}`}>
                  {crests?.[d.nome] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={crests[d.nome]} alt="" className="h-10 w-10 rounded-full object-cover" />
                  )}
                  {i === 0 && "👑"} {d.nome}
                </span>
                <span className={`font-display text-3xl ${i === 0 ? "text-gold-bright" : "text-stone-300"}`}>{moeda(d.valor)}</span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-imperium-line">
                <div
                  className={`h-full rounded-full ${i === 0 ? "bg-gradient-to-r from-gold to-gold-bright" : "bg-wine"}`}
                  style={{ width: `${(d.valor / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </SlideShell>
  );
}

function SlideCampanhas({ campanhas }: { campanhas: CampanhaComProgresso[] }) {
  return (
    <SlideShell titulo="Campanhas do Senatus" icone="🏆">
      {campanhas.length === 0 ? (
        <p className="text-2xl text-stone-500">Nenhuma campanha ativa no momento.</p>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {campanhas.slice(0, 4).map((c) => (
            <div key={c.id} className="rounded-2xl border border-imperium-line bg-imperium-surface p-6">
              <h3 className="font-display text-2xl text-gold-bright">{c.titulo}</h3>
              {c.descricao && <p className="mt-2 line-clamp-2 text-lg text-stone-400">{c.descricao}</p>}
              {c.recompensa && <p className="mt-2 text-base text-stone-500">🎁 {c.recompensa}</p>}
              {c.participantes.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  {c.participantes.slice(0, 3).map((p) => (
                    <div key={p.refId} className="flex justify-between text-base text-stone-300">
                      <span>{p.label}</span>
                      <span className="text-gold">{p.valor.toLocaleString("pt-BR")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SlideShell>
  );
}

function SlideRecordes({ auto, curados }: { auto: RecordeAuto[]; curados: RecordeCurado[] }) {
  function fmt(r: RecordeAuto) {
    if (r.formato === "moeda") return moeda(r.valor);
    if (r.formato === "dias") return `${r.valor} dias`;
    return r.valor.toLocaleString("pt-BR");
  }
  const destaques = auto.slice(0, 4);
  const curado = curados[0];

  return (
    <SlideShell titulo="Anais do Império — melhores da história" icone="📜">
      <div className="grid grid-cols-2 gap-6">
        {destaques.map((r) => (
          <div key={r.titulo} className="rounded-2xl border border-imperium-line bg-imperium-surface p-6">
            <p className="text-sm uppercase tracking-widest text-stone-500">{r.titulo}</p>
            <p className="mt-2 font-display text-3xl text-gold-bright">{r.nome}</p>
            <p className="mt-1 text-2xl text-stone-200">{fmt(r)}</p>
          </div>
        ))}
        {curado && (
          <div className="col-span-2 rounded-2xl border border-gold/30 bg-gold/5 p-6">
            <p className="text-sm uppercase tracking-widest text-gold">{curado.titulo}</p>
            {curado.descricao && <p className="mt-2 text-xl text-stone-200">{curado.descricao}</p>}
            {curado.valorTexto && <p className="mt-1 font-display text-2xl text-gold-bright">{curado.valorTexto}</p>}
          </div>
        )}
      </div>
    </SlideShell>
  );
}
