import Papa from "papaparse";
import { csvUrl, SHEET_GIDS } from "./config";
import { normalizarNome, parseDataBR, parseMoedaBR, multiplicadorPorValor } from "./parse";
import type { FunilEtapa } from "@/lib/funil";

type AssinadoRow = {
  SDR?: string;
  CLOSER?: string;
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
};

export type ProducaoLinha = { nomeNormalizado: string; data: string; etapa: FunilEtapa; realizado: number };

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

  function acumularFunil(nomeNormalizado: string, data: string, etapa: FunilEtapa) {
    const chave = `${nomeNormalizado}|${data}|${etapa}`;
    const existente = funilAcumulado.get(chave);
    if (existente) existente.realizado += 1;
    else funilAcumulado.set(chave, { nomeNormalizado, data, etapa, realizado: 1 });
  }

  for (const row of rows) {
    const data = parseDataBR(row.DATA ?? "");
    if (!data) continue;

    const valor = parseMoedaBR(row["CRÉDITO"] ?? "");
    const pago = (row.STATUS ?? "").trim().toUpperCase() === "PAGO";
    const pessoas = [row.SDR, row.CLOSER].filter((n): n is string => !!n && n.trim() !== "");

    if (!menorData || data < menorData) menorData = data;
    if (!maiorData || data > maiorData) maiorData = data;

    for (const pessoaRaw of Array.from(new Set(pessoas))) {
      const nomeNormalizado = normalizarNome(pessoaRaw);
      nomesEncontrados.add(nomeNormalizado);

      acumularFunil(nomeNormalizado, data, "assinaturas");
      if (pago) acumularFunil(nomeNormalizado, data, "pagos");

      if (valor > 0) {
        vendas.push({
          nomeNormalizado,
          data,
          valor,
          origem: row.ORIGEM || null,
          multiplicador: multiplicadorPorValor(valor),
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
