import Papa from "papaparse";
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
  "DIA DO PAGAMENTO"?: string;
};

export type OperacaoLinha = {
  chaveNatural: string;
  data: string;
  sdrNormalizado: string | null;
  closerNormalizado: string | null;
  cliente: string | null;
  valor: number;
  faturamento: number;
  produto: string | null;
  origem: string | null;
  status: string;
  // Data real de pagamento, direto da planilha (coluna "DIA DO PAGAMENTO")
  // — não é mais inferida por "quando a sync percebeu que virou PAGO"
  // (achado 2026-08-24: a planilha já tem a data real o tempo todo, a
  // sync só nunca lia essa coluna). Null quando a célula está vazia.
  pagoEmPlanilha: string | null;
};

// Espelha a aba Assinado linha a linha (sem filtrar por status) — alimenta
// só a Weekly de Receita, ver comentário na migration 0023.
//
// Recebe o texto do CSV já baixado (pelo chamador) em vez de buscar de
// novo — buscarAssinado() (assinado.ts) lê essa MESMA aba pra funil/vendas.
// Duas requisições HTTP separadas pra planilha viva davam uma corrida real:
// se alguém editava o STATUS de uma venda no Google Sheets entre as duas
// leituras, weekly_operacoes e vendas/producao_funil viam fotografias
// DIFERENTES da mesma aba (achado 2026-08-24 — Forecast mostrou uma venda
// como PAGA que o Ranking não contava, porque a leitura de vendas rodou
// segundos antes da mudança na planilha, e a de weekly_operacoes rodou
// depois). Uma leitura só, reaproveitada nos dois, elimina a corrida.
export async function buscarOperacoes(text: string): Promise<{
  linhas: OperacaoLinha[];
  menorData: string | null;
  maiorData: string | null;
}> {
  const { data: rows } = Papa.parse<AssinadoRow>(text, { header: true, skipEmptyLines: true });

  const linhas: OperacaoLinha[] = [];
  let menorData: string | null = null;
  let maiorData: string | null = null;
  const ocorrencias = new Map<string, number>();

  for (const row of rows) {
    const data = parseDataBR(row.DATA ?? "");
    if (!data) continue;
    const valor = parseMoedaBR(row["CRÉDITO"] ?? "");
    if (valor <= 0) continue;

    if (!menorData || data < menorData) menorData = data;
    if (!maiorData || data > maiorData) maiorData = data;

    const sdrNormalizado = row.SDR && row.SDR.trim() ? normalizarNome(row.SDR) : null;
    const closerNormalizado = row.CLOSER && row.CLOSER.trim() ? normalizarNome(row.CLOSER) : null;
    const cliente = row.CLIENTE?.trim() || null;

    // Chave natural: a planilha não tem um ID confiável por linha (a coluna
    // ID só existe em ~10% das linhas). Duas operações reais idênticas em
    // todos esses campos (raro, mas acontece) ganham um sufixo de ocorrência
    // pra não colidir — o importante é ficar ESTÁVEL entre execuções do sync,
    // pra não perder o status manual/observação preenchidos no Forecast.
    const chaveBase = `${data}|${sdrNormalizado ?? ""}|${closerNormalizado ?? ""}|${valor}|${normalizarNome(cliente ?? "")}`;
    const n = (ocorrencias.get(chaveBase) ?? 0) + 1;
    ocorrencias.set(chaveBase, n);
    const chaveNatural = n > 1 ? `${chaveBase}#${n}` : chaveBase;

    linhas.push({
      chaveNatural,
      data,
      sdrNormalizado,
      closerNormalizado,
      cliente,
      valor,
      faturamento: parseMoedaBR(row.FATURAMENTO ?? ""),
      produto: row.PRODUTO?.trim() || null,
      origem: row.ORIGEM?.trim() || null,
      status: (row.STATUS ?? "").trim().toUpperCase() || "ASSINADO",
      pagoEmPlanilha: parseDataBR(row["DIA DO PAGAMENTO"] ?? ""),
    });
  }

  return { linhas, menorData, maiorData };
}
