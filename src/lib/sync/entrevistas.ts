import Papa from "papaparse";
import { csvUrl, SHEET_GIDS } from "./config";
import { normalizarNome, parseDataBR } from "./parse";
import type { FunilEtapa } from "@/lib/funil";

type EntrevistaRow = {
  "Carimbo de data/hora"?: string;
  SDR?: string;
  Closer?: string;
};

export type ProducaoLinha = { nomeNormalizado: string; data: string; etapa: FunilEtapa; realizado: number };

export async function buscarEntrevistas(): Promise<{
  linhas: ProducaoLinha[];
  nomesEncontrados: Set<string>;
}> {
  const res = await fetch(csvUrl(SHEET_GIDS.entrevistas));
  if (!res.ok) throw new Error(`Falha ao buscar aba Entrevistas: ${res.status}`);
  const text = await res.text();

  const { data: rows } = Papa.parse<EntrevistaRow>(text, { header: true, skipEmptyLines: true });

  const acumulado = new Map<string, ProducaoLinha>();
  const nomesEncontrados = new Set<string>();

  for (const row of rows) {
    const data = parseDataBR(row["Carimbo de data/hora"] ?? "");
    if (!data) continue;

    // SDR agenda, Closer conduz — cada um vê a mesma entrevista no próprio funil;
    // não duplica porque são pessoas (profiles) diferentes contando o mesmo evento.
    const pessoas = [row.SDR, row.Closer].filter((n): n is string => !!n && n.trim() !== "");
    for (const pessoaRaw of Array.from(new Set(pessoas))) {
      const nomeNormalizado = normalizarNome(pessoaRaw);
      nomesEncontrados.add(nomeNormalizado);

      const chave = `${nomeNormalizado}|${data}`;
      const existente = acumulado.get(chave);
      if (existente) existente.realizado += 1;
      else acumulado.set(chave, { nomeNormalizado, data, etapa: "entrevistas", realizado: 1 });
    }
  }

  return { linhas: Array.from(acumulado.values()), nomesEncontrados };
}
