export type StatusManual = "resolvendo_pendencia" | "aguardando_pagamento";

export const STATUS_MANUAL_LABELS: Record<StatusManual, string> = {
  resolvendo_pendencia: "Resolvendo Pendência",
  aguardando_pagamento: "Aguardando Pagamento",
};

export type MotivoQueda =
  | "desistencia"
  | "divida"
  | "vendido"
  | "curatelado"
  | "criminal"
  | "processual"
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
    return op.sdrExercitoId === viewer.exercitoLideradoId || op.closerExercitoId === viewer.exercitoLideradoId;
  }
  return false;
}
