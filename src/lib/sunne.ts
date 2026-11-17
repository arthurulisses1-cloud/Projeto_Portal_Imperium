// Sunne (Energy): leitura direta da API de parceiro, sem espelho no banco.
// Só roda no servidor (a chave nunca vai ao navegador). O resultado fica em
// cache por alguns minutos para não repetir a varredura a cada acesso nem
// gastar o limite da API (120 requisições/min por chave).
//
// Na Sunne, cada vendedor do Energy é uma organização da rede. O nome da
// organização é casado com a pessoa do portal pelo nome completo ou pelos
// apelidos de Gestão de Pessoas (nomes_planilha). A API não informa canal.
// Dados pessoais dos clientes são descartados na leitura e não entram no cache.
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarNome } from "@/lib/sync/parse";
import { identidadeDe, type IdentidadeLead } from "@/lib/identidade";
import { casarComPipefacil } from "@/lib/energy-canais";

const BASE = "https://parceiro.sunne.com.br/api/v1";
const POR_PAGINA = 500;
const MAX_PAGINAS = 200;
export const CACHE_SUNNE_SEGUNDOS = 300;

/** Produto contado em contas subidas, fechados, etapas e kWh (geração distribuída). */
export const PRODUTO_KWH = "gd";

/** Negócio da Sunne só com o que o portal usa (sem nome, documento ou contato do cliente). */
export type SunneDeal = {
  id: string;
  organizationId: string;
  product: string;
  funnel: string;
  stage: string;
  stageKey: string;
  isClosed: boolean;
  isLost: boolean;
  createdAt: string;
  closedAt: string | null;
  averageConsumption: number | null;
  /** Onde o negócio estava ao ser perdido (funil e etapa). */
  lostFromFunnel?: string | null;
  lostFromStageKey?: string | null;
  /** A validação da Sunne está esperando um retorno interno (não é pendência do parceiro). */
  waitingNote?: boolean;
  /** Pendências abertas ou em reanálise (só buscadas para negócios em validação). */
  pendenciasAbertas?: number;
  /** Códigos (nunca o dado) do telefone e das palavras do nome do cliente, para casar com o Pipefácil. */
  identidade?: IdentidadeLead;
  /** kWh compensáveis e valor da primeira fatura (kWh compensáveis x valor do kWh) informados pela Sunne. */
  compensableKwh?: number | null;
  referenceValue?: number | null;
};

export type SunneOrganizacao = { id: string; nome: string | null };

export type SunneRede = { deals: SunneDeal[]; organizacoes: SunneOrganizacao[]; lidoEm: string };

export type SunneVendedor = { nome: string | null; profileId: string | null; pessoa: string | null };

export type SunneOrganizacaoResumo = {
  organizationId: string;
  nome: string;
  profileId: string | null;
  pessoa: string | null;
  criados: number;
  fechados: number;
  kwh: number;
};

/** Funil das contas subidas no mês (todos os canais), pelo estado atual de cada negócio. */
export type FunilContasSunne = {
  /** Contas subidas (negócios criados no mês). */
  subidas: number;
  /** Chegaram a "Contrato enviado" ou além. */
  avancaram: number;
  /** Chegaram a "Validação": o contrato foi assinado. */
  validacao: number;
  /** Das validações: virou ganho (fechado). */
  ganho: number;
  /** Das validações: com pendência aberta ou em reanálise. */
  pendencia: number;
  /** Das validações: aguardando retorno interno da Sunne. */
  aguardando: number;
  /** Das validações: em análise, sem pendência. */
  emAnalise: number;
  /** Das validações: perdidos de fato. */
  perdidoAposValidacao: number;
  /** Perdidos de contas subidas no mês, em qualquer etapa. */
  perdidos: number;
  porOrganizacao: { organizationId: string; nome: string; pessoa: string | null; subidas: number; avancaram: number; validacao: number; ganho: number; pendencia: number; perdidos: number }[];
  /** Mesmos números separados por canal (só quando o casamento com o Pipefácil está disponível). */
  porCanal: { pipefacil: ContagemContas; plataforma: ContagemContas } | null;
};

export type ContagemContas = { subidas: number; avancaram: number; validacao: number; ganho: number; pendencia: number; perdidos: number };

export type SunneResumo = {
  contas: FunilContasSunne;
  /** Sunne x Pipefácil: leads casados (nome e telefone) e vendas do Pipefácil que não estão na Sunne. */
  consolidado: { ganhosPipefacilSemSunne: number; casados: number; leadsPipefacilComTelefone: number } | null;
  criados: number;
  fechados: number;
  consumoMedioFechado: number;
  fechadosComConsumo: number;
  etapas: { chave: string; nome: string; quantidade: number }[];
  porOrganizacao: SunneOrganizacaoResumo[];
  lidoEm: string;
};

// ---------------------------------------------------------------- leitura da API

function texto(v: unknown): v is string {
  return typeof v === "string";
}
function textoOuNulo(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function numeroOuNulo(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function lerDeal(bruto: unknown): SunneDeal {
  const d = (bruto ?? {}) as Record<string, unknown>;
  if (!texto(d.id) || !texto(d.organizationId) || !texto(d.product) || !texto(d.funnel) || !texto(d.stageKey) || typeof d.isClosed !== "boolean" || typeof d.isLost !== "boolean" || !texto(d.createdAt) || !Number.isFinite(Date.parse(d.createdAt))) {
    throw new Error("Negócio Sunne inválido");
  }
  return {
    id: d.id,
    organizationId: d.organizationId,
    product: d.product,
    funnel: d.funnel,
    stage: textoOuNulo(d.stage) || d.stageKey,
    stageKey: d.stageKey,
    isClosed: d.isClosed,
    isLost: d.isLost,
    createdAt: d.createdAt,
    closedAt: textoOuNulo(d.closedAt),
    averageConsumption: typeof d.averageConsumption === "number" && Number.isFinite(d.averageConsumption) ? d.averageConsumption : null,
    lostFromFunnel: textoOuNulo((d.lostFrom as Record<string, unknown> | null | undefined)?.funnel),
    lostFromStageKey: textoOuNulo((d.lostFrom as Record<string, unknown> | null | undefined)?.stageKey),
    waitingNote: texto(d.waitingNote) && d.waitingNote.trim() !== "",
    identidade: identidadeDe(d.phone, [d.contactName, d.companyName].filter(texto).join(" ")),
    compensableKwh: numeroOuNulo(d.compensableKwh),
    referenceValue: numeroOuNulo(d.referenceValue),
  };
}

function lerComissao(bruto: unknown): { id: string; organizationId: string; organizationName: string | null } {
  const c = (bruto ?? {}) as Record<string, unknown>;
  if (!texto(c.id) || !texto(c.organizationId)) throw new Error("Comissão Sunne inválida");
  return { id: c.id, organizationId: c.organizationId, organizationName: textoOuNulo(c.organizationName)?.trim() || null };
}

/** Lê todas as páginas de uma listagem, sem repetir itens (a paginação é por offset). */
async function listarTudo<T extends { id: string }>(token: string, caminho: string, chave: string, filtros: Record<string, string>, ler: (bruto: unknown) => T): Promise<T[]> {
  const itens = new Map<string, T>();
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const url = new URL(`${BASE}/${caminho}`);
    for (const [k, v] of Object.entries(filtros)) url.searchParams.set(k, v);
    url.searchParams.set("limit", String(POR_PAGINA));
    url.searchParams.set("offset", String(pagina * POR_PAGINA));
    const resposta = await fetch(url, { headers: { "s-api-key": token }, cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!resposta.ok) throw new Error(`Sunne HTTP ${resposta.status} em /${caminho}`);
    const corpo = (await resposta.json()) as Record<string, unknown> | null;
    const lista = corpo?.[chave];
    if (!Array.isArray(lista) || typeof corpo?.hasMore !== "boolean") throw new Error(`Resposta Sunne inválida em /${caminho}`);
    for (const bruto of lista) {
      const item = ler(bruto);
      itens.set(item.id, item);
    }
    if (!corpo.hasMore) return Array.from(itens.values());
    if (lista.length === 0) throw new Error(`Paginação Sunne inválida em /${caminho}`);
  }
  throw new Error(`Limite de paginação Sunne excedido em /${caminho}`);
}

/** Em validação o negócio pode ter pendência aberta; a listagem não informa, então lê o detalhe só desses (poucos). */
async function contarPendencias(token: string, deals: SunneDeal[]): Promise<void> {
  const emValidacao = deals.filter((d) => d.funnel === "sales" && d.stageKey === "validation" && !d.isClosed && !d.isLost).slice(0, 80);
  for (let i = 0; i < emValidacao.length; i += 5) {
    await Promise.all(
      emValidacao.slice(i, i + 5).map(async (d) => {
        try {
          const resposta = await fetch(new URL(`${BASE}/deals/${d.id}`), { headers: { "s-api-key": token }, cache: "no-store", signal: AbortSignal.timeout(15000) });
          if (!resposta.ok) return;
          const corpo = (await resposta.json()) as { pendencies?: { status?: string }[] } | null;
          d.pendenciasAbertas = (corpo?.pendencies ?? []).filter((p) => p.status === "open" || p.status === "in_review").length;
        } catch {
          // Sem o detalhe, o negócio cai em "em análise": a contagem de pendências é um refinamento, não derruba o painel.
        }
      }),
    );
  }
}

/** Negócios de GD da rede e o nome de cada organização (que vem das comissões). Sem cache. */
export async function lerRedeSunne(): Promise<SunneRede> {
  const token = process.env.SUNNE_SYS_API_TOKEN;
  if (!token) throw new Error("Sunne não configurada");
  const [deals, comissoes] = await Promise.all([
    listarTudo(token, "deals", "deals", { product: PRODUTO_KWH }, lerDeal),
    listarTudo(token, "commissions", "commissions", {}, lerComissao),
  ]);
  await contarPendencias(token, deals);
  const nomes = new Map<string, string | null>();
  for (const d of deals) if (!nomes.has(d.organizationId)) nomes.set(d.organizationId, null);
  for (const c of comissoes) if (c.organizationName) nomes.set(c.organizationId, c.organizationName);
  return { deals, organizacoes: Array.from(nomes, ([id, nome]) => ({ id, nome })), lidoEm: new Date().toISOString() };
}

/** Mesma leitura, guardada em cache no servidor por alguns minutos. */
export const redeSunneEmCache = unstable_cache(lerRedeSunne, ["sunne-rede-v4"], { revalidate: CACHE_SUNNE_SEGUNDOS, tags: ["sunne"] });

// ---------------------------------------------------------------- vendedor de cada organização

export type PerfilParaCasar = { id: string; full_name: string | null; nomes_planilha?: string[] | null };

/** Casa o nome da organização com uma única pessoa (nome completo ou apelido). Ambíguo ou sem par: null. */
export function casarOrganizacao(nome: string | null, perfis: PerfilParaCasar[]): string | null {
  if (!nome) return null;
  const alvo = normalizarNome(nome);
  if (!alvo) return null;
  const achados = new Set<string>();
  for (const p of perfis) {
    const nomes = [p.full_name, ...(p.nomes_planilha ?? [])].filter((n): n is string => !!n);
    if (nomes.some((n) => normalizarNome(n) === alvo)) achados.add(p.id);
  }
  return achados.size === 1 ? Array.from(achados)[0] : null;
}

export function vendedoresSunne(organizacoes: SunneOrganizacao[], perfis: PerfilParaCasar[]): Map<string, SunneVendedor> {
  const nomePor = new Map(perfis.map((p) => [p.id, p.full_name]));
  return new Map(
    organizacoes.map((o) => {
      const profileId = casarOrganizacao(o.nome, perfis);
      return [o.id, { nome: o.nome, profileId, pessoa: profileId ? nomePor.get(profileId) ?? null : null }];
    }),
  );
}

// ---------------------------------------------------------------- resumo do mês

function mesLocal(data: string | null): string | null {
  if (!data || !Number.isFinite(Date.parse(data))) return null;
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).formatToParts(new Date(data));
  return `${partes.find((p) => p.type === "year")?.value}-${partes.find((p) => p.type === "month")?.value}`;
}

const ORDEM_VENDAS = ["referral_sent", "accepted_by_team", "meeting_scheduled", "proposal_sent", "contract_sent", "validation"];

/** Até onde o negócio chegou: 0..5 = etapa do funil de vendas; 6 = validado/fechado ou além; -1 = não dá para saber. */
export function alcanceDoNegocio(d: SunneDeal): number {
  if (d.isClosed || d.funnel === "connection" || d.funnel === "post_sales") return 6;
  if (d.isLost) {
    if (d.lostFromFunnel === "connection" || d.lostFromFunnel === "post_sales") return 6;
    const i = ORDEM_VENDAS.indexOf(d.lostFromStageKey ?? "");
    return i >= 0 ? i : -1;
  }
  const i = ORDEM_VENDAS.indexOf(d.stageKey);
  return i >= 0 ? i : 0;
}

/** Funil das contas subidas no mês, independente do canal: subidas → avançaram → validação → ganho, pendência ou perdido. */
export function funilDasContas(
  deals: SunneDeal[],
  ano: number,
  mes: number,
  vendedores: Map<string, SunneVendedor> = new Map(),
  /** Ids de negócios da Sunne que são o mesmo lead de um lead do Pipefácil (canal Pipefácil); o resto é da plataforma. */
  viaPipefacil: ReadonlySet<string> | null = null,
): FunilContasSunne {
  const periodo = `${ano}-${String(mes).padStart(2, "0")}`;
  const vazio = () => ({ subidas: 0, avancaram: 0, validacao: 0, ganho: 0, pendencia: 0, perdidos: 0 });
  const porOrg = new Map<string, ReturnType<typeof vazio> & { organizationId: string; nome: string; pessoa: string | null }>();
  const f: FunilContasSunne = {
    subidas: 0,
    avancaram: 0,
    validacao: 0,
    ganho: 0,
    pendencia: 0,
    aguardando: 0,
    emAnalise: 0,
    perdidoAposValidacao: 0,
    perdidos: 0,
    porOrganizacao: [],
    porCanal: viaPipefacil ? { pipefacil: vazio(), plataforma: vazio() } : null,
  };

  for (const d of deals) {
    if (d.product !== PRODUTO_KWH || mesLocal(d.createdAt) !== periodo) continue;
    const v = vendedores.get(d.organizationId);
    let org = porOrg.get(d.organizationId);
    if (!org) {
      org = { ...vazio(), organizationId: d.organizationId, nome: v?.nome || `Organização ${d.organizationId.slice(0, 6)}`, pessoa: v?.pessoa ?? null };
      porOrg.set(d.organizationId, org);
    }
    const alcance = alcanceDoNegocio(d);
    const canal = f.porCanal ? (viaPipefacil?.has(d.id) ? f.porCanal.pipefacil : f.porCanal.plataforma) : null;
    f.subidas++;
    org.subidas++;
    if (canal) canal.subidas++;
    if (alcance >= 4) {
      f.avancaram++;
      org.avancaram++;
      if (canal) canal.avancaram++;
    }
    if (alcance >= 5) {
      f.validacao++;
      org.validacao++;
      if (canal) canal.validacao++;
      if (d.isLost) f.perdidoAposValidacao++;
      else if (d.isClosed) {
        f.ganho++;
        org.ganho++;
        if (canal) canal.ganho++;
      } else if ((d.pendenciasAbertas ?? 0) > 0) {
        f.pendencia++;
        org.pendencia++;
        if (canal) canal.pendencia++;
      } else if (d.waitingNote) f.aguardando++;
      else f.emAnalise++;
    }
    if (d.isLost) {
      f.perdidos++;
      org.perdidos++;
      if (canal) canal.perdidos++;
    }
  }
  f.porOrganizacao = Array.from(porOrg.values()).sort((a, b) => b.subidas - a.subidas || b.ganho - a.ganho || a.nome.localeCompare(b.nome, "pt-BR"));
  return f;
}

/**
 * Contas subidas (negócios criados), fechados não perdidos e o consumo médio
 * (kWh/mês) desses fechados no mês, no total e por organização (vendedor).
 * As etapas são a posição atual dos negócios não perdidos, de qualquer mês.
 */
export function resumirSunne(deals: SunneDeal[], ano: number, mes: number, vendedores: Map<string, SunneVendedor> = new Map()): Omit<SunneResumo, "lidoEm" | "contas" | "consolidado"> {
  const periodo = `${ano}-${String(mes).padStart(2, "0")}`;
  const porOrg = new Map<string, SunneOrganizacaoResumo>();
  const daOrg = (id: string) => {
    let r = porOrg.get(id);
    if (!r) {
      const v = vendedores.get(id);
      r = { organizationId: id, nome: v?.nome || `Organização ${id.slice(0, 6)}`, profileId: v?.profileId ?? null, pessoa: v?.pessoa ?? null, criados: 0, fechados: 0, kwh: 0 };
      porOrg.set(id, r);
    }
    return r;
  };

  let criados = 0;
  let fechados = 0;
  let kwh = 0;
  let comConsumo = 0;
  const etapas = new Map<string, { chave: string; nome: string; quantidade: number }>();
  for (const d of deals) {
    if (d.product !== PRODUTO_KWH) continue;
    if (mesLocal(d.createdAt) === periodo) {
      criados++;
      daOrg(d.organizationId).criados++;
    }
    if (d.isClosed && !d.isLost && mesLocal(d.closedAt) === periodo) {
      fechados++;
      const org = daOrg(d.organizationId);
      org.fechados++;
      if (d.averageConsumption !== null) {
        kwh += d.averageConsumption;
        comConsumo++;
        org.kwh += d.averageConsumption;
      }
    }
    if (!d.isLost) {
      const chave = `${d.funnel}:${d.stageKey}`;
      const etapa = etapas.get(chave) ?? { chave, nome: d.stage || d.stageKey, quantidade: 0 };
      etapa.quantidade++;
      etapas.set(chave, etapa);
    }
  }

  return {
    criados,
    fechados,
    consumoMedioFechado: kwh,
    fechadosComConsumo: comConsumo,
    etapas: Array.from(etapas.values()).sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome)),
    porOrganizacao: Array.from(porOrg.values()).sort((a, b) => b.kwh - a.kwh || b.fechados - a.fechados || b.criados - a.criados || a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

/** Resumo do mês para o Dashboard do Energy: API da Sunne (em cache) + pessoas do portal. */
export async function buscarResumoSunne(supabase: SupabaseClient, ano: number, mes: number): Promise<SunneResumo> {
  const [rede, { data: perfis, error }] = await Promise.all([redeSunneEmCache(), supabase.from("profiles").select("id, full_name, nomes_planilha").eq("ativo", true)]);
  if (error) throw new Error("Erro lendo profiles: " + error.message);
  const vendedores = vendedoresSunne(rede.organizacoes, perfis ?? []);
  const canais = await casarComPipefacil(supabase, rede.deals, ano, mes);
  return {
    ...resumirSunne(rede.deals, ano, mes, vendedores),
    contas: funilDasContas(rede.deals, ano, mes, vendedores, canais?.viaPipefacil ?? null),
    consolidado: canais ? { ganhosPipefacilSemSunne: canais.ganhosPipefacilSemSunne, casados: canais.viaPipefacil.size, leadsPipefacilComTelefone: canais.leadsComTelefone } : null,
    lidoEm: rede.lidoEm,
  };
}

/** kWh (consumo médio) dos negócios fechados no mês, para a meta de kWh do Energy. */
export async function kwhSunneDoMes(ano: number, mes: number): Promise<number> {
  const rede = await redeSunneEmCache();
  return resumirSunne(rede.deals, ano, mes).consumoMedioFechado;
}
