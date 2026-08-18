export const RANK_ORDER = ["legionario", "centuriao", "tribuno", "pretor", "legado"] as const;
export type Rank = (typeof RANK_ORDER)[number];

export const NEXT_RANK: Partial<Record<Rank, Rank>> = {
  legionario: "centuriao",
  centuriao: "tribuno",
  tribuno: "pretor",
  pretor: "legado",
};

export const NEXT_TRANSICAO: Partial<Record<Rank, string>> = {
  legionario: "legionario_centuriao",
  centuriao: "centuriao_tribuno",
  tribuno: "tribuno_pretor",
  pretor: "pretor_legado",
};

export const BLOCO_LABELS: Record<number, string> = {
  1: "Resultado",
  2: "HGV Atual",
  3: "Antecipação (Esse Quam Videri)",
  4: "Formação",
  5: "Cultura + Validação",
};

export const RANK_SUBTITLE: Record<Rank | "diretor", string> = {
  legionario: "SDR Jr",
  centuriao: "SDR Sr",
  tribuno: "Closer Jr",
  pretor: "Closer Sr",
  legado: "Líder",
  diretor: "Diretoria",
};

export const STAR_PACE: Record<Rank, { estrelas: number; cheia: number; meia: number }> = {
  legionario: { estrelas: 0, cheia: 0, meia: 0 },
  centuriao: { estrelas: 6, cheia: 3, meia: 2 },
  tribuno: { estrelas: 8, cheia: 5, meia: 3 },
  pretor: { estrelas: 10, cheia: 7, meia: 5 },
  legado: { estrelas: 12, cheia: 10, meia: 6 },
};
