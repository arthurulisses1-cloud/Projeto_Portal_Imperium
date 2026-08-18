export type StreakRow = {
  data: string;
  entrevistas_comp: number;
  entrevistas_real: number;
  assinaturas_comp: number;
  assinaturas_real: number;
  pagos_comp: number;
  pagos_real: number;
  falta: boolean;
  lancado: boolean;
};

export function cumpriuCompromisso(row: StreakRow) {
  return (
    row.entrevistas_real >= row.entrevistas_comp &&
    row.assinaturas_real >= row.assinaturas_comp &&
    row.pagos_real >= row.pagos_comp
  );
}

// Conta dias seguidos (a partir de ontem, andando pra trás) em que o
// compromisso foi lançado e cumprido. Para no primeiro dia sem registro,
// ausente ou não cumprido.
export function calcularStreak(historicoDesc: StreakRow[]): number {
  let streak = 0;
  for (const row of historicoDesc) {
    if (!row.lancado || row.falta || !cumpriuCompromisso(row)) break;
    streak++;
  }
  return streak;
}
