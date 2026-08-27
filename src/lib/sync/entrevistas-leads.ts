import Papa from "papaparse";
import { normalizarNome, parseDataBR } from "./parse";

// Colunas confirmadas pelo Diretor na aba "Entrevistas": A, C–K, N, O
// (2026-08-27) — a planilha sempre teve esse detalhe por entrevista, só
// nunca foi lido (entrevistas.ts só usa Carimbo/SDR/Closer, agregado).
type EntrevistaLeadRow = {
  "Carimbo de data/hora"?: string; // A
  "Nome do lead"?: string; // C
  "ID do MSP"?: string; // D
  Telefone?: string; // E
  "Por onde foi a entrevista ?"?: string; // F
  "Estado Civil"?: string; // G
  "Quem toma a decisão ?"?: string; // H
  "Dores e necessidades encontradas"?: string; // I
  "O lead esta ciente das documentações ?"?: string; // J
  "Os valores foram apresentados ?"?: string; // K
  SDR?: string;
  Closer?: string;
  Origem?: string; // N
  Entrevistado?: string; // O
};

export type EntrevistaLeadLinha = {
  chaveNatural: string;
  data: string;
  leadNome: string;
  leadTelefone: string | null;
  idMsp: string | null;
  sdrNormalizado: string | null;
  closerNormalizado: string | null;
  canal: string | null;
  origem: string | null;
  entrevistado: string | null;
  estadoCivil: string | null;
  decisor: string | null;
  dores: string | null;
  documentacaoCiente: string | null;
  valoresApresentados: string | null;
};

// Lê a MESMA aba "Entrevistas" que buscarEntrevistas() (entrevistas.ts) já
// lê — recebe o texto já baixado pelo chamador (mesmo cuidado de corrida
// documentado lá) em vez de buscar de novo. Ao contrário daquela função
// (que AGREGA por par SDR+Closer+dia, perdendo a identidade do lead de
// propósito — é o que a regra de Tribo em entrevistas_eventos precisa),
// esta preserva CADA linha como um lead individual.
// Só um número puro conta como "ID do MSP" de verdade — a coluna também
// tem valores tipo "Não há" / "Não está no MSP" (achado 2026-08-27: 101
// valores duplicados na planilha real, incluindo esses dois textos
// aparecendo dezenas de vezes cada, colidindo leads completamente
// diferentes na mesma chave e quebrando o upsert com "ON CONFLICT DO
// UPDATE command cannot affect row a second time"). Qualquer coisa que
// não seja só dígitos cai no fallback textual, igual a quando a célula
// está vazia.
function idMspValido(bruto: string | null): string | null {
  if (!bruto) return null;
  return /^\d+$/.test(bruto) ? bruto : null;
}

export async function buscarEntrevistasLeads(textoCsv: string): Promise<EntrevistaLeadLinha[]> {
  const { data: rows } = Papa.parse<EntrevistaLeadRow>(textoCsv, { header: true, skipEmptyLines: true });

  const porChave = new Map<string, EntrevistaLeadLinha>();
  const ocorrencias = new Map<string, number>();

  for (const row of rows) {
    const data = parseDataBR(row["Carimbo de data/hora"] ?? "");
    if (!data) continue;
    const leadNome = row["Nome do lead"]?.trim();
    if (!leadNome) continue;

    const sdrNormalizado = row.SDR && row.SDR.trim() ? normalizarNome(row.SDR) : null;
    const closerNormalizado = row.Closer && row.Closer.trim() ? normalizarNome(row.Closer) : null;
    const idMsp = idMspValido(row["ID do MSP"]?.trim() || null);

    // "ID do MSP" é bem mais estável que uma fórmula com data (evita a
    // classe de bug "data mudou -> duplicata" já corrigida pra
    // weekly_operacoes essa sessão) — só cai no fallback textual (com
    // sufixo de ocorrência, mesmo padrão de weekly.ts) pras linhas sem ID
    // do MSP válido.
    let chaveNatural: string;
    if (idMsp) {
      chaveNatural = `msp:${idMsp}`;
    } else {
      const chaveBase = `${data}|${sdrNormalizado ?? ""}|${closerNormalizado ?? ""}|${normalizarNome(leadNome)}`;
      const n = (ocorrencias.get(chaveBase) ?? 0) + 1;
      ocorrencias.set(chaveBase, n);
      chaveNatural = n > 1 ? `${chaveBase}#${n}` : chaveBase;
    }

    // Mesmo lead pode ter sido entrevistado mais de uma vez de verdade (ID
    // do MSP se repete legitimamente às vezes) — um upsert com a MESMA
    // chave duas vezes no mesmo lote quebra no Postgres ("cannot affect
    // row a second time"), então colapsa aqui: a ocorrência mais recente
    // na planilha vence (`Map.set` sobrescreve), igual ao resto do sync
    // trata "a planilha é a fonte da verdade do estado atual".
    porChave.set(chaveNatural, {
      chaveNatural,
      data,
      leadNome,
      leadTelefone: row.Telefone?.trim() || null,
      idMsp,
      sdrNormalizado,
      closerNormalizado,
      canal: row["Por onde foi a entrevista ?"]?.trim() || null,
      origem: row.Origem?.trim() || null,
      entrevistado: row.Entrevistado?.trim() || null,
      estadoCivil: row["Estado Civil"]?.trim() || null,
      decisor: row["Quem toma a decisão ?"]?.trim() || null,
      dores: row["Dores e necessidades encontradas"]?.trim() || null,
      documentacaoCiente: row["O lead esta ciente das documentações ?"]?.trim() || null,
      valoresApresentados: row["Os valores foram apresentados ?"]?.trim() || null,
    });
  }

  return Array.from(porChave.values());
}
