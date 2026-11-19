import { describe, expect, it } from "vitest";
import { ehRotaLegada } from "./rotas-legadas";

describe("ehRotaLegada", () => {
  it("bloqueia as rotas do sistema antigo e as sub-rotas", () => {
    for (const r of ["/tribo", "/exercito", "/carreira", "/estrelas", "/estrelas/time", "/ranking", "/campanhas/abc", "/pace", "/weekly", "/trilha"]) expect(ehRotaLegada(r)).toBe(true);
  });
  it("não pega as rotas atuais nem as que ficam", () => {
    for (const r of ["/", "/pace-negocio", "/comissao-negocio", "/compromisso", "/compromissos", "/dre", "/fechamento", "/comissao", "/academy/trilha", "/academy", "/legado", "/gestao", "/producao", "/leads", "/trilhas"]) expect(ehRotaLegada(r)).toBe(false);
  });
});
