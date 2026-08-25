import Papa from "papaparse";
import { csvUrl, SHEET_GIDS } from "./config";
import { normalizarNome } from "./parse";
import type { FunilEtapa } from "@/lib/funil";

// A aba "Dados" empilha N blocos (um por métrica), cada um com:
// [linha de legenda] [cabeçalho "Execultivos" + uma coluna por dia] [uma linha por pessoa] [linha "Total"]
//
// Lê a etapa de cada bloco pela PRÓPRIA LEGENDA da planilha (não mais por
// posição fixa) — achado 2026-08-25: o bloco 0 ("Tentativas") tinha zero
// linhas de Vônix, só API, e ninguém tinha percebido porque a legenda da
// célula A1 estava errada ("w" em vez de "Tentativas API"). Com posição
// fixa, se algum dia surgir um bloco novo "Tentativas Vônix" (mesmo padrão
// que "Alô Vônix"/"Conexão Vônix" já têm), ele ficaria mudo até alguém
// lembrar de atualizar este arquivo. Por legenda, um bloco novo já entra
// somando sozinho, contanto que a legenda bata com um dos nomes abaixo.
//
// O bloco 0 é especial: a legenda dele mora na célula A1 (linha 0, coluna
// 0), que também é a linha de números de semana do cabeçalho — por isso
// não segue o padrão "linha de legenda sozinha" dos blocos seguintes.
//
// "Alô Vônix" soma em DOIS lugares: alos (óbvio) e tentativas — o discador
// Vônix não separa tentativa de alô (confirmado com o Diretor 2026-08-25:
// Tentativas API + Alô Vônix bateu exato com a contagem manual de ontem,
// 364 + 372 = 736). Não existe "Tentativas Vônix" porque, pra esse canal,
// toda tentativa que completa JÁ é um alô — um bloco separado seria a
// mesma coisa duas vezes.
const CAPTION_ETAPA: Record<string, FunilEtapa[]> = {
  "tentativas api": ["tentativas"],
  "tentativas vonix": ["tentativas"],
  "alos api": ["alos"],
  "alo vonix": ["alos", "tentativas"],
  "conexao api": ["conexoes"],
  "conexao vonix": ["conexoes"],
  entrevistas: [], // vem da aba dedicada (SDR + Closer), ver sync/entrevistas.ts
  "fechamentos inbound": [], // ainda não sabemos se soma em cima de "Entrevistas" ou é disjunto
};

export type ProducaoLinha = {
  nomeNormalizado: string;
  data: string;
  etapa: FunilEtapa;
  realizado: number;
  papel: "sdr" | "closer" | "ambos";
};

export async function buscarProducaoDados(): Promise<{
  linhas: ProducaoLinha[];
  nomesEncontrados: Set<string>;
}> {
  // no-store: sem isso, o próprio Next.js pode cachear essa resposta entre
  // execuções (ver comentário em csvUrl, config.ts) e uma sync manual
  // logo depois de editar a planilha continuaria vendo o estado antigo.
  const res = await fetch(csvUrl(SHEET_GIDS.dados), { cache: "no-store" });
  if (!res.ok) throw new Error(`Falha ao buscar aba Dados: ${res.status}`);
  const text = await res.text();

  const { data: rows } = Papa.parse<string[]>(text, { skipEmptyLines: false });

  const headerIdxs: number[] = [];
  const totalIdxs: number[] = [];
  rows.forEach((row, i) => {
    if (row[0] === "Execultivos") headerIdxs.push(i);
    if (row[0] === "Total") totalIdxs.push(i);
  });

  function legendaDoBloco(bloco: number): string {
    if (bloco === 0) return (rows[0]?.[0] ?? "").trim();
    return (rows[headerIdxs[bloco] - 1]?.[0] ?? "").trim();
  }

  const acumulado = new Map<string, ProducaoLinha>();
  const nomesEncontrados = new Set<string>();

  for (let bloco = 0; bloco < headerIdxs.length; bloco++) {
    const legenda = normalizarNome(legendaDoBloco(bloco));
    const etapas = CAPTION_ETAPA[legenda];
    // undefined = legenda desconhecida (bloco novo que ainda não mapeamos)
    // — ignora esse bloco com segurança em vez de quebrar a sync inteira.
    // [] = legenda conhecida mas de propósito fora do funil (Entrevistas etc).
    if (!etapas || etapas.length === 0) continue;

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
        // Tentativas/Alôs/Conexões são prospecção pura — sempre papel SDR.
        // Um bloco pode contribuir com MAIS de uma etapa (Alô Vônix conta
        // como alô E como tentativa, ver comentário acima).
        for (const etapa of etapas) {
          const chave = `${nomeNormalizado}|${data}|${etapa}`;
          const existente = acumulado.get(chave);
          if (existente) existente.realizado += valor;
          else acumulado.set(chave, { nomeNormalizado, data, etapa, realizado: valor, papel: "sdr" });
        }
      }
    }
  }

  return { linhas: Array.from(acumulado.values()), nomesEncontrados };
}
