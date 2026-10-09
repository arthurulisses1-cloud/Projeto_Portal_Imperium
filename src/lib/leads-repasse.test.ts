import { describe, expect, it } from "vitest";
import { dataDoRepasse, deveAtribuirRepasse, escolherSdrRepasse, type LeadParaRepasse } from "./leads-repasse";

const base: LeadParaRepasse = {
  status_followup: "entrevista_recusada",
  recusada_em: "2026-10-01",
  repasse_sdr_id: null,
  repasse_etapa: null,
  sdr_profile_id: "s1",
  repasse_tentaram: [],
};

describe("deveAtribuirRepasse", () => {
  it("só em D+15 da recusa", () => {
    expect(dataDoRepasse("2026-10-01")).toBe("2026-10-16");
    expect(deveAtribuirRepasse(base, "2026-10-15")).toBe(false);
    expect(deveAtribuirRepasse(base, "2026-10-16")).toBe(true);
  });

  it("não atribui de novo nem lead travado em 'não faz sentido'", () => {
    expect(deveAtribuirRepasse({ ...base, repasse_sdr_id: "s2", repasse_etapa: "base_repasses" }, "2026-12-01")).toBe(false);
    expect(deveAtribuirRepasse({ ...base, repasse_etapa: "nao_faz_sentido" }, "2026-12-01")).toBe(false);
  });

  it("só vale pra entrevista recusada", () => {
    expect(deveAtribuirRepasse({ ...base, status_followup: "entrevista_validada" }, "2026-12-01")).toBe(false);
  });
});

describe("escolherSdrRepasse", () => {
  const sdrs = [
    { id: "s1", exercitoId: "A" },
    { id: "s2", exercitoId: "A" },
    { id: "s3", exercitoId: "B" },
    { id: "s4", exercitoId: "B" },
    { id: "s5", exercitoId: null },
  ];

  it("escolhe só SDR de outro Exército, com menor carga", () => {
    const carga = new Map([["s3", 4], ["s4", 1], ["s5", 2]]);
    expect(escolherSdrRepasse(base, "A", sdrs, carga)).toBe("s4");
  });

  it("não repete quem já tentou nem o SDR original", () => {
    expect(escolherSdrRepasse({ ...base, repasse_tentaram: ["s3", "s4"] }, "A", sdrs, new Map())).toBe("s5");
    expect(escolherSdrRepasse({ ...base, repasse_tentaram: ["s3", "s4", "s5"] }, "A", sdrs, new Map())).toBeNull();
  });

  it("sem Exército de origem conhecido, só exclui o original", () => {
    expect(escolherSdrRepasse(base, null, sdrs, new Map())).toBe("s2");
  });
});
