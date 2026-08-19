import Papa from "papaparse";
import { csvUrl, SHEET_GIDS } from "./config";
import { normalizarNome, parseDataBR, parseMoedaBR } from "./parse";

type AssinadoRow = {
  CLIENTE?: string;
  SDR?: string;
  CLOSER?: string;
  "CRÉDITO"?: string;
  FATURAMENTO?: string;
  DATA?: string;
  PRODUTO?: string;
  ORIGEM?: string;
  STATUS?: string;
};

export type OperacaoLinha = {
  data: string;
  sdrNormalizado: string | null;
  closerNormalizado: string | null;
  cliente: string | null;
  valor: number;
  faturamento: number;
  produto: string | null;
  origem: string | null;
  status: string;
};

// Espelha a aba Assinado linha a linha (sem filtrar por status) — alimenta
// só a Weekly de Receita, ver comentário na migration 0023.
export async function buscarOperacoes(): Promise<{
  linhas: OperacaoLinha[];
  menorData: string | null;
  maiorData: string | null;
}> {
  const res = await fetch(csvUrl(SHEET_GIDS.assinado));
  if (!res.ok) throw new Error(`Falha ao buscar aba Assinado: ${res.status}`);
  const text = await res.text();

  const { data: rows } = Papa.parse<AssinadoRow>(text, { header: true, skipEmptyLines: true });

  const linhas: OperacaoLinha[] = [];
  let menorData: string | null = null;
  let maiorData: string | null = null;

  for (const row of rows) {
    const data = parseDataBR(row.DATA ?? "");
    if (!data) continue;
    const valor = parseMoedaBR(row["CRÉDITO"] ?? "");
    if (valor <= 0) continue;

    if (!menorData || data < menorData) menorData = data;
    if (!maiorData || data > maiorData) maiorData = data;

    linhas.push({
      data,
      sdrNormalizado: row.SDR && row.SDR.trim() ? normalizarNome(row.SDR) : null,
      closerNormalizado: row.CLOSER && row.CLOSER.trim() ? normalizarNome(row.CLOSER) : null,
      cliente: row.CLIENTE?.trim() || null,
      valor,
      faturamento: parseMoedaBR(row.FATURAMENTO ?? ""),
      produto: row.PRODUTO?.trim() || null,
      origem: row.ORIGEM?.trim() || null,
      status: (row.STATUS ?? "").trim().toUpperCase() || "ASSINADO",
    });
  }

  return { linhas, menorData, maiorData };
}
