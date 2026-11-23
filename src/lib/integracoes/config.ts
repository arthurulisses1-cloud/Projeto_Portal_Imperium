// Configuração das integrações por negócio (regras definidas com o Diretor/analista em 2026-11-11).
// Tudo que é regra de negócio mora aqui como dado: trocar uma etapa ou um canal é mudar este arquivo.

/** Nível de avanço de um lead, comum a todos os funis do CRM. */
export const NIVEL = { entrada: 0, conectado: 1, agendada: 2, realizada: 3, proposta: 4, venda: 5 } as const;
export type Nivel = (typeof NIVEL)[keyof typeof NIVEL];

/** Canal do portal (funis com taxas). No CRM: outbound = "outbound", inbound = "trafego" (Tráfego Pago),
 *  indicacao = "referido" (Referidos: indicação pega na call de vendas). Qualquer outro canal preenchido é
 *  "canal alternativo": a venda entra no recebido, sem funil (17/11/2026). */
export type CanalPortal = "outbound" | "inbound" | "indicacao" | "eventos";

/** Canais com funil próprio mas de trabalho esporádico (sem meta no forecast): ficam na seção recolhida do
 *  Dashboard e somam nos totais (Pace, rankings, Auditoria, RQA). Aparecem só no negócio que os mapeia em `canais`. */
export const CANAIS_OCASIONAIS: CanalPortal[] = ["eventos"];

export type ConfigCrm = {
  /** Nome da variável de ambiente com o token do Pipefácil da conta do negócio. */
  tokenEnv: string;
  /** Funis lidos (seq do Pipefácil). Os demais (Social Seller, ABM, Monetização…) não entram. */
  pipelines: number[];
  /** Etapa do CRM (id) → nível de avanço. Etapas fora do mapa (perda) são neutras; nível 0 (entrada,
   *  sem conexão) não conta etapa nenhuma, mas serve para saber que o lead voltou para trás. */
  niveis: Record<string, Nivel>;
  /** Voltar para uma etapa anterior desfaz reunião realizada, proposta e venda (ex.: proposta que volta
   *  para Proposta Pendente deixa de contar; reunião marcada como realizada por engano e devolvida para
   *  Reunião Agendada/No Show também). Agendada e conectado continuam contando: o agendamento aconteceu. */
  regressaoDesfaz?: boolean;
  /** Versão restrita da regra acima: só voltar para uma destas etapas (id) desfaz reunião realizada, proposta
   *  e venda. Para funis em que outras etapas de nível baixo também aparecem depois da proposta (ex.: Follow Up). */
  etapasQueDesfazem?: string[];
  /** Funis (id) onde a criação do lead não conta etapa: lead que nasce direto no Funil de Vendas (ex.:
   *  criado pela conversa do WhatsApp) não teve reunião realizada por isso. */
  pipelinesSemNivelNaCriacao?: string[];

  /** Guarda o código do telefone e do nome de cada lead (para casar com outro sistema, ex.: Sunne no Energy). */
  identificarContato?: boolean;
  /** Etapas de Ganho que viram venda no portal (uma por funil que fecha venda). */
  stagesGanhoVenda: string[];
  /** Valor do campo Canal (canal_origem) → canal do portal. Canais ausentes daqui ficam fora do negócio. */
  canais: Record<string, CanalPortal>;
  /** Slug dos campos do Pipefácil usados na qualificação (cada workspace tem os seus). */
  campos: { faturamento?: string; cargo?: string; tamanhoTime?: string; /** Campo de MRR (padrão "mrr"). */ mrr?: string; /** Campo "Tipo de Contrato" (Mensal, Semestral, Anual…); sem ele, procura uma propriedade com "tipo" e "contrato" no nome. */ tipoContrato?: string; /** Campo "Valor da implantação" (setup); sem ele, procura uma propriedade com "implanta" no nome. */ implantacao?: string; /** Origem do lead quando difere do canal (aparece na lista do hover). */ origem?: string };
  /** MQL (inbound): valores aceitos de cada critério; o lead precisa atender todos os critérios definidos. */
  mql: Partial<Record<CriterioMql, string[]>>;
  /** Canal alternativo cuja venda só entra se o closer que fez a call (campo Closer; sem ele, o responsável
   *  no Ganho) for um destes usuários do Pipefácil. */
  closersPorCanal?: Record<string, string[]>;
  /** E-mail do Pipefácil → e-mail do login no portal, para quem ainda está com e-mails diferentes. Plano B:
   *  vale só se o e-mail do Pipefácil não tiver conta no portal. */
  emailsAlternativos?: Record<string, string>;
  /** Primeiro dia (YYYY-MM-DD) em que os Ganhos viram venda; padrão INICIO_REALIZADO. Antes disso, vendas manuais. */
  inicioVendas?: string;
  /** Motivos de perda de lead falso (cadastro inválido): o lead sai do funil inteiro, inclusive de
   *  "Leads", seja ou não MQL (17/11/2026). */
  motivosLeadFalso?: string[];
  /** Conexões marcadas à mão em leads que nunca responderam, antes de o CRM mover para Conectados só com a
   *  resposta do lead: a entrada desses leads numa etapa de conexão antes de `ate` não conta. Etapas acima
   *  (agendada em diante) seguem valendo. */
  conexoesDesconsideradas?: { ate: string; leads: string[] };
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
  /** Cards de valor embaixo dos funis (vendido no mês e follow por temperatura): o funil de onde vem o follow
   *  (os leads abertos nele) e o campo de temperatura. Só nos negócios que têm o campo (Acrópole). */
  follow?: { pipelineId: string; campoTemperatura: string };
  /** RQA (Auditoria → RQA): valor pago por RQA aprovada pelo gerente e primeiro mês com o critério;
   *  `validadores`: perfis (id) que também validam, além do Diretor e do Head do negócio. */
  rqa?: { valor: number; desde: string; validadores?: string[] };
  /** Faixas do campo de faturamento que contam como "faturamento acima de 100 mil" (ao lado das reuniões
   *  agendadas e realizadas no Pace e no Dashboard). Sem a lista, o indicador não aparece. */
  acima100k?: string[];
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
    // [Vorp] Inbound SDR (3), [Vorp] Outbound (28), [Vorp] Listas Eventos (29, desde 23/11/2026), [Vorp] Funil de Vendas (4)
    pipelines: [3, 28, 29, 4],
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
      // Listas Eventos (29)
      "5c57fc8e-816e-413a-927d-07a4ecedd076": NIVEL.conectado, // Conectados
      "26c724e6-3ba6-4055-9514-bc8468ecc455": NIVEL.conectado, // Perdemos Conexão
      "e55c62a2-f796-4cfb-b6bb-49d8cca75b5a": NIVEL.agendada, // Reunião Agendada
      "ccfe944e-0d1e-4626-9cde-a5b1f6cbf387": NIVEL.agendada, // No Show
      "e153adab-aef7-44ca-a4b6-669b2e630b1d": NIVEL.realizada, // Ganho (= reunião realizada)
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
      "9f148d6c-7ff5-43c9-b40a-895ba3e0fb66": NIVEL.entrada, // Listas Eventos: Entrada de Leads
      "150aa133-a018-406d-9d1f-7ab2acb514b7": NIVEL.entrada, // Listas Eventos: Sem Conexão
    },
    regressaoDesfaz: true,
    // Social Selling só entra com closer do comercial que fez a call (17/11/2026).
    closersPorCanal: {
      social_selling: [
        "cmq9hl04y007540mzmda6ebng", // Arthur Ulisses
        "efaa951d-455a-4148-ba3a-fa3b5f4bafd9", // Jorge Abudi
        "2acc1ce9-0160-4bf9-8526-4f799604143a", // Vinícius Anastácio Ferreira
        "7d0660e3-9acb-4266-93db-cfdee71e2289", // Marcus Ryquelme
        "4ad3dba8-2353-4787-81e0-bbe6a4f391cf", // Bruno Brito (closer)
      ],
    },
    // Login do portal com outro e-mail (17/11/2026): Arthur até ajustarem lá; Bruno Brito entra no portal
    // com o e-mail hemerson.brito e no Pipefácil está como bruno.brito.
    emailsAlternativos: { "arthur.ulisses@grupovorp.com": "arthurulisses1@gmail.com", "bruno.brito@grupovorp.com": "hemerson.brito@grupovorp.com" },
    motivosLeadFalso: ["Lead Falso"], // motivo de perda criado no Pipefácil em 16/11/2026
    pipelinesSemNivelNaCriacao: ["cmq9wwt6u024441npj37o5f2y"], // [Vorp] Funil de Vendas
    // Follow: os leads abertos no Funil de Vendas, pela Temperatura (17/11/2026; a Match Sales não tem o campo).
    follow: { pipelineId: "cmq9wwt6u024441npj37o5f2y", campoTemperatura: "temperatura" },
    // RQA: R$ 30 por RQA aprovada pelo gerente (era R$ 80 no sistema antigo); no Senatus, de novembro/2026
    // em diante (outubro ficou no sistema antigo; 18/11/2026).
    // Validam: o Diretor, o Head e o gestor comercial (Ricássio; 18/11/2026).
    rqa: { valor: 30, desde: "2026-11", validadores: ["3ec29ffe-471f-4d5b-bae7-f9cdae8b5c5e"] },
    // Faturamento acima de 100 mil: da faixa "entre 100 e 200 mil" para cima (18/11/2026).
    acima100k: [
      "entre_100_e_200_mil",
      "entre_200_e_400_mil",
      "entre_400_mil_e_1_milhao",
      "entre_1_e_5_milhoes",
      "entre_5_e_20_milhoes",
      "entre_20_e_50_milhoes",
      "acima_de_50_milhoes",
    ],
    stagesGanhoVenda: ["cmq9wwt8l024a41npns90puld"],
    canais: { outbound: "outbound", trafego: "inbound", referido: "indicacao", eventos: "eventos" },
    campos: { faturamento: "quanto_sua_empresa_fatura_por_mes", cargo: "qual_seu_cargo_atual", origem: "origem_lead" },
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
      // Contratação Futura (382bcdf9-310a-401f-bc9a-f4d4ab20efb4) fica fora do mapa (20/11/2026): o time usa a
      // etapa para lead que só contrata mais para frente, mesmo sem reunião. Não conta etapa; vale o que veio antes.
      "31aab8a9-79f7-4824-b229-4d1a4eac8319": NIVEL.venda, // Ganho
      // Inbound (1). Reestruturado em 20/11/2026 no modelo do Outbound: o lead vai para Conectados por automação
      // quando responde. Antes disso não havia Reunião Realizada (a reunião contava como realizada ao virar proposta).
      "626eef2e-4d84-49ab-ac8b-4d59d1cea87b": NIVEL.conectado, // Conectados (antes "Atendimento Humano")
      // Follow Up antigo (usado antes e depois da proposta; sai quando os últimos leads forem movidos). Segue como
      // conexão para não mudar o histórico; o Follow-Up novo (pós-proposta) conta como proposta.
      "44da3e0a-3f86-4e4a-8d1d-8c52c41db97e": NIVEL.conectado, // Follow Up (antigo)
      "a4252513-8bce-41cd-9fe1-43af1d1cb12f": NIVEL.agendada, // Reunião Agendada
      "37711003-af90-4cc9-a846-9d7ccccd1ddc": NIVEL.agendada, // No Show
      "9ebbf333-bcad-4c07-9310-bc7a5c775e33": NIVEL.realizada, // Reunião Realizada
      "d40dee61-af9a-459e-8220-0887456a4346": NIVEL.proposta, // Proposta Enviada
      "86eb5f00-82e7-497e-ab9d-68c9b1f72cf9": NIVEL.proposta, // Follow-Up
      "424f1202-e824-46e5-8604-08ff31ea703d": NIVEL.proposta, // Em Negociação
      "cb69fb19-dd9d-41cb-8ae0-5618484aeb30": NIVEL.proposta, // Proposta Aceita/Aguardando Pagamento
      // Contratação Futura (6e54190d-9453-4b1b-b619-09f12b344a39) fica fora do mapa, como no Outbound.
      "8c448cb1-7c1a-4244-bb64-690a70f453d0": NIVEL.venda, // Ganho
    },
    // Realizada marcada por engano e devolvida para Reunião Agendada ou No Show deixa de contar (20/11/2026).
    // Só essas etapas desfazem: no Inbound, o Follow Up (nível de conexão) também é usado depois da proposta.
    etapasQueDesfazem: [
      "7184f5de-b7d6-4271-8dee-b7fcf29cf93f", // Outbound: Reunião Agendada
      "576ef8ec-5359-4c03-b183-96f88b371bcd", // Outbound: No Show
      "a4252513-8bce-41cd-9fe1-43af1d1cb12f", // Inbound: Reunião Agendada
      "37711003-af90-4cc9-a846-9d7ccccd1ddc", // Inbound: No Show
    ],
    stagesGanhoVenda: ["8c448cb1-7c1a-4244-bb64-690a70f453d0", "31aab8a9-79f7-4824-b229-4d1a4eac8319"],
    // Inbound = só Tráfego Pago; Referidos = "Referido". Google, Instagram, WhatsApp IA, Parceiros, Indicação
    // de cliente/investidor etc. são canais alternativos (vendas sem funil).
    canais: { outbound: "outbound", trafego: "inbound", referido: "indicacao" },
    campos: { faturamento: "faturamento_mensal", cargo: "cargo", tamanhoTime: "tamanho_do_time", mrr: "mrr_competencia", origem: "origem_lead" }, // "MRR Competência" (aba Principal)
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
    // As vendas de novembro inteiro vêm dos Ganhos (o lançamento manual até 15/11 não foi feito; 17/11/2026).
    inicioVendas: "2026-11-01",
    // Lead perdido como Duplicado sai do funil inteiro: conta só o lead original, que segue andando (20/11/2026).
    motivosLeadFalso: ["Duplicado"],
    // Novembro/2026: até 20/11 o time movia o lead para Atendimento Humano (hoje Conectados) ao assumir o
    // atendimento, antes da resposta. Estes 25 contavam como conectados sem nunca terem mandado uma mensagem
    // (auditoria de 20/11, lendo as conversas). Desde 20/11 a automação só move quando o lead responde.
    conexoesDesconsideradas: {
      ate: "2026-11-21T00:00:00-03:00",
      leads: [
        "ee2d0495-6636-4764-98f9-ddc54fc5e10e", // #15660 Anderson Costa
        "857cb773-94ae-443a-aaca-23de60dd0279", // #15655 Giovani
        "fd273ccd-0628-4f0c-8ff9-a140c58a9503", // #15616 Gustavo Garcia
        "04419aab-2565-4e32-9b6b-597d9a01170a", // #15607 Carrion Benefícios
        "7df98cb9-6e88-4776-909c-d0c70b4b99f7", // #15605 Kennaldy
        "21e765ef-646b-4492-9e72-ff6af46bef04", // #15592 Gabriel Trindade
        "b0b3d62b-7326-4b31-b826-27dc395f9317", // #15576 Valéria Eloy
        "02fed48a-3495-4dbf-845a-ed0f48e49ed8", // #15573 Cristiane Gonçalves
        "7635e816-1ed2-47bd-8604-a5d66d644948", // #15565 Amanda Luizetto
        "f6e1db92-5ea7-4ef8-b1ef-e09cbfcc04a0", // #15562 Charles Marques
        "48026ae6-fd88-4764-a4ed-e91a2c5a7c28", // #15561 Imagiliê
        "bc6efa49-752b-4599-96dd-c53136fc9b53", // #15560 Fernando
        "e82d35ed-8160-4653-91c9-ec4323bc9d77", // #15542 Antoni Luis Schlagel
        "f0f93282-f028-400b-9d88-2f280a05e91b", // #15495 Samuel
        "58e492f5-19ae-4c36-8273-a27374448946", // #15455 Elvis Marcelino
        "eebb9e4d-cc70-443d-bbde-6ec8396da8e4", // #15423 Roberta Dias da Silva
        "2586168b-dda4-4d2c-8edb-95cbfcf2fd70", // #15400 Suelen Rodrigues Ferreira
        "0e0cd91e-6b6c-4d53-bc34-1d3956eeeccd", // #15346 Nilton Nepomuceno
        "259e46a2-6cd8-4ea9-ac11-30c22e1d7fac", // #15342 Maria do livramento
        "596f1394-4de6-4fe0-b190-2f168385d76d", // #15311 Tiago Souza
        "77980f0d-bf56-4f6c-8fbe-153ea227fce0", // #15303 Eduardo Tadeu
        "6ae68c00-7f25-4b36-88c6-c7f66b4ee9d6", // #15297 Valdir Lopes
        "ba3076d2-e2ab-4016-bbd2-37a2d67e56db", // #15295 Tiago Santos
        "da22386b-e0db-4782-a83a-855d47183b88", // #15294 Tiago
        "d45c6f5c-f5e4-427d-8fbe-7f575b64b0c1", // #15279 João Júnior
      ],
    },
    // Login do portal ainda com outro e-mail (17/11/2026), até ajustarem lá.
    emailsAlternativos: { "arthur.ulisses@grupovorp.com": "arthurulisses1@gmail.com" },
  },
  // Maximus Energy: workspace "Sunne" do Pipefácil, funil Inside Sales (16/11/2026). O dashboard mostra
  // um funil só, com as etapas do Inside Sales (sem canais nem meta do forecast). O Recebido é a soma do
  // valor dos leads no Ganho do Pipefácil (recebidoPeloCrm). Precisa de PIPEFACIL_API_TOKEN_SUNNE.
  "vorp-energy": {
    tokenEnv: "PIPEFACIL_API_TOKEN_SUNNE",
    identificarContato: true,
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
export type Config3c = {
  tokenEnv: string;
  segundosConexao: number;
  /** Agente do 3C (agent_id) → usuário do Pipefácil, para o funil por pré-vendas. Quem entra no
   *  discador: acrescentar aqui. Agente fora do mapa conta só no total do time. */
  agentes?: Record<number, string>;
  /** Campanha do 3C → usuário do Pipefácil, para as tentativas por pré-vendas (cada BDR tem a própria campanha,
   *  com o nome dele; a chave casa com o começo do nome da campanha, sem acento). Fora do mapa: só no total. */
  campanhas?: Record<string, string>;
};

/** Conversão ideal de tentativas (ligações discadas no 3C) para alôs. O forecast não tem tentativas: a meta
 *  de tentativas sai da meta de alôs dividida por esta taxa (20/11/2026). */
export const TAXA_TENTATIVA_ALO = 0.15;
export const TRESC_POR_NEGOCIO: Record<string, Config3c> = {
  // Conta "Grupo Vorp". Alô = ligação atendida que falou com o BDR; conexão = conversa de 60s ou mais.
  vorp: {
    tokenEnv: "TCP_API_TOKEN",
    segundosConexao: 60,
    agentes: {
      134502: "7d0660e3-9acb-4266-93db-cfdee71e2289", // Marcus Ryquelme
      272989: "2acc1ce9-0160-4bf9-8526-4f799604143a", // Vinicius Ferreira → Vinícius Anastácio Ferreira
      252689: "efaa951d-455a-4148-ba3a-fa3b5f4bafd9", // Jorge Abudi
    },
    // Inclui "Jorge Abudi - Eventos" e "Jorge Abudi - Rastreamento".
    campanhas: {
      "Marcus Ryquelme": "7d0660e3-9acb-4266-93db-cfdee71e2289",
      "Vinicius Ferreira": "2acc1ce9-0160-4bf9-8526-4f799604143a",
      "Jorge Abudi": "efaa951d-455a-4148-ba3a-fa3b5f4bafd9",
    },
  },
  // Conta própria da Galáticos (MatchSales), mesmas regras.
  matchsales: {
    tokenEnv: "TCP_API_TOKEN_MATCH",
    segundosConexao: 60,
    agentes: {
      273159: "b58b3ad3-8f28-48a3-a103-4c65db9307b4", // Fernando → Fernando César F. Honorato
      273160: "fd4b8d73-5438-4c60-a985-87f3394721e6", // Leonardo
      273158: "1b2cd3b8-5b6c-48e0-83a5-3d4fa3e8f94f", // Matheus → Matheus Mesquita
      273390: "cmpy5vxa2026g3ukcydv7ddke", // Nicolas → Nicolas Roberto
    },
    campanhas: {
      Fernando: "b58b3ad3-8f28-48a3-a103-4c65db9307b4",
      Leonardo: "fd4b8d73-5438-4c60-a985-87f3394721e6",
      Matheus: "1b2cd3b8-5b6c-48e0-83a5-3d4fa3e8f94f",
      Nicolas: "cmpy5vxa2026g3ukcydv7ddke",
    },
  },
};

/** Chave de cada etapa do portal, por canal (mesma ordem de funil-negocio.ts). */
export const ETAPAS_PORTAL: Record<CanalPortal, string[]> = {
  outbound: ["alos", "conexoes", "reunioes_agendadas", "reunioes_realizadas", "propostas", "vendas"],
  inbound: ["leads", "mql", "conectados", "reunioes_agendadas", "reunioes_realizadas", "propostas", "vendas"],
  indicacao: ["leads_indicados", "reunioes_realizadas", "vendas"],
  eventos: ["leads", "conectados", "reunioes_agendadas", "reunioes_realizadas", "propostas", "vendas"],
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
