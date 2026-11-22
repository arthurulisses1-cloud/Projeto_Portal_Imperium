// Esforço 3C Plus (Dados → Esforço 3C Plus): as ligações do discador de cada B.U., somadas na hora.
// Trazido do "Dashboard 3C Plus" do painel antigo de listas (17/11/2026), com a regra de alô e de
// conexão do Senatus (a mesma do funil: ver integracoes/tresc.ts), para os números baterem com o
// Dashboard do Negócio. Só servidor: telefone e gravação não saem daqui; à página vão os agregados.
import { TRESC_POR_NEGOCIO } from "@/lib/integracoes/config";
import { segundos } from "@/lib/integracoes/tresc";

const BASE = "https://app.3c.plus/api/v1";
const POR_PAGINA = 1000;
const PARALELO = 4;
const MAX_PAGINAS = 60;
export const MAX_DIAS = 31;
/** Período com hoje muda a toda hora; período fechado não muda mais. */
const TTL_HOJE_MS = 90_000;
const TTL_PASSADO_MS = 15 * 60_000;

/** Status do 3C: 5 Não atendida, 8 Falha (a discagem não conectou). */
const STATUS_NAO_ATENDIDA = [5, 8];
const STATUS_FALHA = 8;
/** Motivo da falha pelo código da operadora (sip_cause). */
const MOTIVOS_FALHA: Record<number, string> = {
  480: "Tocou e ninguém atendeu",
  603: "Recusada ou bloqueada",
  404: "Número não existe",
  410: "Número desativado",
  484: "Número incompleto",
  486: "Ocupado",
  600: "Ocupado",
  408: "Sem resposta da rede",
  487: "Cancelada",
  503: "Rede indisponível",
};

/** Diagnóstico do discador: como terminaram as tentativas (mesmas categorias do painel antigo). */
export const DIAGNOSTICO: { id: string; nome: string; nota: string }[] = [
  { id: "caixa_postal", nome: "Caixa postal", nota: "Caiu na caixa postal, antes ou depois de atender." },
  { id: "nao_atendida", nome: "Não atendida", nota: "Tocou até o fim e ninguém atendeu." },
  { id: "recusada", nome: "Recusada ou bloqueada", nota: "A pessoa recusou, ou a operadora ou o celular bloqueou (número marcado como spam, por exemplo)." },
  { id: "numero_invalido", nome: "Número inválido", nota: "Número que não existe, desativado ou incompleto." },
  { id: "falha", nome: "Falha", nota: "A discagem não completou por outro motivo (ocupado, rede, cancelada)." },
  { id: "abandonada", nome: "Abandonada", nota: "A pessoa atendeu, mas não havia agente livre." },
  { id: "atendida", nome: "Atendida", nota: "Chegou a um agente e terminou normalmente." },
  { id: "outros", nome: "Outros", nota: "Os demais status do 3C Plus." },
];
export function categoriaDoDiscador(l: Pick<Ligacao, "status" | "sip">): string {
  if (l.status === 9 || l.status === 15) return "caixa_postal";
  if (l.status === 5) return "nao_atendida";
  if (l.status === 6) return "abandonada";
  if (l.status === 7) return "atendida";
  if (l.status !== STATUS_FALHA) return "outros";
  if (l.sip === 480) return "nao_atendida";
  if (l.sip === 603) return "recusada";
  if (l.sip === 404 || l.sip === 410 || l.sip === 484) return "numero_invalido";
  return "falha";
}

const normal = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
/** Dono da campanha: o pré-vendas cujo nome abre o nome da campanha (no 3C cada campanha leva o nome de
 *  quem a trabalha, ex.: "Jorge Abudi - Rastreamento", "Matheus Mesquita" para o agente "Matheus"). */
export function donoDaCampanha(campanha: string, agentes: string[]): string | null {
  const c = normal(campanha);
  let melhor: string | null = null;
  for (const a of agentes) {
    const n = normal(a);
    if (n && (c === n || c.startsWith(`${n} `) || c.startsWith(`${n}-`)) && (!melhor || n.length > normal(melhor).length)) melhor = a;
  }
  return melhor;
}

/** Origem do lead pelo nome da lista do discador, por B.U. (mesma regra do campo "Origem do lead"). */
const ORIGEM_DA_LISTA: Record<string, { padrao: RegExp; origem: string }[]> = {
  vorp: [{ padrao: /base[ _]vorp|jorge abudi - base/i, origem: "Tráfego Pago" }],
  matchsales: [
    { padrao: /base[ _]vorp/i, origem: "Tráfego Pago Vorp" },
    { padrao: /perdidos inbound/i, origem: "Tráfego Pago" },
  ],
};

/** Só os campos usados (sem telefone nem gravação). */
export type Ligacao = {
  data: string; // "2026-11-11 18:12:39", Brasília
  agente: string | null;
  agenteId: number | null;
  campanha: string;
  campanhaId: number | null;
  lista: string | null;
  status: number;
  statusNome: string;
  sip: number | null;
  desligamento: string | null;
  falado: number; // segundos falados com o agente
  temAgente: boolean;
  qualificacao: string | null;
  conversao: boolean;
  dmc: boolean;
};

type Bruta = Record<string, unknown>;
const texto = (v: unknown) => (typeof v === "string" && v.trim() && v.trim() !== "-" ? v.trim() : null);

export function enxugar(c: Bruta): Ligacao {
  return {
    data: String(c.call_date ?? ""),
    agente: texto(c.agent),
    agenteId: Number(c.agent_id) || null,
    campanha: texto(c.campaign) ?? `Campanha ${c.campaign_id ?? "?"}`,
    campanhaId: Number(c.campaign_id) || null,
    lista: texto(c.list),
    status: Number(c.status_id ?? 0),
    statusNome: texto(c.readable_status_text) ?? `Status ${c.status_id ?? "?"}`,
    sip: Number(c.sip_cause) || null,
    desligamento: texto(c.readable_hangup_cause_text),
    falado: segundos(typeof c.speaking_with_agent_time === "string" ? c.speaking_with_agent_time : null),
    temAgente: c.has_agent === true,
    qualificacao: texto(c.qualification),
    conversao: c.is_conversion === true,
    dmc: c.is_dmc === true,
  };
}

/** Alô: atendida e falou com o pré-vendas (mesma regra do funil). */
export const ehAlo = (l: Ligacao) => l.temAgente && !STATUS_NAO_ATENDIDA.includes(l.status);
/** Conexão: conversa de N segundos ou mais com o pré-vendas. */
export const ehConexao = (l: Ligacao, segundosConexao: number) => l.falado >= segundosConexao;

/** Nome da lista quando a ligação não veio de lista (ligação manual). */
export const SEM_LISTA = "Sem lista (ligação manual)";
type Funil3 = { ligacoes: number; alos: number; conexoes: number };
/** pessoa → dia → lista → contagem. */
export type PorDiaLista = Record<string, Record<string, Record<string, Funil3>>>;

export type Filtro = { agentes?: string[]; campanhas?: string[]; listas?: string[] };
type Contagem = { ligacoes: number; alos: number; conexoes: number; conversoes: number };
const zero = (): Contagem => ({ ligacoes: 0, alos: 0, conexoes: 0, conversoes: 0 });

export type PainelEsforco = {
  segundosConexao: number;
  totais: Contagem & { dmc: number; faladoTotal: number; faladoMedio: number; faladoMediano: number };
  porDia: ({ dia: string } & Contagem)[];
  porHora: { hora: number; ligacoes: number; alos: number; conexoes: number }[];
  /** Por pré-vendas: tentativas das campanhas dele (o discador disca sem agente); alôs e conexões, as que ele atendeu. */
  porPreVendas: { nome: string; temDono: boolean; ligacoes: number; alos: number; conexoes: number }[];
  /** Tentativas de cada pré-vendas por dia (a mesma regra da tabela por pré-vendas), para o gráfico de linhas. */
  tentativasPorPessoaDia: Record<string, Record<string, number>>;
  /** Por pré-vendas, dia e lista: tentativas, alôs e conexões (mesma atribuição da tabela por pré-vendas). */
  porPessoaDiaLista: PorDiaLista;
  porDiagnostico: { id: string; nome: string; nota: string; ligacoes: number }[];
  porAgente: { agente: string; alos: number; conexoes: number; conversoes: number; dmc: number; faladoTotal: number; faladoMedio: number; faladoMediano: number }[];
  porCampanha: ({ campanha: string } & Contagem)[];
  porLista: ({ lista: string; campanha: string; origem: string | null } & Contagem)[];
  porStatus: { nome: string; ligacoes: number }[];
  porMotivoFalha: { nome: string; ligacoes: number }[];
  porQualificacao: { nome: string; ligacoes: number }[];
  qualificacaoConexoes: { nome: string; ligacoes: number }[];
  /** Opções dos filtros (do período, antes de filtrar, para não sumirem ao marcar uma). */
  opcoes: { agentes: string[]; campanhas: string[]; listas: string[] };
};

function mediana(v: number[]): number {
  if (v.length === 0) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}

function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function origemDaLista(slug: string, lista: string | null): string | null {
  if (!lista) return null;
  return ORIGEM_DA_LISTA[slug]?.find((r) => r.padrao.test(lista))?.origem ?? null;
}

/**
 * Agrega as ligações do período (pura). O discador disca sem agente, então a ligação é da campanha:
 * ligações, status e falhas contam tudo; com filtro de pré-vendas, só as ligações deles entram.
 */
export function agregar(slug: string, ligacoes: Ligacao[], de: string, ate: string, filtro: Filtro, segundosConexao: number): PainelEsforco {
  const ordenar = (xs: (string | null)[]) => Array.from(new Set(xs.filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const opcoes = {
    agentes: ordenar(ligacoes.map((l) => l.agente)),
    campanhas: ordenar(ligacoes.map((l) => l.campanha)),
    listas: ordenar(ligacoes.map((l) => l.lista)),
  };
  const soAg = filtro.agentes?.length ? new Set(filtro.agentes) : null;
  const donos = new Map(opcoes.campanhas.map((c) => [c, donoDaCampanha(c, opcoes.agentes)]));
  /** Pré-vendas da ligação: quem atendeu; sem agente (discador), o dono da campanha. */
  const pessoa = (l: Ligacao) => l.agente ?? donos.get(l.campanha) ?? null;
  const soCamp = filtro.campanhas?.length ? new Set(filtro.campanhas) : null;
  const soLista = filtro.listas?.length ? new Set(filtro.listas) : null;
  const doFiltro = ligacoes.filter(
    (l) => (!soAg || (pessoa(l) !== null && soAg.has(pessoa(l) as string))) && (!soCamp || soCamp.has(l.campanha)) && (!soLista || (l.lista && soLista.has(l.lista))),
  );

  const totais = { ...zero(), dmc: 0, faladoTotal: 0, faladoMedio: 0, faladoMediano: 0 };
  const dias = new Map<string, { dia: string } & Contagem>();
  for (let d = de; d <= ate; d = somarDias(d, 1)) dias.set(d, { dia: d, ...zero() });
  const horas = Array.from({ length: 24 }, (_, hora) => ({ hora, ligacoes: 0, alos: 0, conexoes: 0 }));
  const pv = new Map<string, { nome: string; temDono: boolean; ligacoes: number; alos: number; conexoes: number }>();
  const porPessoaDia: Record<string, Record<string, number>> = {};
  const porPessoaDiaLista: PorDiaLista = {};
  const diag = new Map(DIAGNOSTICO.map((d) => [d.id, { ...d, ligacoes: 0 }]));
  const agentes = new Map<string, { agente: string; alos: number; conexoes: number; conversoes: number; dmc: number; faladoTotal: number; falados: number[] }>();
  const campanhas = new Map<string, { campanha: string } & Contagem>();
  const listas = new Map<string, { lista: string; campanha: string; origem: string | null } & Contagem>();
  const status = new Map<string, number>();
  const falhas = new Map<string, number>();
  const qualif = new Map<string, number>();
  const qualifCon = new Map<string, number>();
  const falados: number[] = [];
  const mais = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const l of doFiltro) {
    const alo = ehAlo(l);
    const con = ehConexao(l, segundosConexao);
    const conta = (c: Contagem) => {
      c.ligacoes++;
      if (alo) c.alos++;
      if (con) c.conexoes++;
      if (l.conversao) c.conversoes++;
    };
    conta(totais);
    if (l.dmc) totais.dmc++;
    if (alo) {
      totais.faladoTotal += l.falado;
      falados.push(l.falado);
    }
    const d = dias.get(l.data.slice(0, 10));
    if (d) conta(d);
    const h = horas[Number(l.data.slice(11, 13))];
    if (h) {
      h.ligacoes++;
      if (alo) h.alos++;
      if (con) h.conexoes++;
    }
    if (l.agente && (alo || con)) {
      const a = agentes.get(l.agente) ?? { agente: l.agente, alos: 0, conexoes: 0, conversoes: 0, dmc: 0, faladoTotal: 0, falados: [] };
      if (alo) {
        a.alos++;
        a.faladoTotal += l.falado;
        a.falados.push(l.falado);
      }
      if (con) a.conexoes++;
      if (l.conversao) a.conversoes++;
      if (l.dmc) a.dmc++;
      agentes.set(l.agente, a);
    }
    const c = campanhas.get(l.campanha) ?? { campanha: l.campanha, ...zero() };
    conta(c);
    campanhas.set(l.campanha, c);
    const nomeLista = l.lista ?? SEM_LISTA;
    const li = listas.get(nomeLista) ?? { lista: nomeLista, campanha: l.campanha, origem: origemDaLista(slug, l.lista), ...zero() };
    conta(li);
    listas.set(nomeLista, li);
    const quem = pessoa(l);
    const chavePv = quem ?? `Sem pré-vendas: ${l.campanha}`;
    const linhaPv = pv.get(chavePv) ?? { nome: chavePv, temDono: !!quem, ligacoes: 0, alos: 0, conexoes: 0 };
    linhaPv.ligacoes++;
    if (quem) {
      const dias = (porPessoaDia[quem] ??= {});
      dias[l.data.slice(0, 10)] = (dias[l.data.slice(0, 10)] ?? 0) + 1;
      const doDia = ((porPessoaDiaLista[quem] ??= {})[l.data.slice(0, 10)] ??= {});
      const f = (doDia[nomeLista] ??= { ligacoes: 0, alos: 0, conexoes: 0 });
      f.ligacoes++;
      if (alo) f.alos++;
      if (con) f.conexoes++;
    }
    if (alo) linhaPv.alos++;
    if (con) linhaPv.conexoes++;
    pv.set(chavePv, linhaPv);
    diag.get(categoriaDoDiscador(l))!.ligacoes++;
    mais(status, l.statusNome);
    if (l.status === STATUS_FALHA) mais(falhas, (l.sip && MOTIVOS_FALHA[l.sip]) || (l.desligamento ? `Outro (${l.desligamento})` : "Sem motivo informado"));
    if (l.qualificacao) mais(qualif, l.qualificacao);
    if (con) mais(qualifCon, l.qualificacao ?? "Sem qualificação");
  }
  totais.faladoMedio = totais.alos > 0 ? Math.round(totais.faladoTotal / totais.alos) : 0;
  totais.faladoMediano = mediana(falados);
  const lista = (m: Map<string, number>) => Array.from(m, ([nome, ligacoes]) => ({ nome, ligacoes })).sort((a, b) => b.ligacoes - a.ligacoes);

  return {
    segundosConexao,
    totais,
    porDia: Array.from(dias.values()),
    porHora: horas,
    porAgente: Array.from(agentes.values())
      .map(({ falados: f, ...a }) => ({ ...a, faladoMedio: a.alos > 0 ? Math.round(a.faladoTotal / a.alos) : 0, faladoMediano: mediana(f) }))
      .sort((a, b) => b.conexoes - a.conexoes || b.alos - a.alos),
    porPreVendas: Array.from(pv.values()).sort((a, b) => Number(b.temDono) - Number(a.temDono) || b.conexoes - a.conexoes || b.ligacoes - a.ligacoes),
    porDiagnostico: Array.from(diag.values()),
    tentativasPorPessoaDia: porPessoaDia,
    porPessoaDiaLista,
    porCampanha: Array.from(campanhas.values()).sort((a, b) => b.ligacoes - a.ligacoes),
    porLista: Array.from(listas.values()).sort((a, b) => b.conexoes - a.conexoes || b.ligacoes - a.ligacoes),
    porStatus: lista(status),
    porMotivoFalha: lista(falhas),
    porQualificacao: lista(qualif),
    qualificacaoConexoes: lista(qualifCon),
    opcoes,
  };
}

// ---------------------------------------------------------------- listas ao longo do tempo (por pré-vendas)

export type LinhaDoTempoListas = {
  /** Um ponto por dia do eixo: o funil do dia e a lista principal (a de mais tentativas; null sem ligação). */
  dias: ({ dia: string; lista: string | null; listasNoDia: number } & Funil3)[];
  /** Trechos seguidos com a mesma lista principal (índices em `dias`, inclusivos). Dia sem ligação no meio não corta o trecho. */
  faixas: { lista: string; inicio: number; fim: number }[];
  /** Total por lista no período, com os dias em que a lista teve tentativa; da que mais discou para a que menos. */
  listas: ({ lista: string; dias: number } & Funil3)[];
};

const fimDeSemana = (dia: string) => [0, 6].includes(new Date(`${dia}T12:00:00Z`).getUTCDay());

/**
 * Linha do tempo de um pré-vendas, para ver se alôs e conexões caem e com qual lista. O eixo são os dias
 * úteis do período, mais o sábado ou domingo em que ele discou, a partir do primeiro dia em que discou.
 */
export function linhaDoTempoListas(porDia: Record<string, Record<string, Funil3>>, periodo: string[]): LinhaDoTempoListas {
  const discou = (d: string) => Object.keys(porDia[d] ?? {}).length > 0;
  const primeiro = periodo.findIndex(discou);
  const eixo = primeiro < 0 ? [] : periodo.slice(primeiro).filter((d) => !fimDeSemana(d) || discou(d));
  const totais = new Map<string, { lista: string; dias: number } & Funil3>();
  const dias = eixo.map((dia) => {
    const ponto = { dia, lista: null as string | null, listasNoDia: 0, ligacoes: 0, alos: 0, conexoes: 0 };
    let maior = 0;
    for (const [lista, f] of Object.entries(porDia[dia] ?? {}).sort(([a], [b]) => a.localeCompare(b, "pt-BR"))) {
      ponto.listasNoDia++;
      ponto.ligacoes += f.ligacoes;
      ponto.alos += f.alos;
      ponto.conexoes += f.conexoes;
      if (f.ligacoes > maior) [maior, ponto.lista] = [f.ligacoes, lista];
      const t = totais.get(lista) ?? { lista, dias: 0, ligacoes: 0, alos: 0, conexoes: 0 };
      if (f.ligacoes > 0) t.dias++;
      t.ligacoes += f.ligacoes;
      t.alos += f.alos;
      t.conexoes += f.conexoes;
      totais.set(lista, t);
    }
    return ponto;
  });
  const faixas: LinhaDoTempoListas["faixas"] = [];
  dias.forEach((p, i) => {
    if (!p.lista) return;
    const ultima = faixas[faixas.length - 1];
    if (ultima && ultima.lista === p.lista) ultima.fim = i;
    else faixas.push({ lista: p.lista, inicio: i, fim: i });
  });
  return { dias, faixas, listas: Array.from(totais.values()).sort((a, b) => b.ligacoes - a.ligacoes || a.lista.localeCompare(b.lista, "pt-BR")) };
}

// ---------------------------------------------------------------- leitura (com cache curto)

const cache = new Map<string, { ate: number; ligacoes: Ligacao[] }>();

async function pagina(token: string, de: string, ate: string, n: number) {
  const qs = new URLSearchParams({ start_date: `${de} 00:00:00`, end_date: `${ate} 23:59:59`, per_page: String(POR_PAGINA), page: String(n), api_token: token });
  const res = await fetch(`${BASE}/calls?${qs}`, { headers: { Accept: "application/json", "Accept-Encoding": "gzip" }, cache: "no-store" });
  if (!res.ok) throw new Error(`3C Plus respondeu ${res.status}`);
  const json = (await res.json()) as { data?: Bruta[]; meta?: { pagination?: { total_pages?: number } } };
  return { itens: (json.data ?? []).map(enxugar), total: Number(json.meta?.pagination?.total_pages ?? 1) };
}

/** Ligações da B.U. no período [de, ate] (datas de Brasília). Guarda por pouco tempo em memória. */
export async function buscarLigacoes(slug: string, de: string, ate: string, hoje: string): Promise<{ ligacoes: Ligacao[]; truncado: boolean }> {
  const cfg = TRESC_POR_NEGOCIO[slug];
  if (!cfg) throw new Error("B.U. sem 3C Plus");
  const token = process.env[cfg.tokenEnv];
  if (!token) throw new Error(`${cfg.tokenEnv} não configurado`);
  const chave = `${slug}|${de}|${ate}`;
  const guardado = cache.get(chave);
  if (guardado && guardado.ate > Date.now()) return { ligacoes: guardado.ligacoes, truncado: false };
  const primeira = await pagina(token, de, ate, 1);
  const ultima = Math.min(primeira.total, MAX_PAGINAS);
  const ligacoes = [...primeira.itens];
  const faltam = Array.from({ length: Math.max(0, ultima - 1) }, (_, i) => i + 2);
  for (let i = 0; i < faltam.length; i += PARALELO) {
    const lote = await Promise.all(faltam.slice(i, i + PARALELO).map((n) => pagina(token, de, ate, n)));
    for (const p of lote) ligacoes.push(...p.itens);
  }
  cache.set(chave, { ate: Date.now() + (ate >= hoje ? TTL_HOJE_MS : TTL_PASSADO_MS), ligacoes });
  if (cache.size > 30) cache.delete(cache.keys().next().value as string);
  return { ligacoes, truncado: primeira.total > MAX_PAGINAS };
}

// ---------------------------------------------------------------- utilização do pré-vendas
// `GET /campaigns/{id}/agents/metrics`: por agente e por hora, o tempo em cada estado na campanha
// (`idle` esperando o discador entregar ligação, `speaking` falando, `acw` pós-ligação na tela de
// qualificação; `manual` fica de fora, pode vir com horas de modo manual esquecido aberto). Pausa não
// soma tempo nenhum. Tempo ativo no discador = esperando + falando + pós-ligação. Mesma conta do painel antigo.

export type LinhaAtividade = { agenteId: number | null; esperando: number; falando: number; pos: number };
export type Atividade = { esperando: number; falando: number; pos: number; ativo: number };

export function somarAtividade(linhas: LinhaAtividade[], agentes: Set<number> | null): Atividade {
  const t = { esperando: 0, falando: 0, pos: 0 };
  for (const l of linhas) {
    if (agentes && (!l.agenteId || !agentes.has(l.agenteId))) continue;
    t.esperando += l.esperando;
    t.falando += l.falando;
    t.pos += l.pos;
  }
  return { ...t, ativo: t.esperando + t.falando + t.pos };
}

const cacheAtividade = new Map<string, { ate: number; linhas: LinhaAtividade[] }>();

/** Tempo dos agentes nas campanhas, no período (datas de Brasília). Guarda por pouco tempo em memória. */
export async function buscarAtividade(slug: string, de: string, ate: string, hoje: string, campanhas: number[]): Promise<LinhaAtividade[]> {
  const cfg = TRESC_POR_NEGOCIO[slug];
  const token = cfg ? process.env[cfg.tokenEnv] : undefined;
  if (!token || campanhas.length === 0) return [];
  const ids = Array.from(new Set(campanhas)).sort((a, b) => a - b);
  const chave = `${slug}|${de}|${ate}|${ids.join(",")}`;
  const guardado = cacheAtividade.get(chave);
  if (guardado && guardado.ate > Date.now()) return guardado.linhas;
  const linhas: LinhaAtividade[] = [];
  const umaCampanha = async (id: number) => {
    const qs = new URLSearchParams({ api_token: token, startDate: `${de} 00:00:00`, endDate: `${ate} 23:59:59` });
    const res = await fetch(`${BASE}/campaigns/${id}/agents/metrics?${qs}`, { headers: { Accept: "application/json", "Accept-Encoding": "gzip" }, cache: "no-store" });
    if (!res.ok) throw new Error(`3C Plus respondeu ${res.status} nas métricas da campanha ${id}`);
    const json = (await res.json()) as { data?: Bruta[] };
    return (json.data ?? []).map((l) => {
      const ag = l.agent as { id?: unknown } | undefined;
      const s = (v: unknown) => segundos(typeof v === "string" ? v : null);
      return { agenteId: Number(ag?.id) || null, esperando: s(l.idle), falando: s(l.speaking), pos: s(l.acw) };
    });
  };
  for (let i = 0; i < ids.length; i += PARALELO) for (const lote of await Promise.all(ids.slice(i, i + PARALELO).map(umaCampanha))) linhas.push(...lote);
  cacheAtividade.set(chave, { ate: Date.now() + (ate >= hoje ? TTL_HOJE_MS : TTL_PASSADO_MS), linhas });
  if (cacheAtividade.size > 30) cacheAtividade.delete(cacheAtividade.keys().next().value as string);
  return linhas;
}
