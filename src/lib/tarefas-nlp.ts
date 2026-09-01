// Quick Add: "ligar pro João amanhã às 14h" vira título "ligar pro João" +
// prazo 28/08 14:00, sem IA — só padrões de texto (dia da semana, hoje/
// amanhã, hora). Cobre o caso comum; o que não reconhece vira só título,
// sem quebrar (nunca lança erro, na pior hipótese devolve o texto inteiro
// como título e sem prazo).

import { hojeBR } from "@/lib/data-br";

const DIAS_SEMANA = ["domingo", "segunda", "terça", "terca", "quarta", "quinta", "sexta", "sábado", "sabado"];
const DIA_SEMANA_INDEX: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terça: 2,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sábado: 6,
  sabado: 6,
};

// Nunca usar toISOString() aqui — converte pra UTC e desalinha do dia local
// perto da virada. `agora` (e tudo derivado dele com setDate/getDay abaixo)
// usa getters locais, então formatar tem que ler os mesmos getters locais.
function formatarData(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type TarefaRapidaParseada = {
  titulo: string;
  dueDate: string | null;
  dueTime: string | null;
};

// Default ancorado ao meio-dia do dia calendário do Brasil (ver hojeBR, src/
// lib/data-br.ts) — nunca `new Date()` puro: o servidor roda em UTC, e um
// "hoje"/"amanhã" calculado ali ficaria um dia adiantado das ~21h à meia-noite
// no Brasil. O meio-dia evita a mesma armadilha na hora de ler de volta com
// getters locais (getDate/getDay), não importa o fuso do runtime.
export function parseTarefaRapida(
  textoOriginal: string,
  agora: Date = new Date(hojeBR() + "T12:00:00")
): TarefaRapidaParseada {
  let texto = textoOriginal.trim();
  let dueDate: string | null = null;
  let dueTime: string | null = null;

  // Hora: "às 14h", "às 14h30", "14:00", "às 9h" — sem \b antes de "à": "à"
  // não é \w pro regex sem flag /u, então um \b logo antes dele nunca fecha
  // quando vem depois de espaço (os dois lados viram "não-\w") — mesma
  // pegadinha do "amanhã" acima, achada pelos testes.
  const matchHora = texto.match(/às?\s+(\d{1,2})h(\d{2})?\b|\b(\d{1,2}):(\d{2})\b/i);
  if (matchHora) {
    const h = matchHora[1] ?? matchHora[3];
    const m = matchHora[2] ?? matchHora[4] ?? "00";
    const hora = Number(h);
    if (hora >= 0 && hora <= 23) {
      dueTime = `${String(hora).padStart(2, "0")}:${String(Number(m)).padStart(2, "0")}`;
      texto = texto.replace(matchHora[0], "").trim();
    }
  }

  // Data: hoje / amanhã / depois de amanhã / dia da semana
  // Nota: usa lookahead em vez de \b depois de "ã" — \b não fecha certo
  // logo após um caractere acentuado (o "ã" não conta como \w pro regex
  // sem flag /u, então "\bamanh[ãa]\b" nunca casava "amanhã" de verdade —
  // achado pelos testes).
  const lower = texto.toLowerCase();
  if (/\bdepois de amanh[ãa](?![a-zà-ü])/i.test(lower)) {
    const d = new Date(agora);
    d.setDate(d.getDate() + 2);
    dueDate = formatarData(d);
    texto = texto.replace(/\bdepois de amanh[ãa](?![a-zà-ü])/i, "").trim();
  } else if (/\bamanh[ãa](?![a-zà-ü])/i.test(lower)) {
    const d = new Date(agora);
    d.setDate(d.getDate() + 1);
    dueDate = formatarData(d);
    texto = texto.replace(/\bamanh[ãa](?![a-zà-ü])/i, "").trim();
  } else if (/\bhoje\b/.test(lower)) {
    dueDate = formatarData(agora);
    texto = texto.replace(/\bhoje\b/i, "").trim();
  } else {
    const diaMatch = DIAS_SEMANA.find((d) => new RegExp(`\\b${d}(-feira)?\\b`, "i").test(lower));
    if (diaMatch) {
      const alvo = DIA_SEMANA_INDEX[diaMatch];
      const d = new Date(agora);
      let delta = (alvo - d.getDay() + 7) % 7;
      if (delta === 0) delta = 7; // "sexta" numa sexta = a PRÓXIMA sexta, não hoje
      d.setDate(d.getDate() + delta);
      dueDate = formatarData(d);
      texto = texto.replace(new RegExp(`\\b${diaMatch}(-feira)?\\b`, "i"), "").trim();
    }
  }

  // Sobrou preposição solta ("pra", "em", "no dia") — limpeza cosmética.
  texto = texto.replace(/\s*\b(pra|para|em|no dia|dia)\s*$/i, "").trim();
  texto = texto.replace(/\s{2,}/g, " ").trim();

  return { titulo: texto || textoOriginal.trim(), dueDate, dueTime };
}
