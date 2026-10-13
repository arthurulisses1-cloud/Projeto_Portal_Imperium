import { describe, expect, it } from "vitest";
import { triboNaData, type TriboHistorico } from "./tribo-historico";

const hist: TriboHistorico[] = [
  { profile_id: "f", tribo_id: "prometheus", desde: "2000-01-01", ate: "2026-10-12" },
  { profile_id: "f", tribo_id: "mirmidoes", desde: "2026-10-13", ate: null },
];

describe("triboNaData", () => {
  it("mantém o passado na tribo antiga e o futuro na nova", () => {
    expect(triboNaData(hist, "f", "2026-09-20", "mirmidoes")).toBe("prometheus");
    expect(triboNaData(hist, "f", "2026-10-12", "mirmidoes")).toBe("prometheus");
    expect(triboNaData(hist, "f", "2026-10-13", "mirmidoes")).toBe("mirmidoes");
    expect(triboNaData(hist, "f", "2027-01-01", "mirmidoes")).toBe("mirmidoes");
  });

  it("sem histórico, cai na tribo atual", () => {
    expect(triboNaData([], "f", "2026-09-20", "mirmidoes")).toBe("mirmidoes");
    expect(triboNaData(hist, "outra", "2026-09-20", null)).toBeNull();
  });
});
