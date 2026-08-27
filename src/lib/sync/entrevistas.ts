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

// Par SDR+Closer de cada entrevista — ao contrário de `linhas` (crédito
// solto por pessoa), preserva quem fez o quê JUNTO, pra dar pra checar se
// os dois eram da mesma Tribo (ver entrevistas_eventos, migration 0048).
export type ParEntrevista = {
  data: string;
  sdrNorm: string | null;
  closerNorm: string | null;
  quantidade: number;
};

// Aceita o texto do CSV já baixado (pelo chamador) em vez de buscar de novo
// — buscarEntrevistasLeads() (entrevistas-leads.ts) lê essa MESMA aba pra
// preservar o lead por entrevista. Duas requisições HTTP separadas pra
// planilha viva dão uma corrida real (mesmo achado 2026-08-24 documentado em
// weekly.ts/assinado.ts) — uma leitura só, reaproveitada nas duas, elimina
// isso. Ainda busca sozinho quando chamado sem argumento (compatibilidade).
export async function buscarEntrevistas(textoCsv?: string): Promise<{
  linhas: ProducaoLinha[];
  pares: ParEntrevista[];
  nomesEncontrados: Set<string>;
}> {
  let text = textoCsv;
  if (text === undefined) {
    // no-store: ver comentário em dados.ts / config.ts.
    const res = await fetch(csvUrl(SHEET_GIDS.entrevistas), { cache: "no-store" });
    if (!res.ok) throw new Error(`Falha ao buscar aba Entrevistas: ${res.status}`);
    text = await res.text();
  }

  const { data: rows } = Papa.parse<EntrevistaRow>(text, { header: true, skipEmptyLines: true });

  const acumulado = new Map<string, ProducaoLinha>();
  const paresAcumulado = new Map<string, ParEntrevista>();
  const nomesEncontrados = new Set<string>();

  function acumular(nomeNormalizado: string, data: string, papel: "sdr" | "closer" | "ambos") {
    nomesEncontrados.add(nomeNormalizado);
    const chave = `${nomeNormalizado}|${data}|${papel}`;
    const existente = acumulado.get(chave);
    if (existente) existente.realizado += 1;
    else acumulado.set(chave, { nomeNormalizado, data, etapa: "entrevistas", realizado: 1, papel });
  }

  function acumularPar(data: string, sdrNorm: string | null, closerNorm: string | null) {
    const chave = `${data}|${sdrNorm ?? ""}|${closerNorm ?? ""}`;
    const existente = paresAcumulado.get(chave);
    if (existente) existente.quantidade += 1;
    else paresAcumulado.set(chave, { data, sdrNorm, closerNorm, quantidade: 1 });
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
    acumularPar(data, sdrNorm, closerNorm);
  }

  return { linhas: Array.from(acumulado.values()), pares: Array.from(paresAcumulado.values()), nomesEncontrados };
}
