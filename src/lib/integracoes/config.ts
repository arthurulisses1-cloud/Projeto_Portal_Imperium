// Configuração das integrações por negócio (regras definidas com o Diretor/analista em 2026-11-11).
// Tudo que é regra de negócio mora aqui como dado: trocar uma etapa ou um canal é mudar este arquivo.

/** Nível de avanço de um lead, comum a todos os funis do CRM. */
export const NIVEL = { entrada: 0, conectado: 1, agendada: 2, realizada: 3, proposta: 4, venda: 5 } as const;
export type Nivel = (typeof NIVEL)[keyof typeof NIVEL];

/** Canal do portal. No CRM: outbound = "outbound", inbound = "trafego" (Tráfego Pago), indicação = "indicacao". */
export type CanalPortal = "outbound" | "inbound" | "indicacao";

export type ConfigCrm = {
  /** Nome da variável de ambiente com o token do Pipefácil da conta do negócio. */
  tokenEnv: string;
  /** Funis lidos (seq do Pipefácil). Os demais (Social Seller, Eventos, ABM, Monetização…) não entram. */
  pipelines: number[];
  /** Etapa do CRM (id) → nível de avanço. Etapas fora do mapa (perda) são neutras; nível 0 (entrada,
   *  sem conexão) não conta etapa nenhuma, mas serve para saber que o lead voltou para trás. */
  niveis: Record<string, Nivel>;
  /** Voltar para uma etapa anterior desfaz reunião realizada, proposta e venda (ex.: proposta que volta
   *  para Proposta Pendente deixa de contar; reunião marcada como realizada por engano e devolvida para
   *  Reunião Agendada/No Show também). Agendada e conectado continuam contando: o agendamento aconteceu. */
  regressaoDesfaz?: boolean;
  /** Funis (id) onde a criação do lead não conta etapa: lead que nasce direto no Funil de Vendas (ex.:
   *  criado pela conversa do WhatsApp) não teve reunião realizada por isso. */
  pipelinesSemNivelNaCriacao?: string[];
  /** Campo com a data/hora da reunião. Reunião marcada como realizada antes desse horário (ex.: COPILOT
   *  movendo para Ganho na hora do agendamento) só conta quando o horário chega. */
  campoReuniao?: string;
  /** Etapas de Ganho que viram venda no portal (uma por funil que fecha venda). */
  stagesGanhoVenda: string[];
  /** Valor do campo Canal (canal_origem) → canal do portal. Canais ausentes daqui ficam fora do negócio. */
  canais: Record<string, CanalPortal>;
  /** Slug dos campos do Pipefácil usados na qualificação (cada workspace tem os seus). */
  campos: { faturamento?: string; cargo?: string; tamanhoTime?: string };
  /** MQL (inbound): valores aceitos de cada critério; o lead precisa atender todos os critérios definidos. */
  mql: Partial<Record<CriterioMql, string[]>>;
  /** Primeiro dia (YYYY-MM-DD) em que os Ganhos viram venda; padrão INICIO_REALIZADO. Antes disso, vendas manuais. */
  inicioVendas?: string;
  /**
   * Funil próprio no dashboard: as etapas do funil do CRM, sem canais nem meta do forecast. Com ele,
   * `niveis` e `canais` não são usados. Gravado em funil_realizado com canal "outbound".
   */
  funilUnico?: FunilUnico;
  /**
   * Recebido do negócio = soma dos Ganhos (`stagesGanhoVenda`) do espelho do CRM, pela data de fechamento,
   * no lugar da tabela vendas. O Ganho não vira venda: dispensa vínculo do responsável com um login do portal.
   */
  recebidoPeloCrm?: boolean;
  /** Início do histórico lido na primeira sincronização; padrão INICIO_HISTORICO. */
  inicioHistorico?: string;
  /** Sincroniza numa chamada própria (/api/sync-integracoes?negocio=slug), com o tempo da função só para ele. */
  syncSeparado?: boolean;
};

export type CriterioMql = "faturamento" | "cargo" | "tamanho_time";

/**
 * Etapas em ordem. Um lead conta numa etapa no dia em que chegou pela primeira vez nela ou numa
 * etapa à frente. A etapa sem `stages` é a entrada: conta pela criação do lead.
 */
export type FunilUnico = { titulo: string; etapas: { chave: string; label: string; stages: string[] }[] };

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
      // Etapas de entrada (nível 0): voltar para elas desfaz o que vinha depois.
      "badae364-589d-46ca-a54b-c4ef85780cd0": NIVEL.entrada, // Outbound: Entrada de Leads
      "74c30965-d9f9-4223-a8d9-6b15278f8fc5": NIVEL.entrada, // Outbound: Sem Conexão
      cmq9hpng3008q40mz50stjrfp: NIVEL.entrada, // Inbound SDR: ENTRADA DE LEADS
      "15f65232-76e8-4c24-93d0-a52c6c477998": NIVEL.entrada, // Inbound SDR: SEM CONEXÃO
    },
    regressaoDesfaz: true,
    pipelinesSemNivelNaCriacao: ["cmq9wwt6u024441npj37o5f2y"], // [Vorp] Funil de Vendas
    campoReuniao: "reuniao_agendada",
    stagesGanhoVenda: ["cmq9wwt8l024a41npns90puld"],
    canais: { outbound: "outbound", trafego: "inbound", indicacao: "indicacao" },
    campos: { faturamento: "quanto_sua_empresa_fatura_por_mes", cargo: "qual_seu_cargo_atual" },
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
  // Galáticos (MatchSales): workspace próprio do Pipefácil (regras de 2026-11-15).
  // Não há Funil de Vendas separado: Inbound e Outbound fecham a venda no próprio funil.
  // Self-Checkout, GTM Outbound, Suporte, Ativações e Parceiros não entram.
  matchsales: {
    tokenEnv: "PIPEFACIL_API_TOKEN_MATCH",
    // [MS] Inbound (1), [MS] Outbound (25)
    pipelines: [1, 25],
    niveis: {
      // Outbound (25)
      "c7e46790-7958-4169-a863-dc7f719d2edd": NIVEL.conectado, // Conectado 3C
      "0de7c924-4532-4a78-9e6f-938676487b38": NIVEL.conectado, // Conectado
      "aeebf0f5-e94d-441f-b9b6-dd7bdda90c71": NIVEL.conectado, // Perdemos Conexão
      "7184f5de-b7d6-4271-8dee-b7fcf29cf93f": NIVEL.agendada, // Reunião Agendada
      "576ef8ec-5359-4c03-b183-96f88b371bcd": NIVEL.agendada, // No Show
      "8e2ee4e7-e369-4d57-b9c7-26370d9d48d0": NIVEL.realizada, // Reunião Realizada
      "058201af-9ad4-4b43-adfb-145b820358eb": NIVEL.proposta, // Proposta Enviada
      "25aceef3-3528-488b-9f6d-c15b6cd9d551": NIVEL.proposta, // Follow-Up
      "b52cb249-6aa9-4f00-ae25-557357c0cc44": NIVEL.proposta, // Em Negociação
      "78175757-8a62-4e00-a05d-9cdbc08c921b": NIVEL.proposta, // Proposta Aceita/Aguardando Pagamento
      "382bcdf9-310a-401f-bc9a-f4d4ab20efb4": NIVEL.proposta, // Contratação Futura
      "31aab8a9-79f7-4824-b229-4d1a4eac8319": NIVEL.venda, // Ganho
      // Inbound (1). Sem etapa de Reunião Realizada: a reunião conta como realizada quando vira proposta.
      "626eef2e-4d84-49ab-ac8b-4d59d1cea87b": NIVEL.conectado, // Atendimento Humano
      "44da3e0a-3f86-4e4a-8d1d-8c52c41db97e": NIVEL.conectado, // Follow Up
      "a4252513-8bce-41cd-9fe1-43af1d1cb12f": NIVEL.agendada, // Reunião Agendada
      "d40dee61-af9a-459e-8220-0887456a4346": NIVEL.proposta, // Proposta enviada
      "cb69fb19-dd9d-41cb-8ae0-5618484aeb30": NIVEL.proposta, // Aguardando pagamento
      "8c448cb1-7c1a-4244-bb64-690a70f453d0": NIVEL.venda, // Ganho
    },
    stagesGanhoVenda: ["8c448cb1-7c1a-4244-bb64-690a70f453d0", "31aab8a9-79f7-4824-b229-4d1a4eac8319"],
    // Inbound = só Tráfego Pago (Google, Instagram, WhatsApp IA ficam fora).
    canais: {
      outbound: "outbound",
      trafego: "inbound",
      indicacao_cliente: "indicacao",
      indicacao_investidor: "indicacao",
      parceiros: "indicacao",
      "Indicação Cliente": "indicacao",
      "Indicação Investidor": "indicacao",
    },
    campos: { faturamento: "faturamento_mensal", cargo: "cargo", tamanhoTime: "tamanho_do_time" },
    // MQL: faturamento a partir de 50 mil/mês e mais de 2 vendedores.
    mql: {
      faturamento: [
        "entre_50_e_100_mil",
        "entre_50_e_80_mil",
        "entre_80_e_150_mil",
        "entre_100_e_150_mil",
        "entre_100_e_300_mil",
        "entre_150_e_300_mil",
        "entre_300_e_500_mil",
        "acima_de_500_mil",
        "Entre 100 e 400 mil",
        "Acima de 400 mil",
        "301 mil a 500 mil mês",
        "501 mil a 1 milhão mês",
        "Acima de 1 milhão mês",
      ],
      tamanho_time: ["entre_2_e_5_vendedores", "entre_5_e_20_vendedores", "entre_6_e_20_vendedores", "mais_de_20_vendedores"],
    },
    // Até 15/11 as vendas da Match foram lançadas à mão; daqui em diante vêm dos Ganhos.
    inicioVendas: "2026-11-16",
  },
  // Maximus Energy: workspace "Sunne" do Pipefácil, funil Inside Sales (16/11/2026). O dashboard mostra
  // um funil só, com as etapas do Inside Sales (sem canais nem meta do forecast). O Recebido é a soma do
  // valor dos leads no Ganho do Pipefácil (recebidoPeloCrm). Precisa de PIPEFACIL_API_TOKEN_SUNNE.
  "vorp-energy": {
    tokenEnv: "PIPEFACIL_API_TOKEN_SUNNE",
    pipelines: [13],
    niveis: {},
    stagesGanhoVenda: ["6ec9fb40-184f-442b-a0cb-5fc7f0b89bac"], // Ganho do Inside Sales
    canais: {},
    campos: {},
    mql: {},
    funilUnico: {
      titulo: "Inside Sales",
      etapas: [
        { chave: "is_leads", label: "Leads", stages: [] },
        { chave: "is_conectados", label: "Leads Conectados", stages: ["29f5f805-ad8d-4756-91c3-a00b7aa100ae"] },
        { chave: "is_conta_coletada", label: "Conta Coletada", stages: ["c0a372d4-96cc-4ca0-bced-46ffc7a0216e"] },
        { chave: "is_reuniao_realizada", label: "Reunião Realizada", stages: ["cd9bbaf1-c75a-46b6-bd87-37c511edb788"] },
        { chave: "is_aguardando_assinatura", label: "Aguardando Assinatura", stages: ["0d80b4c9-3fb2-41b0-bea4-16bb4bbd61c6"] },
        { chave: "is_validacao_comercial", label: "Validação Comercial", stages: ["d7a84f4a-7e29-473f-ac87-206ea34c351f"] },
        { chave: "is_ganho", label: "Ganho", stages: ["6ec9fb40-184f-442b-a0cb-5fc7f0b89bac"] },
      ],
    },
    recebidoPeloCrm: true,
    // A conta da Sunne tem muito movimento (~12 mil eventos só em novembro) e a API não filtra o
    // histórico por funil: começa no início do realizado e roda numa chamada própria.
    inicioHistorico: "2026-11-01T00:00:00-03:00",
    syncSeparado: true,
  },
};


/** Discador 3C Plus: alôs e conexões do Outbound. Tudo que vem do 3C é Outbound. */
export type Config3c = { tokenEnv: string; segundosConexao: number };
export const TRESC_POR_NEGOCIO: Record<string, Config3c> = {
  // Conta "Grupo Vorp". Alô = ligação atendida que falou com o BDR; conexão = conversa de 60s ou mais.
  vorp: { tokenEnv: "TCP_API_TOKEN", segundosConexao: 60 },
  // Conta própria da Galáticos (MatchSales), mesmas regras.
  matchsales: { tokenEnv: "TCP_API_TOKEN_MATCH", segundosConexao: 60 },
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
