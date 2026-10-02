// Primeiro dia do mês seguinte a "YYYY-MM-01" — fim EXCLUSIVO do mês.
export function fimExclusivoDoMes(inicioMes: string): string {
  const [ano, mes] = inicioMes.split("-").map(Number);
  return new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);
}
