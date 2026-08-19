import Papa from "papaparse";
import { csvUrl, SHEET_GIDS } from "./config";

// Nomes crus (sem normalizar maiúsculas/acentos) encontrados agora nas 3
// abas da planilha — alimenta o seletor de "Gestão de Pessoas" pra vincular
// grafias divergentes (ex.: "Nicolas Roberto" vs "Nicolas roberto") a um
// perfil. Sempre busca ao vivo, então cresce sozinho quando surge gente nova.
export async function listarNomesPlanilha(): Promise<string[]> {
  const nomes = new Set<string>();

  try {
    const res = await fetch(csvUrl(SHEET_GIDS.dados));
    if (res.ok) {
      const text = await res.text();
      const { data: rows } = Papa.parse<string[]>(text, { skipEmptyLines: false });
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
  } catch {
    // planilha fora do ar não deve quebrar a tela de Gestão
  }

  try {
    const res = await fetch(csvUrl(SHEET_GIDS.assinado));
    if (res.ok) {
      const text = await res.text();
      const { data: rows } = Papa.parse<{ SDR?: string; CLOSER?: string }>(text, {
        header: true,
        skipEmptyLines: true,
      });
      for (const row of rows) {
        if (row.SDR?.trim()) nomes.add(row.SDR.trim());
        if (row.CLOSER?.trim()) nomes.add(row.CLOSER.trim());
      }
    }
  } catch {
    // idem
  }

  try {
    const res = await fetch(csvUrl(SHEET_GIDS.entrevistas));
    if (res.ok) {
      const text = await res.text();
      const { data: rows } = Papa.parse<{ SDR?: string; Closer?: string }>(text, {
        header: true,
        skipEmptyLines: true,
      });
      for (const row of rows) {
        if (row.SDR?.trim()) nomes.add(row.SDR.trim());
        if (row.Closer?.trim()) nomes.add(row.Closer.trim());
      }
    }
  } catch {
    // idem
  }

  return Array.from(nomes).sort((a, b) => a.localeCompare(b, "pt-BR"));
}
