"use client";

import { useState, useTransition } from "react";
import type { Aula, Trilha, Modulo, ModuloItem } from "@/lib/academy";
import { moduloLiberadoPara, CATEGORIAS_MODULO } from "@/lib/academy";
import type { Rank } from "@/lib/carreira";
import type { Comentario, ReacaoResumo } from "@/lib/social";
import { visualDaTrilha } from "@/lib/academy-visual";
import ComentariosReacoes from "@/components/ui/ComentariosReacoes";
import { marcarAssistido } from "./actions";

type Pessoa = { id: string; nome: string };

// Converte um link de YouTube/Vimeo em src de iframe embutível — cobre os
// formatos mais comuns (watch?v=, youtu.be, vimeo.com/N). Link que não bate
// em nenhum padrão cai pro fallback "abrir em nova aba" no chamador.
function embedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      const shorts = u.pathname.match(/^\/shorts\/([^/]+)/);
      if (shorts) return `https://www.youtube.com/embed/${shorts[1]}`;
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.replace("/", "");
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      if (id) return `https://player.vimeo.com/video/${id}`;
    }
    return null;
  } catch {
    return null;
  }
}

type CardItem = {
  id: string;
  tipo: "aula" | "modulo_item";
  titulo: string;
  subtitulo: string;
  resumo: string | null;
  videoUrl: string | null;
  arquivoUrl: string | null;
  cor: string;
  gradiente: string;
  icone: string;
};

// "Série" — uma trilha oficial ou um módulo alternativo: um card grande
// (pôster) que, ao clicar, abre a lista de episódios (aulas/itens) dentro.
// Pedido do Diretor, 2026-09-21: "Mentalidade do Legionário" é uma AULA
// dentro da trilha Legionário, não um card solto — a trilha é o card, a
// aula é o episódio.
type Serie = {
  id: string;
  titulo: string;
  descricao: string | null;
  capaUrl: string | null;
  gradiente: string;
  icone: string;
  bloqueado: boolean;
  episodios: CardItem[];
};

type Prateleira = { titulo: string; series: Serie[] };

export default function NetflixAcademy({
  trilhas,
  aulasPorTrilha,
  modulos,
  itensPorModulo,
  meuRank,
  meId,
  isDiretor,
  pessoas,
  comentariosAulas,
  reacoesAulas,
  comentariosItens,
  reacoesItens,
  assistidos,
}: {
  trilhas: Trilha[];
  aulasPorTrilha: Record<string, Aula[]>;
  modulos: Modulo[];
  itensPorModulo: Record<string, ModuloItem[]>;
  meuRank: string | null;
  meId: string;
  isDiretor: boolean;
  pessoas: Pessoa[];
  comentariosAulas: Record<string, Comentario[]>;
  reacoesAulas: Record<string, ReacaoResumo>;
  comentariosItens: Record<string, Comentario[]>;
  reacoesItens: Record<string, ReacaoResumo>;
  assistidos: Set<string>;
}) {
  const [aberto, setAberto] = useState<CardItem | null>(null);
  const [serieAberta, setSerieAberta] = useState<Serie | null>(null);
  const [vistos, setVistos] = useState<Set<string>>(assistidos);

  const seriesTrilhas: Serie[] = trilhas.map((t) => {
    const visual = visualDaTrilha(t.nome);
    return {
      id: t.id,
      titulo: t.nome,
      descricao: null,
      capaUrl: t.capaUrl,
      gradiente: visual.gradiente,
      icone: visual.icone,
      bloqueado: false,
      episodios: (aulasPorTrilha[t.id] ?? [])
        .filter((a) => a.realizada)
        .sort((a, b) => a.ordem - b.ordem)
        .map((a) => ({
          id: a.id,
          tipo: "aula" as const,
          titulo: a.tema,
          subtitulo: t.nome,
          resumo: a.resumo,
          videoUrl: a.videoUrl,
          arquivoUrl: null,
          cor: visual.cor,
          gradiente: visual.gradiente,
          icone: visual.icone,
        })),
    };
  });

  function serieDoModulo(m: Modulo): Serie {
    return {
      id: m.id,
      titulo: m.titulo,
      descricao: m.descricao,
      capaUrl: m.capaUrl,
      gradiente: "linear-gradient(135deg, #c9a227, #8a6d1a)",
      icone: "🎬",
      // Diretor sempre vê tudo destravado aqui — o cadeado é pra quem
      // realmente não tem acesso, não pra prévia de quem administra.
      bloqueado: !isDiretor && !moduloLiberadoPara(m, meuRank as Rank | null),
      episodios: (itensPorModulo[m.id] ?? []).map((item) => ({
        id: item.id,
        tipo: "modulo_item" as const,
        titulo: item.titulo,
        subtitulo: m.titulo,
        resumo: item.resumo,
        videoUrl: item.videoUrl,
        arquivoUrl: item.arquivoUrl,
        cor: "#c9a227",
        gradiente: "linear-gradient(135deg, #c9a227, #8a6d1a)",
        icone: item.tipo === "video" ? "🎬" : "📄",
      })),
    };
  }

  // Módulo sem nenhum episódio ainda (das categorias pré-criadas, à espera
  // de conteúdo) só aparece pro Diretor — pro time seria um card vazio.
  const modulosVisiveis = modulos.filter((m) => isDiretor || (itensPorModulo[m.id] ?? []).length > 0);

  const prateleiraTop5: Prateleira = {
    titulo: "🔥 Top 5",
    series: modulosVisiveis.filter((m) => m.destaque).map(serieDoModulo),
  };

  const prateleirasPorCategoria: Prateleira[] = CATEGORIAS_MODULO.map((c) => ({
    titulo: c.label,
    series: modulosVisiveis.filter((m) => m.categoria === c.value).map(serieDoModulo),
  }));

  const prateleiraOutros: Prateleira = {
    titulo: "Outros",
    series: modulosVisiveis.filter((m) => !m.categoria).map(serieDoModulo),
  };

  const prateleirasModulos = [prateleiraTop5, ...prateleirasPorCategoria, prateleiraOutros].filter(
    (p) => p.series.length > 0
  );

  function abrirEpisodio(ep: CardItem) {
    setAberto(ep);
  }

  return (
    <div className="space-y-10">
      {seriesTrilhas.length > 0 && (
        <div className="space-y-3">
          <SectionLabel texto="Trilhas Oficiais" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {seriesTrilhas.map((s) => (
              <SerieCard key={s.id} serie={s} onAbrir={() => setSerieAberta(s)} />
            ))}
          </div>
        </div>
      )}

      {prateleirasModulos.map((prat) => (
        <div key={prat.titulo} className="space-y-2">
          <h3 className="text-sm font-medium text-stone-300">{prat.titulo}</h3>
          <div className="flex gap-3 overflow-x-auto pb-3">
            {prat.series.map((s) => (
              <SerieCard key={s.id} serie={s} small onAbrir={() => !s.bloqueado && setSerieAberta(s)} />
            ))}
          </div>
        </div>
      ))}

      {seriesTrilhas.length === 0 && prateleirasModulos.length === 0 && (
        <p className="text-sm text-stone-500">Nenhum conteúdo disponível ainda.</p>
      )}

      {serieAberta && (
        <SerieModal
          serie={serieAberta}
          vistos={vistos}
          onClose={() => setSerieAberta(null)}
          onAbrirEpisodio={abrirEpisodio}
        />
      )}

      {aberto && (
        <DetalheModal
          item={aberto}
          onClose={() => setAberto(null)}
          meId={meId}
          isDiretor={isDiretor}
          pessoas={pessoas}
          comentarios={aberto.tipo === "aula" ? (comentariosAulas[aberto.id] ?? []) : (comentariosItens[aberto.id] ?? [])}
          reacoes={
            (aberto.tipo === "aula" ? reacoesAulas[aberto.id] : reacoesItens[aberto.id]) ?? { porEmoji: [], minhaReacao: null }
          }
          assistido={vistos.has(aberto.id)}
          onToggleAssistido={(v) =>
            setVistos((prev) => {
              const next = new Set(prev);
              if (v) next.add(aberto.id);
              else next.delete(aberto.id);
              return next;
            })
          }
        />
      )}
    </div>
  );
}

function SectionLabel({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="font-display text-lg text-gold-bright">{texto}</h2>
      <span className="h-px flex-1 bg-imperium-line" />
    </div>
  );
}

function SerieCard({ serie, small, onAbrir }: { serie: Serie; small?: boolean; onAbrir: () => void }) {
  return (
    <button
      onClick={onAbrir}
      className={`group relative shrink-0 overflow-hidden rounded-lg border border-imperium-line text-left shadow-md transition duration-200 hover:z-10 hover:scale-[1.05] hover:shadow-xl ${
        small ? "w-44 sm:w-52" : "w-full"
      }`}
      style={{ opacity: serie.bloqueado ? 0.5 : 1 }}
    >
      <div
        className="flex aspect-[2/3] items-center justify-center bg-cover bg-center text-5xl text-white"
        style={{ background: serie.capaUrl ? `url(${serie.capaUrl}) center/cover` : serie.gradiente }}
      >
        {!serie.capaUrl && (serie.bloqueado ? "🔒" : serie.icone)}
        {serie.bloqueado && serie.capaUrl && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-4xl">🔒</span>
        )}
      </div>
      <div className="bg-imperium-surface p-2.5">
        <p className="line-clamp-1 text-xs font-medium text-stone-100">{serie.titulo}</p>
        <p className="mt-0.5 text-[10px] text-stone-500">
          {serie.episodios.length} {serie.episodios.length === 1 ? "aula" : "aulas"}
        </p>
      </div>
    </button>
  );
}

function SerieModal({
  serie,
  vistos,
  onClose,
  onAbrirEpisodio,
}: {
  serie: Serie;
  vistos: Set<string>;
  onClose: () => void;
  onAbrirEpisodio: (ep: CardItem) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-imperium-line bg-imperium-bg"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between p-5 text-white"
          style={{ background: serie.capaUrl ? `url(${serie.capaUrl}) center/cover` : serie.gradiente }}
        >
          <div className="rounded bg-black/30 p-2">
            <h2 className="font-display text-xl">{serie.icone} {serie.titulo}</h2>
            {serie.descricao && <p className="mt-1 max-w-md text-xs opacity-90">{serie.descricao}</p>}
          </div>
          <button onClick={onClose} className="rounded-full bg-white/20 px-3 py-1 text-xs hover:bg-white/30">
            fechar ✕
          </button>
        </div>

        <div className="space-y-1.5 p-4">
          {serie.episodios.length === 0 && (
            <p className="text-xs text-stone-600">Nenhuma aula/episódio cadastrado nessa trilha ainda.</p>
          )}
          {serie.episodios.map((ep, i) => (
            <button
              key={ep.id}
              onClick={() => onAbrirEpisodio(ep)}
              className="flex w-full items-center gap-3 rounded border border-imperium-line p-2.5 text-left transition hover:border-gold/50 hover:bg-imperium-surface"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-imperium-line text-xs text-stone-400">
                {vistos.has(ep.id) ? "✓" : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-stone-100">{ep.titulo}</p>
              </div>
              {vistos.has(ep.id) && <span className="shrink-0 text-[10px] text-success-bright">visto</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DetalheModal({
  item,
  onClose,
  meId,
  isDiretor,
  pessoas,
  comentarios,
  reacoes,
  assistido,
  onToggleAssistido,
}: {
  item: CardItem;
  onClose: () => void;
  meId: string;
  isDiretor: boolean;
  pessoas: Pessoa[];
  comentarios: Comentario[];
  reacoes: ReacaoResumo;
  assistido: boolean;
  onToggleAssistido: (v: boolean) => void;
}) {
  const embed = item.videoUrl ? embedUrl(item.videoUrl) : null;
  const [isPending, startTransition] = useTransition();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-imperium-line bg-imperium-bg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 text-white" style={{ background: item.gradiente }}>
          <div>
            <p className="text-[11px] uppercase tracking-wide opacity-85">{item.subtitulo}</p>
            <h2 className="font-display text-lg">{item.icone} {item.titulo}</h2>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/20 px-3 py-1 text-xs hover:bg-white/30">
            fechar ✕
          </button>
        </div>

        <div className="space-y-4 p-4">
          <form
            action={(fd) => {
              onToggleAssistido(!assistido);
              startTransition(() => marcarAssistido(fd));
            }}
          >
            <input type="hidden" name="alvo_tipo" value={item.tipo === "aula" ? "academy_aula" : "academy_modulo_item"} />
            <input type="hidden" name="alvo_id" value={item.id} />
            <input type="hidden" name="assistido" value={(!assistido).toString()} />
            <button
              type="submit"
              disabled={isPending}
              className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                assistido ? "bg-success/20 text-success-bright" : "btn-outline"
              }`}
            >
              {assistido ? "✓ Já assisti" : "Marcar como assistido"}
            </button>
          </form>

          {embed && (
            <div className="aspect-video w-full overflow-hidden rounded">
              <iframe src={embed} className="h-full w-full" allowFullScreen title={item.titulo} />
            </div>
          )}
          {!embed && item.videoUrl && (
            <a href={item.videoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-gold hover:underline">
              🎬 Abrir vídeo em nova aba
            </a>
          )}
          {item.arquivoUrl && (
            <a href={item.arquivoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-gold hover:underline">
              📎 Abrir material
            </a>
          )}
          {item.resumo && <p className="text-sm text-stone-300">{item.resumo}</p>}
          {!item.resumo && !item.videoUrl && !item.arquivoUrl && (
            <p className="text-xs text-stone-600">Sem conteúdo adicional cadastrado ainda.</p>
          )}

          <div className="border-t border-imperium-line pt-3">
            <ComentariosReacoes
              alvoTipo={item.tipo === "aula" ? "academy_aula" : "academy_modulo_item"}
              alvoId={item.id}
              meId={meId}
              isDiretor={isDiretor}
              comentarios={comentarios}
              reacoes={reacoes}
              pessoas={pessoas}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
