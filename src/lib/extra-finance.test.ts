import { describe, expect, it } from "vitest";
import { ehVendaExtra } from "./extra-finance";

const time = new Set(["ikaro", "barbosa"]);
const matri = new Set(["v-matri-fora", "v-matri-ikaro", "v-matri-indic"]);

describe("ehVendaExtra", () => {
  it("fundo do Matri sem ninguém do time do Finance é Extra", () => {
    expect(ehVendaExtra({ id: "v-matri-fora", profile_id: "davi", indicador_id: "nicolas" }, time, matri)).toBe(true);
  });
  it("fundo do Matri com o dono do time continua no Recebido", () => {
    expect(ehVendaExtra({ id: "v-matri-ikaro", profile_id: "ikaro", indicador_id: "saboya" }, time, matri)).toBe(false);
  });
  it("fundo do Matri com participante do time continua no Recebido", () => {
    expect(ehVendaExtra({ id: "v-matri-indic", profile_id: "davi", indicador_id: "barbosa" }, time, matri)).toBe(false);
  });
  it("outro fundo do grupo (Addebtare, Adianta Jus) conta no Recebido mesmo sem o time", () => {
    expect(ehVendaExtra({ id: "v-addebtare", profile_id: "saboya", indicador_id: "ryquelme" }, time, matri)).toBe(false);
  });
});
