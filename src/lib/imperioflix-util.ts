// Tipos e helpers puros da Imperioflix (sem acesso a banco) — usados tanto
// pelas páginas (servidor) quanto pelos componentes de tela (cliente).

export type Episodio = {
  id: string;
  tipo: "aula" | "item";
  ordem: number;
  titulo: string;
  resumo: string | null;
  videoUrl: string | null;
  arquivoUrl: string | null;
  instrutorNome: string | null;
  instrutorId: string | null;
  data: string | null;
  marco: boolean;
};

// "Série" = uma trilha oficial ou um módulo alternativo: o curso, com seus
// episódios (aulas ou itens) dentro.
export type Serie = {
  id: string;
  tipo: "trilha" | "modulo";
  titulo: string;
  descricao: string | null;
  capaUrl: string | null;
  gradiente: string;
  cor: string;
  icone: string;
  categoria: string | null;
  destaque: boolean;
  bloqueado: boolean;
  // Só módulo: visível pro time e quais ranks liberam (vazio = todos).
  ativo: boolean;
  ranksLiberados: string[];
  episodios: Episodio[];
};

export type ProgressoSerie = { feitos: number; total: number; pct: number };

export function progressoDaSerie(serie: Pick<Serie, "episodios">, vistos: Set<string>): ProgressoSerie {
  const total = serie.episodios.length;
  const feitos = serie.episodios.filter((e) => vistos.has(e.id)).length;
  return { feitos, total, pct: total > 0 ? Math.round((feitos / total) * 100) : 0 };
}

// Onde "Continuar" leva: primeiro episódio ainda não concluído; se todos
// estão concluídos, volta pro primeiro.
export function proximoEpisodio(serie: Pick<Serie, "episodios">, vistos: Set<string>): Episodio | null {
  return serie.episodios.find((e) => !vistos.has(e.id)) ?? serie.episodios[0] ?? null;
}

export function urlDoEpisodio(serieId: string, episodioId: string): string {
  return `/academy/imperioflix/${serieId}/${episodioId}`;
}

export function normalizarBusca(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Converte um link de YouTube/Vimeo em src de iframe embutível — cobre os
// formatos mais comuns (watch?v=, youtu.be, shorts, vimeo.com/N). Link que
// não bate em nenhum padrão cai no fallback "abrir em nova aba".
export function embedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}?rel=0`;
      const shorts = u.pathname.match(/^\/shorts\/([^/]+)/);
      if (shorts) return `https://www.youtube.com/embed/${shorts[1]}?rel=0`;
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.replace("/", "");
      if (id) return `https://www.youtube.com/embed/${id}?rel=0`;
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
