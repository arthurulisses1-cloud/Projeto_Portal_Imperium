import Papa from "papaparse";
import { csvUrl, SHEET_GIDS } from "./config";
import { normalizarNome, parseDataBR } from "./parse";
import type { FunilEtapa } from "@/lib/funil";

type EntrevistaRow = {
  "Carimbo de data/hora"?: string;
  SDR?: string;
  Closer?: string;
};

export type ProducaoLinha = {
  nomeNormalizado: string;
  data: string;
  etapa: FunilEtapa;
  realizado: number;
  papel: "sdr" | "closer" | "ambos";
};

export async function buscarEntrevistas(): Promise<{
  linhas: ProducaoLinha[];
  nomesEncontrados: Set<string>;
}> {
  // no-store: ver comentário em dados.ts / config.ts.
  const res = await fetch(csvUrl(SHEET_GIDS.entrevistas), { cache: "no-store" });
  if (!res.ok) throw new Error(`Falha ao buscar aba Entrevistas: ${res.status}`);
  const text = await res.text();

  const { data: rows } = Papa.parse<EntrevistaRow>(text, { header: true, skipEmptyLines: true });

  const acumulado = new Map<string, ProducaoLinha>();
  const nomesEncontrados = new Set<string>();

  function acumular(nomeNormalizado: string, data: string, papel: "sdr" | "closer" | "ambos") {
    nomesEncontrados.add(nomeNormalizado);
    const chave = `${nomeNormalizado}|${data}|${papel}`;
    const existente = acumulado.get(chave);
    if (existente) existente.realizado += 1;
    else acumulado.set(chave, { nomeNormalizado, data, etapa: "entrevistas", realizado: 1, papel });
  }

  for (const row of rows) {
    const data = parseDataBR(row["Carimbo de data/hora"] ?? "");
    if (!data) continue;

    // SDR agenda, Closer conduz — cada um entra na própria produção com o papel
    // que exerceu. Quando é a mesma pessoa nos dois papéis (fez tudo sozinha),
    // vira um único registro "ambos" pra não contar a mesma entrevista 2x.
    const sdrNorm = row.SDR && row.SDR.trim() ? normalizarNome(row.SDR) : null;
    const closerNorm = row.Closer && row.Closer.trim() ? normalizarNome(row.Closer) : null;

    if (sdrNorm && closerNorm && sdrNorm === closerNorm) {
      acumular(sdrNorm, data, "ambos");
    } else {
      if (sdrNorm) acumular(sdrNorm, data, "sdr");
      if (closerNorm) acumular(closerNorm, data, "closer");
    }
  }

  return { linhas: Array.from(acumulado.values()), nomesEncontrados };
}
