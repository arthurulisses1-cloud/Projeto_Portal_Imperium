import Papa from "papaparse";
import { csvUrl, SHEET_GIDS } from "./config";
import { normalizarNome } from "./parse";
import type { FunilEtapa } from "@/lib/funil";

// A aba "Dados" empilha 7 blocos (um por métrica), cada um com:
// [linha de rótulo] [cabeçalho "Execultivos" + uma coluna por dia] [uma linha por pessoa] [linha "Total"]
// Ordem confirmada: Tentativas, Alôs API, Conexão API, Alô Vônix, Conexão Vônix, Entrevistas, Entrevistas Inbound.
// Alôs e Conexões somam API + Vônix na mesma etapa. O bloco de Entrevistas fica de fora (null) — só
// reflete o SDR que agendou; a etapa "entrevistas" vem da aba dedicada (SDR + Closer), ver sync/entrevistas.ts.
// Entrevistas Inbound também fica de fora por enquanto (ainda não sabemos se soma em cima de
// "Entrevistas" ou é um conjunto disjunto de pessoas).
const BLOCO_ETAPA: (FunilEtapa | null)[] = [
  "tentativas",
  "alos",
  "conexoes",
  "alos",
  "conexoes",
  null,
  null,
];

export type ProducaoLinha = { nomeNormalizado: string; data: string; etapa: FunilEtapa; realizado: number };

export async function buscarProducaoDados(): Promise<{
  linhas: ProducaoLinha[];
  nomesEncontrados: Set<string>;
}> {
  const res = await fetch(csvUrl(SHEET_GIDS.dados));
  if (!res.ok) throw new Error(`Falha ao buscar aba Dados: ${res.status}`);
  const text = await res.text();

  const { data: rows } = Papa.parse<string[]>(text, { skipEmptyLines: false });

  const headerIdxs: number[] = [];
  const totalIdxs: number[] = [];
  rows.forEach((row, i) => {
    if (row[0] === "Execultivos") headerIdxs.push(i);
    if (row[0] === "Total") totalIdxs.push(i);
  });

  const acumulado = new Map<string, ProducaoLinha>();
  const nomesEncontrados = new Set<string>();

  for (let bloco = 0; bloco < headerIdxs.length && bloco < BLOCO_ETAPA.length; bloco++) {
    const etapa = BLOCO_ETAPA[bloco];
    if (!etapa) continue;

    const headerRow = rows[headerIdxs[bloco]];
    const inicio = headerIdxs[bloco] + 1;
    const fim = totalIdxs[bloco] ?? rows.length;

    for (let r = inicio; r < fim; r++) {
      const row = rows[r];
      const nome = (row?.[0] ?? "").trim();
      if (!nome) continue;
      const nomeNormalizado = normalizarNome(nome);
      nomesEncontrados.add(nomeNormalizado);

      for (let c = 1; c < headerRow.length; c++) {
        const dataStr = headerRow[c];
        if (!dataStr || !dataStr.includes("/")) continue;
        const valor = parseInt(row[c], 10);
        if (!valor || valor <= 0) continue;

        const [dia, mes, ano] = dataStr.split("/");
        const data = `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
        const chave = `${nomeNormalizado}|${data}|${etapa}`;

        const existente = acumulado.get(chave);
        if (existente) existente.realizado += valor;
        else acumulado.set(chave, { nomeNormalizado, data, etapa, realizado: valor });
      }
    }
  }

  return { linhas: Array.from(acumulado.values()), nomesEncontrados };
}
