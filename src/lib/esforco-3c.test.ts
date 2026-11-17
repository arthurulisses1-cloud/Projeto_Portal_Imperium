import { describe, expect, it } from "vitest";
import { agregar, enxugar, origemDaLista, type Ligacao } from "./esforco-3c";
import { contarAlosConexoes } from "./integracoes/tresc";

const bruta = (p: Record<string, unknown>) => ({
  call_date: "2026-11-10 10:15:00",
  agent: "Marcus Ryquelme",
  campaign: "Marcus Ryquelme",
  list: "Lista 1 - Ryquelme - Base Vorp - Base_Vorp_Pronta_3C_Plus.csv",
  status_id: 7,
  readable_status_text: "Finalizada",
  has_agent: true,
  speaking_with_agent_time: "00:01:10",
  qualification: "Conectado",
  is_conversion: false,
  is_dmc: false,
  number: "5585999999999",
  recording: "https://gravacao",
  ...p,
});

describe("esforço 3C Plus", () => {
  const brutas = [
    bruta({}),
    bruta({ speaking_with_agent_time: "00:00:20", qualification: "-" }),
    bruta({ agent: "Vinicius Ferreira", campaign: "Vinicius Ferreira", list: "Lista 1 - Vinicius - Advocacia (site #25).csv", call_date: "2026-11-11 14:00:00", is_conversion: true, is_dmc: true, speaking_with_agent_time: "00:03:00" }),
    // manual não atendida e falha: não são alô (regra do funil)
    bruta({ status_id: 5, readable_status_text: "Não Atendida", speaking_with_agent_time: "00:00:00" }),
    bruta({ status_id: 8, readable_status_text: "Falha", sip_cause: 480, speaking_with_agent_time: "00:00:00" }),
    // discador sem agente: ligação da campanha
    bruta({ agent: "-", has_agent: false, speaking_with_agent_time: "00:00:00", qualification: "-" }),
  ];
  const ligs: Ligacao[] = brutas.map(enxugar);

  it("não guarda telefone nem gravação", () => {
    expect(Object.keys(ligs[0])).not.toContain("number");
    expect(JSON.stringify(ligs)).not.toContain("5585999999999");
    expect(JSON.stringify(ligs)).not.toContain("gravacao");
  });

  it("alôs e conexões batem com a regra do funil (tresc.ts)", () => {
    const p = agregar("vorp", ligs, "2026-11-10", "2026-11-11", {}, 60);
    const funil = contarAlosConexoes(brutas as never, 60);
    expect(p.totais.alos).toBe(funil.alos);
    expect(p.totais.conexoes).toBe(funil.conexoes);
    expect(p.totais).toMatchObject({ ligacoes: 6, alos: 3, conexoes: 2, conversoes: 1, dmc: 1 });
    expect(p.porDia.map((d) => [d.dia, d.alos])).toEqual([["2026-11-10", 2], ["2026-11-11", 1]]);
    expect(p.porMotivoFalha).toEqual([{ nome: "Tocou e ninguém atendeu", ligacoes: 1 }]);
    expect(p.qualificacaoConexoes).toEqual([{ nome: "Conectado", ligacoes: 2 }]);
  });

  it("filtra por pré-vendas e mantém as opções do período", () => {
    const p = agregar("vorp", ligs, "2026-11-10", "2026-11-11", { agentes: ["Vinicius Ferreira"] }, 60);
    expect(p.totais).toMatchObject({ ligacoes: 1, alos: 1, conexoes: 1 });
    expect(p.porAgente.map((a) => a.agente)).toEqual(["Vinicius Ferreira"]);
    expect(p.opcoes.agentes).toEqual(["Marcus Ryquelme", "Vinicius Ferreira"]);
  });

  it("ranking por conexões, com mediana e média do tempo falado", () => {
    const p = agregar("vorp", ligs, "2026-11-10", "2026-11-11", {}, 60);
    const m = p.porAgente.find((a) => a.agente === "Marcus Ryquelme")!;
    expect(m).toMatchObject({ alos: 2, conexoes: 1, faladoTotal: 90, faladoMedio: 45, faladoMediano: 45 });
  });

  it("marca a origem da lista por B.U.", () => {
    expect(origemDaLista("vorp", "Lista 1 - Ryquelme - Base Vorp - x.csv")).toBe("Tráfego Pago");
    expect(origemDaLista("matchsales", "Lista 2 - Leonardo - Base Vorp - x.csv")).toBe("Tráfego Pago Vorp");
    expect(origemDaLista("matchsales", "[Reciclada] Lista 1 - Leonardo - Leads Perdidos Inbound Match Sales")).toBe("Tráfego Pago");
    expect(origemDaLista("vorp", "Lista 1 - Vinicius - Advocacia (site #25).csv")).toBeNull();
  });
});
