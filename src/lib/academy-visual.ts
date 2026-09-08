// Identidade visual de cada trilha da Imperium Academy — cor + ícone,
// compartilhado entre o calendário, os cards e os badges nas 3 visões
// (Academy Geral, Aulas pra Ministrar, Trilha de Formação). Chave é o
// NOME da trilha (academy_trilhas.nome), não o rank, porque a Arena não
// tem rank (é cross-rank).
export type TrilhaVisual = {
  cor: string; // cor sólida (borda, texto de destaque)
  bg: string; // fundo suave pra pill/chip
  gradiente: string; // gradiente pro cabeçalho do card da trilha
  icone: string; // emoji — leve, sem depender de asset externo
};

export const TRILHA_VISUAL: Record<string, TrilhaVisual> = {
  "Legionário": {
    cor: "#b08d57",
    bg: "rgba(176, 141, 87, 0.14)",
    gradiente: "linear-gradient(135deg, #8a6d3f, #b08d57)",
    icone: "🛡️",
  },
  "Centurião": {
    cor: "#5b8aa6",
    bg: "rgba(91, 138, 166, 0.14)",
    gradiente: "linear-gradient(135deg, #3f6178, #5b8aa6)",
    icone: "⚔️",
  },
  "Tribuno": {
    cor: "#b3453f",
    bg: "rgba(179, 69, 63, 0.14)",
    gradiente: "linear-gradient(135deg, #832e29, #b3453f)",
    icone: "🏹",
  },
  "Pretor": {
    cor: "#8862c4",
    bg: "rgba(136, 98, 196, 0.14)",
    gradiente: "linear-gradient(135deg, #5f3f96, #8862c4)",
    icone: "👑",
  },
  "Legado · PDL": {
    cor: "#d3ab5a",
    bg: "rgba(211, 171, 90, 0.16)",
    gradiente: "linear-gradient(135deg, #a37e28, #e8c877)",
    icone: "🦅",
  },
  "Arena de Roleplays": {
    cor: "#c9695f",
    bg: "rgba(201, 105, 95, 0.14)",
    gradiente: "linear-gradient(135deg, #8f2f27, #c9695f)",
    icone: "🎯",
  },
};

export const TRILHA_VISUAL_PADRAO: TrilhaVisual = {
  cor: "#9c9070",
  bg: "rgba(156, 144, 112, 0.14)",
  gradiente: "linear-gradient(135deg, #6e624a, #9c9070)",
  icone: "📜",
};

export function visualDaTrilha(nome: string): TrilhaVisual {
  return TRILHA_VISUAL[nome] ?? TRILHA_VISUAL_PADRAO;
}
