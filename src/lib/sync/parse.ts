// Datas na planilha aparecem em dois formatos: "01/01/2026" (Dados, sempre
// com zero à esquerda) e "3/9/2025" (Assinado, sem zero à esquerda). Os dois
// são dd/mm/yyyy — nunca mm/dd/yyyy, então não dá pra usar Date.parse direto.
export function parseDataBR(raw: string): string | null {
  const s = (raw ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// "R$ 110.959,42" -> 110959.42 (formato brasileiro: ponto de milhar, vírgula decimal)
export function parseMoedaBR(raw: string): number {
  const s = (raw ?? "").trim();
  if (!s) return 0;
  const semSimbolo = s.replace(/[^\d.,-]/g, "");
  const semMilhar = semSimbolo.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(semMilhar);
  return Number.isFinite(n) ? n : 0;
}

export function normalizarNome(raw: string): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function multiplicadorPorValor(valor: number): number {
  if (valor <= 0) return 1;
  return Math.floor(valor / 100000) + 1;
}
