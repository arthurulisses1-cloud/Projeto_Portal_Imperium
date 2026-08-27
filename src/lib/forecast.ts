export type StatusManual = "resolvendo_pendencia" | "aguardando_pagamento" | "analise_juridico" | "esfriou";

export const STATUS_MANUAL_LABELS: Record<StatusManual, string> = {
  resolvendo_pendencia: "Resolvendo Pendência",
  aguardando_pagamento: "Aguardando Pagamento",
  analise_juridico: "Análise Jurídico",
  esfriou: "Esfriou",
};

export type MotivoQueda =
  | "desistencia"
  | "divida"
  | "vendido"
  | "curatelado"
  | "criminal"
  | "processual"
  | "honorarios"
  | "outro";

// Desistência e Outro pedem observação (por isso o "[obs]" no rótulo) — as
// demais são objetivas o bastante pra não precisar de texto livre.
export const MOTIVO_QUEDA_LABELS: Record<MotivoQueda, string> = {
  desistencia: "Desistência",
  divida: "Dívida",
  vendido: "Vendido (comprou de outro lugar)",
  curatelado: "Curatelado",
  criminal: "Antecedente criminal",
  processual: "Questão processual",
  honorarios: "Honorários",
  outro: "Outro",
};
export const MOTIVO_QUEDA_PEDE_OBS: Set<MotivoQueda> = new Set<MotivoQueda>(["desistencia", "outro"]);

export const STATUS_SHEET_LABELS: Record<string, string> = {
  PAGO: "Pago",
  CAIU: "Caiu",
  "REANÁLISE": "Reanálise",
  ASSINADO: "Assinado",
  DESISTIU: "Desistiu",
};

export const STATUS_SHEET_COR: Record<string, string> = {
  PAGO: "var(--go, #3bd68c)",
  CAIU: "var(--bad, #ff5c6c)",
  "REANÁLISE": "#ffc94d",
  ASSINADO: "#c9a24a",
  DESISTIU: "#78716c",
};

// Mesmos "baldes" de classificação do Forecast (antes só existiam dentro de
// ForecastView.tsx) — extraído pra cá pra também alimentar a tag de
// classificação nos leads Assinado/Pago em /leads (pedido do Diretor,
// 2026-08-27): "coloque uma tag pra cada classificação e essa tag apareça
// nos assinados". Cada card do resumo do Forecast corresponde a exatamente
// um desses baldes.
export type Balde = "pago" | "aguardando" | "pendencia" | "juridico" | "esfriou" | "reanalise" | "naoClassificado";

export const BALDE_LABELS: Record<Balde, string> = {
  pago: "Já pago",
  aguardando: "Certo pra pagar",
  pendencia: "Em resolução de pendência",
  juridico: "Análise Jurídico",
  esfriou: "Esfriou",
  reanalise: "Em reanálise",
  naoClassificado: "Ainda não classificado",
};

export function classificarBalde(o: { status: string; statusManual: StatusManual | null }): Balde | null {
  if (o.status === "PAGO") return "pago";
  if (o.status === "REANÁLISE") return "reanalise";
  if (o.statusManual === "aguardando_pagamento") return "aguardando";
  if (o.statusManual === "resolvendo_pendencia") return "pendencia";
  if (o.statusManual === "analise_juridico") return "juridico";
  if (o.statusManual === "esfriou") return "esfriou";
  if (o.status === "ASSINADO") return "naoClassificado";
  return null; // CAIU/DESISTIU — fora desses baldes, vivem só na aba Quedas
}

export type ForecastOp = {
  id: string;
  data: string;
  cliente: string | null;
  sdrNome: string | null;
  // chave namespada "Exército|Tribo" (evita colidir tribos homônimas entre Exércitos)
  sdrTribo: string | null;
  closerNome: string | null;
  closerId: string | null;
  closerTribo: string | null;
  valor: number;
  status: string;
  statusManual: StatusManual | null;
  observacao: string | null;
  motivoQueda: MotivoQueda | null;
  motivoQuedaObs: string | null;
  podeEditar: boolean;
};

export function podeEditarOperacao(
  viewer: { id: string; role: string; exercitoLideradoId: string | null },
  op: { closerProfileId: string | null; sdrExercitoId: string | null; closerExercitoId: string | null }
): boolean {
  if (viewer.role === "diretor") return true;
  if (viewer.role === "closer") return op.closerProfileId === viewer.id;
  if (viewer.role === "lider" && viewer.exercitoLideradoId) {
    // Time DONO da operação = time do Closer, com o SDR como fallback só
    // quando o Closer não resolve — mesma regra de atribuição usada pra
    // decidir o que aparece no Forecast do líder (ver forecast/page.tsx).
    const timeDaOperacao = op.closerExercitoId ?? op.sdrExercitoId;
    return timeDaOperacao === viewer.exercitoLideradoId;
  }
  return false;
}
