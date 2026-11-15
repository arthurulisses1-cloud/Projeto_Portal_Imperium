// Configuração das integrações por negócio (regras definidas com o Diretor/analista em 2026-11-11).
// Tudo que é regra de negócio mora aqui como dado: trocar uma etapa ou um canal é mudar este arquivo.

/** Nível de avanço de um lead, comum a todos os funis do CRM. */
export const NIVEL = { conectado: 1, agendada: 2, realizada: 3, proposta: 4, venda: 5 } as const;
export type Nivel = (typeof NIVEL)[keyof typeof NIVEL];

/** Canal do portal. No CRM: outbound = "outbound", inbound = "trafego" (Tráfego Pago), indicação = "indicacao". */
export type CanalPortal = "outbound" | "inbound" | "indicacao";

export type ConfigCrm = {
  /** Nome da variável de ambiente com o token do Pipefácil da conta do negócio. */
  tokenEnv: string;
  /** Funis lidos (seq do Pipefácil). Os demais (Social Seller, Eventos, ABM, Monetização…) não entram. */
  pipelines: number[];
  /** Etapa do CRM (id) → nível de avanço. Etapas fora do mapa (entrada, sem conexão, perda) não contam. */
  niveis: Record<string, Nivel>;
  /** Etapa de Ganho do funil de vendas: cada Ganho vira uma venda no portal. */
  stageGanhoVenda: string;
  /** Valor do campo Canal (canal_origem) → canal do portal. Canais ausentes daqui ficam fora do negócio. */
  canais: Record<string, CanalPortal>;
  /** MQL (inbound): faturamento e cargo aceitos. */
  mql: { faturamento: string[]; cargo: string[] };
};

export const CRM_POR_NEGOCIO: Record<string, ConfigCrm> = {
  vorp: {
    tokenEnv: "PIPEFACIL_API_TOKEN",
    // [Vorp] Inbound SDR (3), [Vorp] Outbound (28), [Vorp] Funil de Vendas (4)
    pipelines: [3, 28, 4],
    niveis: {
      // Outbound (28)
      "32320263-e093-43e7-a620-289e88d76429": NIVEL.conectado, // Conectado 3C
      "88feb540-1cf4-40df-858c-ea52be78ad42": NIVEL.conectado, // Conectado
      "131f1f47-19b7-48eb-893e-3c464a6bb181": NIVEL.conectado, // Perdemos Conexão
      "722cd95f-5518-4fcf-8229-3bb4aea55a7d": NIVEL.agendada, // Reunião Agendada
      "7a9b0a1a-d5d5-44fb-91c8-2c13488df211": NIVEL.agendada, // No Show
      "966ae249-0035-4120-ba6d-a3ff6db881ad": NIVEL.realizada, // Ganho (= reunião realizada)
      // Inbound SDR (3)
      cmq9hpng3008r40mzimnpkyaq: NIVEL.conectado, // CONECTADOS
      "7fff4758-b187-48fb-bf44-bc10582dfe25": NIVEL.conectado, // PERDEMOS CONEXÃO
      cmq9hpng3008t40mzafab69sq: NIVEL.agendada, // REUNIÃO AGENDADA
      cmq9i1fif00dn40mzn6zsplik: NIVEL.agendada, // NO-SHOW
      cmq9hpng3008v40mzd9hnzoca: NIVEL.realizada, // REUNIÃO REALIZADA (ganho)
      // Funil de Vendas (4)
      cmq9wwt8l024541npexvflx5e: NIVEL.realizada, // Reunião Realizada
      "21f92e96-e550-4c9d-b3c8-5fda04341cf0": NIVEL.realizada, // Proposta Pendente (ainda não apresentada)
      "fdd8ac8c-c615-4cbd-8da7-86010918f646": NIVEL.proposta, // Proposta Apresentada / Follow-up
      cmq9wwt8l024741np96skhjfw: NIVEL.proposta, // Em Negociação
      cmq9wwt8l024841np838jy467: NIVEL.proposta, // Proposta Aceita
      "cd570e66-1e74-46b5-b207-8ba1eb325c4c": NIVEL.proposta, // Contratação Futura (proposta já apresentada)
      cmq9wwt8l024a41npns90puld: NIVEL.venda, // Ganho
    },
    stageGanhoVenda: "cmq9wwt8l024a41npns90puld",
    canais: { outbound: "outbound", trafego: "inbound", indicacao: "indicacao" },
    mql: {
      faturamento: [
        "entre_100_e_200_mil",
        "entre_200_e_400_mil",
        "entre_400_mil_e_1_milhao",
        "entre_1_e_5_milhoes",
        "entre_5_e_20_milhoes",
        "entre_20_e_50_milhoes",
        "acima_de_50_milhoes",
      ],
      cargo: ["gerente", "diretor", "ceo_diretor_executivo", "socio", "proprietario", "proprietario_socio"],
    },
  },
};

/** Discador 3C Plus: alôs e conexões do Outbound. Tudo que vem do 3C é Outbound. */
export type Config3c = { tokenEnv: string; segundosConexao: number };
export const TRESC_POR_NEGOCIO: Record<string, Config3c> = {
  // Conta "Grupo Vorp". Alô = ligação atendida que falou com o BDR; conexão = conversa de 60s ou mais.
  vorp: { tokenEnv: "TCP_API_TOKEN", segundosConexao: 60 },
};

/** Chave de cada etapa do portal, por canal (mesma ordem de funil-negocio.ts). */
export const ETAPAS_PORTAL: Record<CanalPortal, string[]> = {
  outbound: ["alos", "conexoes", "reunioes_agendadas", "reunioes_realizadas", "propostas", "vendas"],
  inbound: ["leads", "mql", "conectados", "reunioes_agendadas", "reunioes_realizadas", "propostas", "vendas"],
  indicacao: ["leads_indicados", "reunioes_realizadas", "vendas"],
};

/** Etapa do portal → nível do CRM que ela exige (as de topo saem da criação do lead ou do 3C). */
export const NIVEL_DA_ETAPA: Record<string, Nivel> = {
  conectados: NIVEL.conectado,
  reunioes_agendadas: NIVEL.agendada,
  reunioes_realizadas: NIVEL.realizada,
  propostas: NIVEL.proposta,
  vendas: NIVEL.venda,
};

/** Primeira data em que a sincronização busca histórico do CRM (um mês antes do realizado, para
 *  saber se o lead já tinha passado pela etapa antes). */
export const INICIO_HISTORICO = "2026-10-01T00:00:00-03:00";

/** Início do modelo multinegócio: realizado e vendas automáticas só a partir daqui. */
export const INICIO_REALIZADO = "2026-11-01";
