"use client";

import { useState } from "react";
import type { Aula, Trilha, Modulo, ModuloItem } from "@/lib/academy";
import { moduloLiberadoPara } from "@/lib/academy";
import type { Rank } from "@/lib/carreira";
import type { Comentario, ReacaoResumo } from "@/lib/social";
import { visualDaTrilha } from "@/lib/academy-visual";
import ComentariosReacoes from "@/components/ui/ComentariosReacoes";

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
  bloqueado: boolean;
};

type Prateleira = { titulo: string; itens: CardItem[] };

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
}) {
  const [aberto, setAberto] = useState<CardItem | null>(null);

  const trilhaPorId = Object.fromEntries(trilhas.map((t) => [t.id, t]));

  const prateleiraOficial: Prateleira = {
    titulo: "Trilhas oficiais — aulas já ministradas",
    itens: trilhas
      .flatMap((t) => (aulasPorTrilha[t.id] ?? []).filter((a) => a.realizada))
      .map((a) => {
        const trilha = trilhaPorId[a.trilhaId];
        const visual = visualDaTrilha(trilha?.nome ?? "");
        return {
          id: a.id,
          tipo: "aula" as const,
          titulo: a.tema,
          subtitulo: trilha?.nome ?? "—",
          resumo: a.resumo,
          videoUrl: a.videoUrl,
          arquivoUrl: null,
          cor: visual.cor,
          gradiente: visual.gradiente,
          icone: visual.icone,
          bloqueado: false,
        };
      }),
  };

  const prateleirasModulos: Prateleira[] = modulos.map((m) => ({
    titulo: m.titulo,
    itens: (itensPorModulo[m.id] ?? []).map((item) => ({
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
      // Diretor sempre vê tudo destravado aqui — o cadeado é pra quem
      // realmente não tem acesso, não pra prévia de quem administra.
      bloqueado: !isDiretor && !moduloLiberadoPara(m, meuRank as Rank | null),
    })),
  }));

  const prateleiras = [prateleiraOficial, ...prateleirasModulos].filter((p) => p.itens.length > 0);

  if (prateleiras.length === 0) return null;

  return (
    <section className="space-y-6">
      {prateleiras.map((prat) => (
        <div key={prat.titulo} className="space-y-2">
          <h3 className="text-sm font-medium text-stone-300">{prat.titulo}</h3>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {prat.itens.map((item) => (
              <button
                key={item.id}
                onClick={() => !item.bloqueado && setAberto(item)}
                className="relative w-48 shrink-0 overflow-hidden rounded-lg border border-imperium-line text-left transition hover:scale-[1.02]"
                style={{ opacity: item.bloqueado ? 0.55 : 1 }}
              >
                <div className="flex h-24 items-center justify-center text-3xl text-white" style={{ background: item.gradiente }}>
                  {item.bloqueado ? "🔒" : item.icone}
                </div>
                <div className="bg-imperium-surface p-2">
                  <p className="line-clamp-2 text-xs font-medium text-stone-100">{item.titulo}</p>
                  <p className="mt-0.5 text-[10px] text-stone-500">{item.subtitulo}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}

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
        />
      )}
    </section>
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
}: {
  item: CardItem;
  onClose: () => void;
  meId: string;
  isDiretor: boolean;
  pessoas: Pessoa[];
  comentarios: Comentario[];
  reacoes: ReacaoResumo;
}) {
  const embed = item.videoUrl ? embedUrl(item.videoUrl) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
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
