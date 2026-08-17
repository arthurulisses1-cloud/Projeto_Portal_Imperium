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
