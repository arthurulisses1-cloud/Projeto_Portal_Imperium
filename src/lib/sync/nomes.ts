import Papa from "papaparse";
import { csvUrl, SHEET_GIDS } from "./config";

// Nomes crus (sem normalizar maiúsculas/acentos) encontrados agora nas 3
// abas da planilha — alimenta o seletor de "Gestão de Pessoas" pra vincular
// grafias divergentes (ex.: "Nicolas Roberto" vs "Nicolas roberto") a um
// perfil. Cresce sozinho quando surge gente nova. As 3 abas baixam em paralelo
// (a aba "assinado" chegou a levar 13 s sozinha) e quem chama guarda o resultado em cache.

/** Baixa uma aba; planilha fora do ar não deve quebrar a tela de Gestão. */
async function baixar(gid: string): Promise<string | null> {
  try {
    const res = await fetch(csvUrl(gid), { signal: AbortSignal.timeout(25000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

export async function listarNomesPlanilha(): Promise<string[]> {
  const nomes = new Set<string>();
  const [dados, assinado, entrevistas] = await Promise.all([baixar(SHEET_GIDS.dados), baixar(SHEET_GIDS.assinado), baixar(SHEET_GIDS.entrevistas)]);

  if (dados) {
    const { data: rows } = Papa.parse<string[]>(dados, { skipEmptyLines: false });
    const headerIdxs: number[] = [];
    const totalIdxs: number[] = [];
    rows.forEach((row, i) => {
      if (row[0] === "Execultivos") headerIdxs.push(i);
      if (row[0] === "Total") totalIdxs.push(i);
    });
    for (let bloco = 0; bloco < headerIdxs.length; bloco++) {
      const inicio = headerIdxs[bloco] + 1;
      const fim = totalIdxs[bloco] ?? rows.length;
      for (let r = inicio; r < fim; r++) {
        const nome = (rows[r]?.[0] ?? "").trim();
        if (nome) nomes.add(nome);
      }
    }
  }

  if (assinado) {
    const { data: rows } = Papa.parse<{ SDR?: string; CLOSER?: string }>(assinado, { header: true, skipEmptyLines: true });
    for (const row of rows) {
      if (row.SDR?.trim()) nomes.add(row.SDR.trim());
      if (row.CLOSER?.trim()) nomes.add(row.CLOSER.trim());
    }
  }

  if (entrevistas) {
    const { data: rows } = Papa.parse<{ SDR?: string; Closer?: string }>(entrevistas, { header: true, skipEmptyLines: true });
    for (const row of rows) {
      if (row.SDR?.trim()) nomes.add(row.SDR.trim());
      if (row.Closer?.trim()) nomes.add(row.Closer.trim());
    }
  }

  return Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-BR"));
}
