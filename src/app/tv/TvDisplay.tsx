"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FunilContagem, PessoaVisao } from "@/lib/visao-diaria";
import type { Confronto } from "@/lib/guerra";
import type { CampanhaComProgresso } from "@/lib/campanhas";
import type { RecordeAuto, RecordeCurado } from "@/lib/recordes";
import {
  IconHorn,
  IconSwords,
  IconTarget,
  IconShield,
  IconCoin,
  IconEagle,
  IconTrophy,
  IconScroll,
  IconLaurel,
  IconBallot,
} from "@/components/ui/icons";

const INTERVALO_SLIDE_MS = 15_000;
// Painel fica ligado o dia todo numa TV — refetch periódico pros números
// (ligações, entrevistas, guerra...) não ficarem parados na hora que
// carregou pela manhã. Não interfere no ciclo local dos slides (estado
// do client component sobrevive ao refresh, só as props mudam).
const INTERVALO_REFRESH_MS = 120_000;

export type DueloExercito = {
  nome: string;
  tentativas: number;
  alos: number;
  conexoes: number;
  assinaturas: number;
  pagos: number;
  pagosValor: number;
};

export type EntrevistaHoje = {
  id: string;
  clienteNome: string;
  sdrNome: string;
  exercitoNome: string;
  triboNome: string;
};

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

// Identidade visual por tela — cada indicador tem sua própria atmosfera de
// cor (gradiente de fundo + cor de destaque), em vez de repetir o mesmo
// cartão cinza pra tudo. Pedido do Diretor, 2026-09-21: "muito parecido com
// IA... quero imagem profissional, algo que chame mais atenção".
const TEMAS = {
  ligacoes: { accent: "#d9b258", gradiente: "linear-gradient(160deg, #1d1811 0%, #100d09 100%)" },
  duelo: { accent: "#e7e2d6", gradiente: "linear-gradient(160deg, #17130f 0%, #0e0c0a 100%)" },
  conexoes: { accent: "#7bb3d6", gradiente: "linear-gradient(160deg, #0f1a1f 0%, #0a1215 100%)" },
  guerraTribos: { accent: "#d16b62", gradiente: "linear-gradient(160deg, #211412 0%, #140d0c 100%)" },
  credito: { accent: "#e8c874", gradiente: "linear-gradient(160deg, #201808 0%, #130e06 100%)" },
  guerraExercitos: { accent: "#b592e0", gradiente: "linear-gradient(160deg, #18121f 0%, #0e0b14 100%)" },
  campanhas: { accent: "#e0a94a", gradiente: "linear-gradient(160deg, #1e1609 0%, #120d06 100%)" },
  entrevistasHoje: { accent: "#6fc99a", gradiente: "linear-gradient(160deg, #0e1a12 0%, #0a100c 100%)" },
  entrevistas: { accent: "#8fc19e", gradiente: "linear-gradient(160deg, #10190f 0%, #0a100a 100%)" },
  lendas: { accent: "#cbb26a", gradiente: "linear-gradient(160deg, #191320 0%, #0f0c14 100%)" },
} as const;

type Props = {
  ordem: string[];
  funilHoje: FunilContagem;
  rankingLigacoesHoje: PessoaVisao[];
  duelo: DueloExercito[];
  entrevistasHoje: EntrevistaHoje[];
  topConexoesHoje: PessoaVisao[];
  topEntrevistasMes: PessoaVisao[];
  topCreditoMes: Confronto[];
  confrontoExercitos: Confronto[];
  confrontoTribos: Confronto[];
  crestsTribos: Record<string, string>;
  crestsExercitos: Record<string, string>;
  campanhasAtivas: CampanhaComProgresso[];
  recordesAuto: RecordeAuto[];
  recordesCurados: RecordeCurado[];
};

export default function TvDisplay(props: Props) {
  const router = useRouter();
  const [slide, setSlide] = useState(0);

  // Chaves batem com TV_SLIDES em src/lib/tv-config.ts (ordem editável em
  // /tv/config) — "duelo" só entra de fato quando existem 2 Exércitos pra
  // comparar; "campanhas" expande pra UMA tela por campanha ativa (ver
  // abaixo); as outras 8 sempre aparecem, sujeitas só à ordem escolhida.
  const slidesPorChave: Record<string, React.ReactElement | null> = {
    ligacoes: <SlideLigacoesHoje key="ligacoes" funil={props.funilHoje} ranking={props.rankingLigacoesHoje} />,
    duelo: props.duelo.length === 2 ? <SlideDuelo key="duelo" a={props.duelo[0]} b={props.duelo[1]} /> : null,
    "entrevistas-hoje": <SlideEntrevistasHoje key="entrevistas-hoje" entrevistas={props.entrevistasHoje} />,
    conexoes: (
      <SlideRanking
        key="conexoes"
        icon={IconTarget}
        titulo="Top 10 Conexões do dia"
        tema={TEMAS.conexoes}
        linhas={props.topConexoesHoje.map((p) => ({ nome: p.nome, valor: p.funil.conexoes }))}
      />
    ),
    tribos: (
      <SlideRanking
        key="tribos"
        icon={IconShield}
        titulo="Guerra de Tribos"
        tema={TEMAS.guerraTribos}
        linhas={props.confrontoTribos}
        crests={props.crestsTribos}
        formatoMoeda
      />
    ),
    credito: (
      <SlideRanking
        key="credito"
        icon={IconCoin}
        titulo="Top 10 Crédito do mês"
        tema={TEMAS.credito}
        linhas={props.topCreditoMes}
        formatoMoeda
      />
    ),
    exercitos:
      props.confrontoExercitos.length >= 2 ? (
        <SlideDuelPoster
          key="exercitos"
          icon={IconEagle}
          titulo="Guerra de Exércitos"
          tema={TEMAS.guerraExercitos}
          esquerda={{
            nome: props.confrontoExercitos[0].nome,
            valor: props.confrontoExercitos[0].valor,
            foto: props.crestsExercitos[props.confrontoExercitos[0].nome] ?? null,
          }}
          direita={{
            nome: props.confrontoExercitos[1].nome,
            valor: props.confrontoExercitos[1].valor,
            foto: props.crestsExercitos[props.confrontoExercitos[1].nome] ?? null,
          }}
          formatoMoeda
        />
      ) : (
        <SlideRanking
          key="exercitos"
          icon={IconEagle}
          titulo="Guerra de Exércitos"
          tema={TEMAS.guerraExercitos}
          linhas={props.confrontoExercitos}
          crests={props.crestsExercitos}
          formatoMoeda
        />
      ),
    "entrevistas-mes": (
      <SlideRanking
        key="entrevistas-mes"
        icon={IconScroll}
        titulo="Top 5 Entrevistas do mês"
        tema={TEMAS.entrevistas}
        linhas={props.topEntrevistasMes.map((p) => ({ nome: p.nome, valor: p.funil.entrevistas }))}
      />
    ),
    lendas: <SlideLendas key="lendas" auto={props.recordesAuto} curados={props.recordesCurados} />,
  };

  // "campanhas" é o único ponto de expansão 1-pra-N — cada campanha ativa
  // ganha sua própria tela cheia (pedido do Diretor, 2026-09-22: mais
  // espaço pras fotos de quem tá duelando), em vez de espremer 2 num card só.
  const slides = props.ordem.flatMap((chave): React.ReactElement[] => {
    if (chave === "campanhas") {
      if (props.campanhasAtivas.length === 0) return [<SlideCampanhaVazia key="campanhas-vazia" />];
      return props.campanhasAtivas.map((c) => {
        // Duelo de 2 (Copa Sampel, Tribal Wars/Balde War) vira o mesmo
        // pôster de foto gigante da Guerra de Exércitos — pedido do
        // Diretor, 2026-09-22: "quero que tomem a tela inteira". Campanha
        // com mais de 2 participantes continua na lista (não cabe como
        // duelo de 2 lados).
        if (c.participantes.length === 2) {
          const [p1, p2] = c.participantes;
          return (
            <SlideDuelPoster
              key={`campanha-${c.id}`}
              icon={IconTrophy}
              titulo={c.titulo}
              tema={TEMAS.campanhas}
              esquerda={{ nome: p1.label, valor: p1.valor, foto: p1.avatarUrl ?? p1.triboCrestUrl ?? p1.exercitoCrestUrl ?? null }}
              direita={{ nome: p2.label, valor: p2.valor, foto: p2.avatarUrl ?? p2.triboCrestUrl ?? p2.exercitoCrestUrl ?? null }}
            />
          );
        }
        return <SlideCampanha key={`campanha-${c.id}`} campanha={c} />;
      });
    }
    const el = slidesPorChave[chave];
    return el ? [el] : [];
  });

  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % slides.length), INTERVALO_SLIDE_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length]);

  useEffect(() => {
    const id = setInterval(() => router.refresh(), INTERVALO_REFRESH_MS);
    return () => clearInterval(id);
  }, [router]);

  if (slides.length === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-imperium-bg">
        <p className="text-stone-500">Nenhuma tela configurada.</p>
      </div>
    );
  }

  const atual = slide % slides.length;

  return (
    <div className="fixed inset-0 overflow-hidden">
      <BarraProgresso resetKey={atual} duracaoMs={INTERVALO_SLIDE_MS} />
      {slides[atual]}
    </div>
  );
}

function BarraProgresso({ resetKey, duracaoMs }: { resetKey: number; duracaoMs: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.transform = "scaleX(0)";
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `transform ${duracaoMs}ms linear`;
        el.style.transform = "scaleX(1)";
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [resetKey, duracaoMs]);
  return (
    <div className="fixed inset-x-0 top-0 z-20 h-[3px] bg-black/40">
      <div ref={ref} className="h-full origin-left bg-gradient-to-r from-gold to-gold-bright" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}

function Relogio() {
  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => {
    setAgora(new Date());
    const id = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="tabular-nums">
      {agora ? agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—"}
    </span>
  );
}

type Tema = { accent: string; gradiente: string };
type IconComp = (p: { className?: string }) => React.ReactElement;

function SlideShell({
  icon: Icon,
  titulo,
  tema,
  aoVivo,
  children,
}: {
  icon: IconComp;
  titulo: string;
  tema: Tema;
  aoVivo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden px-[3.5vw] py-[3vh]"
      style={{ background: tema.gradiente }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `radial-gradient(circle at 88% 8%, ${tema.accent}22, transparent 45%)` }}
      />

      <div className="relative flex shrink-0 items-center justify-between text-[1.3vh] uppercase tracking-[0.35em] text-white/35">
        <span>Senatus · Gestão à Vista</span>
        <Relogio />
      </div>

      <div className="relative mt-[2vh] flex shrink-0 items-center gap-[1.2vw]">
        <div
          className="flex h-[6.5vh] w-[6.5vh] shrink-0 items-center justify-center rounded-full border-2"
          style={{ borderColor: tema.accent, color: tema.accent }}
        >
          <Icon className="h-[3vh] w-[3vh]" />
        </div>
        <div>
          <h1
            className="font-display leading-none text-white"
            style={{ textShadow: "0 6px 28px rgba(0,0,0,0.45)", fontSize: "clamp(1.8rem, 4.4vh, 3.2rem)" }}
          >
            {titulo}
          </h1>
          {aoVivo && (
            <span className="mt-[0.8vh] flex items-center gap-2 text-[1.3vh] font-semibold uppercase tracking-[0.25em]" style={{ color: tema.accent }}>
              <span className="h-2 w-2 animate-pulse rounded-full bg-current" /> Ao vivo
            </span>
          )}
        </div>
      </div>
      <div className="relative mt-[1.8vh] h-px w-full shrink-0" style={{ background: `linear-gradient(90deg, ${tema.accent}88, transparent)` }} />

      <div className="relative mt-[2.2vh] min-h-0 flex-1">{children}</div>
    </div>
  );
}

function SlideLigacoesHoje({ funil, ranking }: { funil: FunilContagem; ranking: PessoaVisao[] }) {
  const metricas = [
    { label: "Tentativas", valor: funil.tentativas },
    { label: "Alôs", valor: funil.alos },
    { label: "Conexões", valor: funil.conexoes },
    { label: "Entrevistas", valor: funil.entrevistas },
  ];
  const tema = TEMAS.ligacoes;
  // Colunas na lista da direita crescem com o tamanho do time — pra 40+
  // pessoas 3 colunas ainda ficariam apertadas na altura de uma TV.
  const colunas = ranking.length > 24 ? 4 : ranking.length > 10 ? 3 : 2;
  return (
    <SlideShell icon={IconHorn} titulo="Ligações do dia" tema={tema} aoVivo>
      <div className="flex h-full gap-[2.5vw]">
        <div className="grid h-full w-[30%] shrink-0" style={{ gridTemplateRows: `repeat(${metricas.length}, 1fr)` }}>
          {metricas.map((m, i) => (
            <div key={m.label} className={`flex flex-col justify-center ${i > 0 ? "border-t border-white/10" : ""}`}>
              <p className="font-display leading-none tabular-nums text-white" style={{ fontSize: "clamp(2.5rem, 8vh, 5rem)" }}>
                {m.valor.toLocaleString("pt-BR")}
              </p>
              <p className="mt-[0.8vh] text-[1.5vh] uppercase tracking-[0.25em] text-white/45">{m.label}</p>
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col border-l border-white/10 pl-[2.5vw]">
          <p className="mb-[1.5vh] shrink-0 text-[1.3vh] uppercase tracking-[0.3em] text-white/40">
            Ranking individual — tentativas de hoje, do 1º ao último
          </p>
          {ranking.length === 0 ? (
            <p className="text-2xl text-white/40">Sem registros ainda hoje.</p>
          ) : (
            <div className="min-h-0 flex-1" style={{ columns: colunas, columnGap: "2.5vw", columnFill: "balance" }}>
              {ranking.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-baseline gap-3 break-inside-avoid"
                  style={{ paddingBlock: "0.35vh", fontSize: "clamp(0.85rem, 2vh, 1.25rem)" }}
                >
                  <span className="w-6 shrink-0 text-right tabular-nums text-white/30">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-white/85">{p.nome}</span>
                  <span className="font-display tabular-nums" style={{ color: tema.accent }}>
                    {p.funil.tentativas}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SlideShell>
  );
}

function SlideDuelo({ a, b }: { a: DueloExercito; b: DueloExercito }) {
  const corA = "#d1685f";
  const corB = "#7bb3d6";
  const linhas: { label: string; a: number; b: number; moeda?: boolean }[] = [
    { label: "Tentativas", a: a.tentativas, b: b.tentativas },
    { label: "Alôs", a: a.alos, b: b.alos },
    { label: "Conexões", a: a.conexoes, b: b.conexoes },
    { label: "Assinados", a: a.assinaturas, b: b.assinaturas },
    { label: "Pagos", a: a.pagos, b: b.pagos },
    { label: "Pagos (R$)", a: a.pagosValor, b: b.pagosValor, moeda: true },
  ];
  return (
    <SlideShell icon={IconSwords} titulo="Duelo de Funis" tema={TEMAS.duelo}>
      <div className="flex h-full flex-col">
        <div className="mb-[2vh] flex shrink-0 items-center justify-center gap-[2vw]">
          <span className="font-display leading-none" style={{ color: corA, fontSize: "clamp(1.6rem, 4.2vh, 2.6rem)" }}>{a.nome}</span>
          <span
            className="flex shrink-0 items-center justify-center rounded-full border-2 border-white/20 font-display leading-none text-white/60"
            style={{ height: "6vh", width: "6vh", fontSize: "1.6vh" }}
          >
            VS
          </span>
          <span className="font-display leading-none" style={{ color: corB, fontSize: "clamp(1.6rem, 4.2vh, 2.6rem)" }}>{b.nome}</span>
        </div>

        <div className="grid min-h-0 flex-1 gap-[1.2vh]" style={{ gridTemplateRows: `repeat(${linhas.length}, 1fr)` }}>
          {linhas.map((l) => {
            const total = l.a + l.b || 1;
            const pctA = (l.a / total) * 100;
            return (
              <div key={l.label} className="flex flex-col justify-center">
                <div className="mb-[0.6vh] flex items-center justify-between gap-6">
                  <span className="w-40 font-display leading-none tabular-nums" style={{ color: corA, fontSize: "clamp(1.1rem, 3vh, 1.7rem)" }}>
                    {l.moeda ? moeda(l.a) : l.a.toLocaleString("pt-BR")}
                  </span>
                  <span className="text-[1.4vh] uppercase tracking-[0.25em] text-white/40">{l.label}</span>
                  <span
                    className="w-40 text-right font-display leading-none tabular-nums"
                    style={{ color: corB, fontSize: "clamp(1.1rem, 3vh, 1.7rem)" }}
                  >
                    {l.moeda ? moeda(l.b) : l.b.toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full" style={{ width: `${pctA}%`, background: `linear-gradient(90deg, #6e2a25, ${corA})` }} />
                  <div className="h-full flex-1" style={{ background: `linear-gradient(90deg, ${corB}, #3c6580)` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SlideShell>
  );
}

// Pôster de duelo com foto GIGANTE ocupando cada metade da tela — pedido do
// Diretor, 2026-09-22: "não quero as fotos na bolinha pequena, quero que
// tomem a tela inteira praticamente". Usado na Guerra de Exércitos (sempre
// 2 lados) e em campanhas de duelo de 2 participantes (Copa Sampel,
// Tribal Wars/Balde War). Sem foto (Exército/pessoa sem brasão/avatar
// cadastrado) cai no gradiente do tema, pra nunca ficar com buraco vazio.
function SlideDuelPoster({
  icon,
  titulo,
  tema,
  esquerda,
  direita,
  formatoMoeda,
}: {
  icon: IconComp;
  titulo: string;
  tema: Tema;
  esquerda: { nome: string; valor: number; foto: string | null };
  direita: { nome: string; valor: number; foto: string | null };
  formatoMoeda?: boolean;
}) {
  return (
    <SlideShell icon={icon} titulo={titulo} tema={tema}>
      <div className="relative flex h-full gap-[0.8vw]">
        {[esquerda, direita].map((p, i) => (
          <div key={p.nome} className="relative min-w-0 flex-1 overflow-hidden rounded-xl">
            {p.foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.foto} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0" style={{ background: tema.gradiente }} />
            )}
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.05) 65%)" }}
            />
            <div className="absolute inset-x-0 bottom-0 p-[2.5vh] text-center">
              <p
                className="font-display leading-none text-white"
                style={{ fontSize: "clamp(1.6rem, 4.4vh, 3rem)", textShadow: "0 4px 18px rgba(0,0,0,0.7)" }}
              >
                {p.nome}
              </p>
              <p className="mt-[1.2vh] font-display leading-none tabular-nums" style={{ color: tema.accent, fontSize: "clamp(2.2rem, 7vh, 4.5rem)" }}>
                {formatoMoeda ? moeda(p.valor) : p.valor.toLocaleString("pt-BR")}
              </p>
            </div>
            {i === 0 && <div className="absolute inset-y-0 right-0 w-px bg-white/10" />}
          </div>
        ))}
        <div
          className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 font-display text-white shadow-2xl"
          style={{ height: "8vh", width: "8vh", fontSize: "1.8vh", borderColor: tema.accent, background: "rgba(10,8,6,0.75)" }}
        >
          VS
        </div>
      </div>
    </SlideShell>
  );
}

function SlideEntrevistasHoje({ entrevistas }: { entrevistas: EntrevistaHoje[] }) {
  const tema = TEMAS.entrevistasHoje;
  const colunas = entrevistas.length > 16 ? 3 : entrevistas.length > 6 ? 2 : 1;
  return (
    <SlideShell icon={IconBallot} titulo="Entrevistas do Dia" tema={tema} aoVivo>
      {entrevistas.length === 0 ? (
        <p className="text-2xl text-white/40">Nenhuma entrevista registrada ainda hoje.</p>
      ) : (
        <div className="flex h-full flex-col">
          <div
            className="grid shrink-0 grid-cols-[2fr_1.4fr_1.4fr_2fr] gap-6 border-b border-white/15 pb-[1vh] uppercase tracking-[0.25em] text-white/40"
            style={{ fontSize: "1.3vh" }}
          >
            <span>SDR</span>
            <span>Exército</span>
            <span>Tribo</span>
            <span>Cliente</span>
          </div>
          <div className="min-h-0 flex-1" style={{ columns: colunas, columnGap: "3vw", columnFill: "balance" }}>
            {entrevistas.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[2fr_1.4fr_1.4fr_2fr] items-baseline gap-6 break-inside-avoid border-b border-white/5"
                style={{ paddingBlock: "0.9vh", fontSize: "clamp(0.9rem, 2.1vh, 1.3rem)" }}
              >
                <span className="truncate text-white/90">{e.sdrNome}</span>
                <span className="truncate text-white/60">{e.exercitoNome}</span>
                <span className="truncate text-white/60">{e.triboNome}</span>
                <span className="truncate font-medium" style={{ color: tema.accent }}>{e.clienteNome}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </SlideShell>
  );
}

function SlideRanking({
  icon,
  titulo,
  tema,
  linhas,
  crests,
  formatoMoeda,
}: {
  icon: IconComp;
  titulo: string;
  tema: Tema;
  linhas: { nome: string; valor: number }[];
  crests?: Record<string, string>;
  formatoMoeda?: boolean;
}) {
  const max = Math.max(...linhas.map((l) => l.valor), 1);
  const medalhas = ["#e8c874", "#cfd2d6", "#c98a4d"];
  return (
    <SlideShell icon={icon} titulo={titulo} tema={tema}>
      {linhas.length === 0 ? (
        <p className="text-2xl text-white/40">Sem dados registrados ainda.</p>
      ) : (
        // Grid com N linhas de fração igual — garante que TODAS as linhas
        // (até 10) cabem na altura disponível, seja qual for a resolução
        // real da tela (achado do Diretor, 2026-09-22: numa TV o Top 10 só
        // mostrava até o 5º, porque as linhas tinham altura fixa em vez de
        // dividir o espaço disponível).
        <div className="grid h-full" style={{ gridTemplateRows: `repeat(${linhas.length}, 1fr)` }}>
          {linhas.map((l, i) => (
            <div key={l.nome} className="relative flex items-center gap-5">
              <div
                className="absolute inset-y-0 left-0 -z-10 rounded-r-md"
                style={{ width: `${(l.valor / max) * 100}%`, background: `${tema.accent}17` }}
              />
              <span
                className="w-10 shrink-0 text-right font-display leading-none tabular-nums"
                style={{ color: i < 3 ? medalhas[i] : "rgba(255,255,255,0.3)", fontSize: "clamp(1.1rem, 3vh, 1.7rem)" }}
              >
                {i + 1}
              </span>
              {crests?.[l.nome] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={crests[l.nome]} alt="" className="shrink-0 rounded-full object-cover" style={{ height: "5vh", width: "5vh" }} />
              )}
              <span
                className={`min-w-0 flex-1 truncate ${i === 0 ? "font-display text-white" : "text-white/80"}`}
                style={{ fontSize: "clamp(1.1rem, 3vh, 1.7rem)" }}
              >
                {l.nome}
              </span>
              <span
                className="font-display leading-none tabular-nums"
                style={{ color: i === 0 ? tema.accent : "rgba(255,255,255,0.65)", fontSize: "clamp(1.3rem, 3.6vh, 2.1rem)" }}
              >
                {formatoMoeda ? moeda(l.valor) : l.valor.toLocaleString("pt-BR")}
              </span>
            </div>
          ))}
        </div>
      )}
    </SlideShell>
  );
}

function SlideCampanhaVazia() {
  return (
    <SlideShell icon={IconTrophy} titulo="Campanhas do Senatus" tema={TEMAS.campanhas}>
      <p className="text-2xl text-white/40">Nenhuma campanha ativa no momento.</p>
    </SlideShell>
  );
}

// Uma tela CHEIA por campanha ativa — pedido do Diretor, 2026-09-22: antes
// 2 campanhas dividiam a mesma tela e as fotos ficavam pequenas demais.
// Fotos: avatarUrl é o duelo individual (ex: Copa Sampel, "foto dos
// meninos"); triboCrestUrl/exercitoCrestUrl é o duelo de time (ex: Balde
// War entre Tribos, Tribal Wars entre Exércitos) — campo já existia em
// CampanhaParticipanteProgresso, só faltava exibir no painel.
function SlideCampanha({ campanha: c }: { campanha: CampanhaComProgresso }) {
  const tema = TEMAS.campanhas;
  const max = Math.max(...c.participantes.map((p) => p.valor), 1);
  return (
    <SlideShell icon={IconTrophy} titulo={c.titulo} tema={tema}>
      <div className="flex h-full gap-[3vw]">
        <div className="flex w-[32%] shrink-0 flex-col justify-center gap-[2vh]">
          {c.descricao && <p style={{ fontSize: "clamp(1rem, 2.4vh, 1.4rem)" }} className="text-white/70">{c.descricao}</p>}
          {c.recompensa && (
            <p className="font-medium" style={{ color: tema.accent, fontSize: "clamp(1.1rem, 2.6vh, 1.5rem)" }}>
              🎁 {c.recompensa}
            </p>
          )}
        </div>

        <div className="min-w-0 flex-1 border-l border-white/10 pl-[3vw]">
          {c.participantes.length === 0 ? (
            <p className="text-2xl text-white/40">Sem participantes ainda.</p>
          ) : (
            <div className="grid h-full" style={{ gridTemplateRows: `repeat(${c.participantes.length}, 1fr)` }}>
              {c.participantes.map((p, i) => {
                const foto = p.avatarUrl ?? p.triboCrestUrl ?? p.exercitoCrestUrl;
                return (
                  <div key={p.refId} className="relative flex items-center gap-[1.2vw]">
                    <div
                      className="absolute inset-y-0 left-0 -z-10 rounded-r-md"
                      style={{ width: `${(p.valor / max) * 100}%`, background: `${tema.accent}17` }}
                    />
                    {foto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={foto}
                        alt=""
                        className="shrink-0 rounded-full border-2 object-cover"
                        style={{ height: "7vh", width: "7vh", borderColor: i === 0 ? tema.accent : "rgba(255,255,255,0.2)" }}
                      />
                    ) : (
                      <span
                        className="flex shrink-0 items-center justify-center rounded-full border border-white/20 font-display text-white/40"
                        style={{ height: "7vh", width: "7vh", fontSize: "2vh" }}
                      >
                        {i + 1}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-white/85" style={{ fontSize: "clamp(1.1rem, 2.8vh, 1.6rem)" }}>
                      {p.label}
                    </span>
                    <span
                      className="font-display leading-none tabular-nums"
                      style={{ color: i === 0 ? tema.accent : "rgba(255,255,255,0.7)", fontSize: "clamp(1.3rem, 3.4vh, 2.1rem)" }}
                    >
                      {p.valor.toLocaleString("pt-BR")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </SlideShell>
  );
}

function SlideLendas({ auto, curados }: { auto: RecordeAuto[]; curados: RecordeCurado[] }) {
  function fmt(r: RecordeAuto) {
    if (r.formato === "moeda") return moeda(r.valor);
    if (r.formato === "dias") return `${r.valor} dias`;
    return r.valor.toLocaleString("pt-BR");
  }
  const destaques = auto.slice(0, 4);
  const curado = curados[0];
  const tema = TEMAS.lendas;

  return (
    <SlideShell icon={IconLaurel} titulo="Lendas do Império" tema={tema}>
      <div className="grid h-full content-center gap-x-16 gap-y-10 sm:grid-cols-2">
        {destaques.map((r) => (
          <div key={r.titulo} className="border-l-2 pl-7" style={{ borderColor: tema.accent }}>
            <p className="text-sm uppercase tracking-[0.25em] text-white/40">{r.titulo}</p>
            <p className="mt-2 font-display text-3xl leading-none text-white">{r.nome}</p>
            <p className="mt-2 font-display text-2xl leading-none" style={{ color: tema.accent }}>{fmt(r)}</p>
          </div>
        ))}
      </div>
      {curado && (
        <div className="relative mt-10 border-t border-white/10 pt-6">
          <p className="text-sm uppercase tracking-[0.25em]" style={{ color: tema.accent }}>{curado.titulo}</p>
          {curado.descricao && <p className="mt-1.5 text-xl text-white/70">{curado.descricao}</p>}
        </div>
      )}
    </SlideShell>
  );
}
