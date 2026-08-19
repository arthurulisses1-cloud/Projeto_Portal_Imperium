// Planilha mestre "Business Inteligence Matri", publicada como CSV por aba.
// Publish ID e gids não são segredos (é um link "publicar na web" já público),
// mas ficam centralizados aqui pra facilitar troca futura.

export const SHEET_PUB_ID =
  "2PACX-1vRDXLDqkd1l9naEvxOtzZ08tecLKGRWHPno4h6GL4HtxB1uZiggZhjQrKqFp-xFW_7pXDyF1jiGgvzB";

export const SHEET_GIDS = {
  dados: "18738261",
  assinado: "115745497",
  entrevistas: "1119762693",
} as const;

export function csvUrl(gid: string) {
  return `https://docs.google.com/spreadsheets/d/e/${SHEET_PUB_ID}/pub?gid=${gid}&single=true&output=csv`;
}
