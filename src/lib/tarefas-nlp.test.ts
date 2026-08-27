import { describe, expect, it } from "vitest";
import { parseTarefaRapida } from "./tarefas-nlp";

// Quinta-feira, 27/08/2026, 10h (mesma data usada no resto da sessão) —
// fixa pra "amanhã"/"sexta" darem sempre o mesmo resultado no teste.
const AGORA = new Date("2026-08-27T10:00:00");

describe("parseTarefaRapida", () => {
  it("reconhece 'amanhã' + hora", () => {
    const r = parseTarefaRapida("Ligar pro João amanhã às 14h", AGORA);
    expect(r.titulo).toBe("Ligar pro João");
    expect(r.dueDate).toBe("2026-08-28");
    expect(r.dueTime).toBe("14:00");
  });

  it("reconhece 'hoje'", () => {
    const r = parseTarefaRapida("Enviar proposta hoje", AGORA);
    expect(r.titulo).toBe("Enviar proposta");
    expect(r.dueDate).toBe("2026-08-27");
    expect(r.dueTime).toBeNull();
  });

  it("reconhece 'depois de amanhã'", () => {
    const r = parseTarefaRapida("Follow com Maria depois de amanhã", AGORA);
    expect(r.dueDate).toBe("2026-08-29");
  });

  it("reconhece dia da semana futuro, pulando pra próxima ocorrência se for hoje", () => {
    // AGORA é quinta (2026-08-27) — "quinta" deve virar a PRÓXIMA quinta, não hoje.
    const r = parseTarefaRapida("Reunião de equipe quinta", AGORA);
    expect(r.dueDate).toBe("2026-09-03");
  });

  it("reconhece dia da semana mais próximo (sexta, daqui a 1 dia)", () => {
    const r = parseTarefaRapida("Fechar relatório sexta", AGORA);
    expect(r.dueDate).toBe("2026-08-28");
  });

  it("reconhece hora com dois pontos", () => {
    const r = parseTarefaRapida("Call com o time às 09:30", AGORA);
    expect(r.dueTime).toBe("09:30");
  });

  it("sem data/hora reconhecível, vira só o título", () => {
    const r = parseTarefaRapida("Organizar a mesa", AGORA);
    expect(r.titulo).toBe("Organizar a mesa");
    expect(r.dueDate).toBeNull();
    expect(r.dueTime).toBeNull();
  });

  it("nunca lança erro em texto vazio", () => {
    expect(() => parseTarefaRapida("", AGORA)).not.toThrow();
  });
});
