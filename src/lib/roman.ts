const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export function toRoman(n: number): string {
  return NUMERALS[n - 1] ?? String(n);
}
