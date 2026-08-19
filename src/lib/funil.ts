export const FUNNEL_STAGES = [
  "tentativas",
  "alos",
  "conexoes",
  "entrevistas",
  "assinaturas",
  "pagos",
] as const;

export type FunilEtapa = (typeof FUNNEL_STAGES)[number];

export const FUNNEL_LABELS: Record<FunilEtapa, string> = {
  tentativas: "Tentativas",
  alos: "Alôs",
  conexoes: "Conexões",
  entrevistas: "Entrevistas",
  assinaturas: "Assinaturas",
  pagos: "Pagos",
};

export function periodoParaDatas(periodo: "hoje" | "semana" | "mes") {
  const hoje = new Date();
  const fim = hoje.toISOString().slice(0, 10);
  let inicio: string;

  if (periodo === "hoje") {
    inicio = fim;
  } else if (periodo === "semana") {
    const diaSemana = hoje.getDay(); // 0 = domingo
    const seg = new Date(hoje);
    seg.setDate(hoje.getDate() - ((diaSemana + 6) % 7)); // volta pra segunda-feira
    inicio = seg.toISOString().slice(0, 10);
  } else {
    inicio = fim.slice(0, 7) + "-01";
  }

  return { inicio, fim };
}
