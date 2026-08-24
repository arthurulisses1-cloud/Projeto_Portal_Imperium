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

// O CSV "publicar na web" do Google Sheets responde com
// `cache-control: private, max-age=300` — cada sincronização batendo
// nessa URL corre risco de pegar uma cópia de até 5 minutos atrás, mesmo
// depois de uma edição real na planilha (achado 2026-08-24: sync não
// pegava um status recém-mudado pra PAGO). `_ts` no fim da URL faz o
// Google tratar cada chamada como um recurso novo, sem cache — junto com
// `cache: "no-store"` na chamada do fetch (ver dados.ts/assinado.ts).
export function csvUrl(gid: string) {
  return `https://docs.google.com/spreadsheets/d/e/${SHEET_PUB_ID}/pub?gid=${gid}&single=true&output=csv&_ts=${Date.now()}`;
}
