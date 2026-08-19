import Papa from "papaparse";
import { csvUrl, SHEET_GIDS } from "./config";
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
};

export type ProducaoLinha = {
  nomeNormalizado: string;
  data: string;
  etapa: FunilEtapa;
  realizado: number;
  papel: "sdr" | "closer" | "ambos";
};

export async function buscarAssinado(): Promise<{
  vendas: VendaLinha[];
  funil: ProducaoLinha[];
  nomesEncontrados: Set<string>;
  menorData: string | null;
  maiorData: string | null;
}> {
  const res = await fetch(csvUrl(SHEET_GIDS.assinado));
  if (!res.ok) throw new Error(`Falha ao buscar aba Assinado: ${res.status}`);
  const text = await res.text();

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

      if (pago && valor > 0) {
        vendas.push({
          nomeNormalizado,
          data,
          valor,
          origem: row.ORIGEM || null,
          multiplicador: multiplicadorPorValor(valor),
          cliente: row.CLIENTE?.trim() || null,
          papel,
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
