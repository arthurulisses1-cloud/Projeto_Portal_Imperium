import Papa from "papaparse";
import { normalizarNome, parseDataBR, parseMoedaBR, multiplicadorPorValor } from "./parse";
import type { FunilEtapa } from "@/lib/funil";

type AssinadoRow = {
  SDR?: string;
  CLOSER?: string;
  CLIENTE?: string;
  "CRÉDITO"?: string;
  DATA?: string;
  ORIGEM?: string;
  STATUS?: string;
};

export type VendaLinha = {
  nomeNormalizado: string;
  data: string;
  valor: number;
  origem: string | null;
  multiplicador: number;
  cliente: string | null;
  papel: "sdr" | "closer" | "ambos";
  // Mesma chave que buscarOperacoes() (weekly.ts) calcula pra essa MESMA
  // linha da planilha — dá pra casar vendas.weekly_operacao_id por ID em
  // vez de adivinhar por data+valor+cliente. Precisa ser calculada com a
  // MESMA regra de contagem de ocorrência (ver comentário abaixo), senão os
  // sufixos "#N" de colisão saem dessincronizados entre as duas funções.
  chaveNatural: string;
};

export type ProducaoLinha = {
  nomeNormalizado: string;
  data: string;
  etapa: FunilEtapa;
  realizado: number;
  papel: "sdr" | "closer" | "ambos";
};

// Recebe o texto do CSV já baixado (pelo chamador, run.ts) — buscarOperacoes()
// (weekly.ts) lê essa MESMA aba pra weekly_operacoes. Ver comentário lá:
// duas requisições HTTP separadas davam corrida real com a planilha viva.
export async function buscarAssinado(text: string): Promise<{
  vendas: VendaLinha[];
  funil: ProducaoLinha[];
  nomesEncontrados: Set<string>;
  menorData: string | null;
  maiorData: string | null;
}> {
  const { data: rows } = Papa.parse<AssinadoRow>(text, { header: true, skipEmptyLines: true });

  const vendas: VendaLinha[] = [];
  const funilAcumulado = new Map<string, ProducaoLinha>();
  const nomesEncontrados = new Set<string>();
  let menorData: string | null = null;
  let maiorData: string | null = null;

  function acumularFunil(nomeNormalizado: string, data: string, etapa: FunilEtapa, papel: "sdr" | "closer" | "ambos") {
    const chave = `${nomeNormalizado}|${data}|${etapa}|${papel}`;
    const existente = funilAcumulado.get(chave);
    if (existente) existente.realizado += 1;
    else funilAcumulado.set(chave, { nomeNormalizado, data, etapa, realizado: 1, papel });
  }

  // Mesmo contador de ocorrência que buscarOperacoes() (weekly.ts) usa pra
  // gerar chaveNatural — só avança quando valor > 0 (mesma condição em que
  // weekly.ts pula a linha inteira), pra ficar em lockstep entre as duas
  // funções mesmo processando o mesmo CSV em passadas separadas.
  const ocorrencias = new Map<string, number>();

  for (const row of rows) {
    const data = parseDataBR(row.DATA ?? "");
    if (!data) continue;

    const valor = parseMoedaBR(row["CRÉDITO"] ?? "");
    const pago = (row.STATUS ?? "").trim().toUpperCase() === "PAGO";

    if (!menorData || data < menorData) menorData = data;
    if (!maiorData || data > maiorData) maiorData = data;

    // SDR e Closer entram separados na própria produção. Quando é a mesma
    // pessoa nos dois papéis (fechou sozinha, sem outro SDR envolvido), vira
    // um único registro "ambos" — não duplica o mesmo pago pra ela.
    const sdrNorm = row.SDR && row.SDR.trim() ? normalizarNome(row.SDR) : null;
    const closerNorm = row.CLOSER && row.CLOSER.trim() ? normalizarNome(row.CLOSER) : null;
    const clienteRaw = row.CLIENTE?.trim() || null;

    let chaveNatural: string | null = null;
    if (valor > 0) {
      const chaveBase = `${data}|${sdrNorm ?? ""}|${closerNorm ?? ""}|${valor}|${normalizarNome(clienteRaw ?? "")}`;
      const n = (ocorrencias.get(chaveBase) ?? 0) + 1;
      ocorrencias.set(chaveBase, n);
      chaveNatural = n > 1 ? `${chaveBase}#${n}` : chaveBase;
    }

    const creditos: { nomeNormalizado: string; papel: "sdr" | "closer" | "ambos" }[] = [];
    if (sdrNorm && closerNorm && sdrNorm === closerNorm) {
      creditos.push({ nomeNormalizado: sdrNorm, papel: "ambos" });
    } else {
      if (sdrNorm) creditos.push({ nomeNormalizado: sdrNorm, papel: "sdr" });
      if (closerNorm) creditos.push({ nomeNormalizado: closerNorm, papel: "closer" });
    }

    for (const { nomeNormalizado, papel } of creditos) {
      nomesEncontrados.add(nomeNormalizado);

      acumularFunil(nomeNormalizado, data, "assinaturas", papel);
      if (pago) acumularFunil(nomeNormalizado, data, "pagos", papel);

      if (pago && valor > 0 && chaveNatural) {
        vendas.push({
          nomeNormalizado,
          data,
          valor,
          origem: row.ORIGEM || null,
          multiplicador: multiplicadorPorValor(valor),
          cliente: clienteRaw,
          papel,
          chaveNatural,
        });
      }
    }
  }

  return {
    vendas,
    funil: Array.from(funilAcumulado.values()),
    nomesEncontrados,
    menorData,
    maiorData,
  };
}
