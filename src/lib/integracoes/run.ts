// Sincronização do realizado dos negócios: 3C Plus (alôs/conexões) + Pipefácil (etapas e vendas).
// Roda em /api/sync-integracoes com o service role. Cada fonte falha sozinha: um erro no
// Pipefácil não impede o 3C de gravar, e vice-versa.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeBR } from "@/lib/data-br";
import { CRM_POR_NEGOCIO, INICIO_HISTORICO, INICIO_REALIZADO, TRESC_POR_NEGOCIO, type ConfigCrm } from "./config";
import { buscarLigacoesDoDia, contarAlosConexoes } from "./tresc";
import { Pipefacil, type AtividadePipefacil, type DealPipefacil } from "./pipefacil";
import { calcularFunilUnico, contarPorDia, detalharVisoes, etapaBase, rankingPreVendas, vendasGanhas, type DealCrm, type EventoCrm } from "./realizado";
import { ETAPAS_COM_LISTA } from "./leads-funil";
import { montarAuditoria } from "./auditoria";
import { identidadesDosDeals } from "./contatos";
import type { LeadEtapa } from "@/lib/funil-negocio";

export type OpcoesSync = {
  /** Dias do 3C a recalcular a partir desta data (YYYY-MM-DD); padrão: ontem e hoje. */
  desde3c?: string;
  /** Cria/atualiza as vendas a partir dos Ganhos do Pipefácil (pace e comissão). */
  criarVendas?: boolean;
  /** Só calcula e devolve, sem gravar nada no banco. */
  simular?: boolean;
  /** Lê o histórico inteiro do CRM (desde o início da conta) em vez dos últimos 3 meses. Para a carga
   *  única do histórico antigo: sem ele, lead antigo que volta a andar parece chegar pela 1ª vez numa etapa. */
  historicoCompleto?: boolean;
  /** Só estes negócios (slugs). Sem lista: todos menos os de `syncSeparado`. */
  negocios?: string[];
  /** Mesmo que `negocios` (botão "Atualizar agora" do dashboard). */
  slugs?: string[];
  /** Quem disparou, para o registro (padrão: agendamento). */
  origem?: string;
};

type Resultado = Record<string, unknown>;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function somaDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function inicioDoMes(dia: string, deslocamento = 0): string {
  const [a, m] = dia.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + deslocamento, 1));
  return d.toISOString().slice(0, 10);
}

/** Lê em páginas de 1000. A consulta PRECISA ter .order() numa coluna única: sem ordem fixa o banco
 *  repete e pula linhas entre as páginas (era a causa dos "eventos faltando" da auditoria de 16/11/2026). */
async function lerTudo<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const TEXTO = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const NUMERO = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Canal do lead; sem Canal preenchido, lead de formulário/anúncio conta como Tráfego Pago. */
export function canalDoDeal(d: Pick<DealPipefacil, "properties" | "tags" | "tracking">): string | null {
  const canal = TEXTO(d.properties?.canal_origem);
  if (canal) return canal;
  const tags = (d.tags ?? []).map((t) => t.name.toLowerCase());
  if (tags.some((t) => t.includes("tráfego pago") || t.includes("trafego pago") || t.includes("forms facebook"))) return "trafego";
  return null;
}

/** "Valor da implantação" do lead: o campo configurado ou, sem ele, a primeira propriedade com "implanta" no nome (R$ 1.234,56 também vale). */
export function valorDaImplantacao(p: Record<string, unknown>, chave?: string): number | null {
  const ler = (v: unknown): number | null => {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (typeof v !== "string" || !v.trim()) return null;
    const limpo = v.replace(/[^\d,.-]/g, "");
    const n = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
    return Number.isFinite(n) ? n : null;
  };
  if (chave) return ler(p[chave]);
  const k = Object.keys(p).find((x) => /implanta/i.test(x));
  return k ? ler(p[k]) : null;
}

function dealParaLinha(negocioId: string, d: DealPipefacil, cfg: ConfigCrm): DealCrm & Record<string, unknown> {
  const campos = cfg.campos;
  const p = d.properties ?? {};
  const produtos = Array.isArray(p.produtos) ? (p.produtos as unknown[]).map(String) : TEXTO(p.produtos) ? [String(p.produtos)] : null;
  return {
    negocio_id: negocioId,
    deal_id: d.id,
    seq: d.seq,
    pipeline_id: d.pipelineId,
    stage_id: d.stageId,
    status: d.status,
    canal: canalDoDeal(d),
    faturamento: campos.faturamento ? TEXTO(p[campos.faturamento]) : null,
    cargo: campos.cargo ? TEXTO(p[campos.cargo]) : null,
    tamanho_time: campos.tamanhoTime ? TEXTO(p[campos.tamanhoTime]) : null,
    valor: NUMERO(d.value),
    mrr: NUMERO(p[campos.mrr ?? "mrr"]),
    implantacao: valorDaImplantacao(p, campos.implantacao),
    nome: d.name,
    empresa: d.company?.name ?? TEXTO(p.nome_empresa),
    produtos,
    responsavel_user_id: d.responsibleUserId,
    closer_user_id: TEXTO(p.closer_usuario),
    sdr_user_id: TEXTO(p.sdr_usuario),
    criado_em: d.createdAt,
    fechado_em: d.closedAt,
    motivo_perda: TEXTO(d.lostReason),
    origem: campos.origem ? TEXTO(p[campos.origem]) : null,
    synced_at: new Date().toISOString(),
  };
}

function etapaDoEvento(a: AtividadePipefacil): string | null {
  if (a.type === "STAGE_CHANGED" && typeof a.changes?.to === "string") return a.changes.to;
  return a.metadata?.stageId ?? null;
}

// ---------------------------------------------------------------- 3C Plus

async function sync3c(supabase: SupabaseClient, negocioId: string, token: string, segundosConexao: number, desde: string, simular: boolean) {
  const hoje = hojeBR();
  const dias: string[] = [];
  for (let d = desde; d <= hoje; d = somaDias(d, 1)) dias.push(d);
  const porDia: { data: string; alos: number; conexoes: number }[] = [];
  for (const dia of dias) {
    const ligacoes = await buscarLigacoesDoDia(token, dia);
    porDia.push({ data: dia, ...contarAlosConexoes(ligacoes, segundosConexao) });
  }
  if (!simular) {
    const agora = new Date().toISOString();
    const linhas = porDia.flatMap((d) => [
      { negocio_id: negocioId, data: d.data, canal: "outbound", etapa: "alos", quantidade: d.alos, fonte: "3c", synced_at: agora },
      { negocio_id: negocioId, data: d.data, canal: "outbound", etapa: "conexoes", quantidade: d.conexoes, fonte: "3c", synced_at: agora },
    ]);
    for (const lote of chunk(linhas, 500)) {
      const { error } = await supabase.from("funil_realizado").upsert(lote, { onConflict: "negocio_id,data,canal,etapa" });
      if (error) throw new Error("Erro gravando 3C: " + error.message);
    }
  }
  return porDia;
}

// ---------------------------------------------------------------- Pipefácil

async function syncCrm(supabase: SupabaseClient, slug: string, negocioId: string, cfg: ConfigCrm, opts: OpcoesSync) {
  const token = process.env[cfg.tokenEnv];
  if (!token) throw new Error(`${cfg.tokenEnv} não configurado`);
  const api = new Pipefacil(token);
  const simular = !!opts.simular;

  // 1) Espelho dos leads dos funis do negócio.
  const deals: DealPipefacil[] = [];
  for (const seq of cfg.pipelines) deals.push(...(await api.dealsDoFunil(seq)));
  const inicioExecucao = new Date().toISOString();
  let nomesUsuarios: Record<string, string> = {};
  const linhasDeals = deals.map((d) => dealParaLinha(negocioId, d, cfg));
  // Identidade (códigos do telefone e do nome) para casar com a Sunne; só nos negócios que pedem.
  const identidade = cfg.identificarContato ? await identidadesDosDeals(deals, () => api.contatos()) : null;
  if (!simular) {
    // tamanho_time, motivo_perda e origem só são usados no cálculo e nas listas; crm_deals não tem essas colunas.
    const espelho = linhasDeals.map((d, i) => {
      const linha: Record<string, unknown> = { ...d };
      delete linha.tamanho_time;
      delete linha.motivo_perda;
      delete linha.origem;
      delete linha.implantacao;
      if (identidade) {
        linha.telefone_hash = identidade.lista[i].telefoneHash;
        linha.nome_tokens = identidade.lista[i].nomeTokens;
      }
      return linha;
    });
    if (identidade) {
      await supabase.from("integracao_estado").upsert({ chave: `pipefacil:${slug}:identidade`, valor: identidade.cobertura, atualizado_em: new Date().toISOString() });
    }
    for (const lote of chunk(espelho, 500)) {
      const { error } = await supabase.from("crm_deals").upsert(lote, { onConflict: "negocio_id,deal_id" });
      if (error) throw new Error("Erro gravando leads do CRM: " + error.message);
    }
    // Lead excluído ou que saiu dos funis do negócio deixa o espelho (a lista do dashboard lê daqui).
    if (linhasDeals.length > 0) {
      const { error } = await supabase.from("crm_deals").delete().eq("negocio_id", negocioId).lt("synced_at", inicioExecucao);
      if (error) throw new Error("Erro limpando leads antigos do CRM: " + error.message);
    }
    // Nome de cada usuário do Pipefácil (responsável e pré-vendas na lista de leads do dashboard).
    const membros = await api.membros();
    nomesUsuarios = Object.fromEntries(membros.map((m) => [m.userId, m.name]));
    await supabase.from("integracao_estado").upsert({
      chave: `pipefacil:${slug}:membros`,
      valor: nomesUsuarios,
      atualizado_em: new Date().toISOString(),
    });
  }

  // 2) Histórico dos últimos 3 meses, relido inteiro a cada execução (upsert por id evita duplicar).
  // Ler só o que veio depois da última leitura deixava buracos que nunca fechavam: a auditoria de
  // 16/11/2026 achou 401 de 1.654 mudanças de etapa faltando no banco. Reler tudo custa ~17 páginas
  // (~6 s) e corrige qualquer falha na execução seguinte.
  const chaveEstado = `pipefacil:${slug}:ultimo_evento`;
  const { data: estado } = await supabase.from("integracao_estado").select("valor").eq("chave", chaveEstado).maybeSingle();
  const ultimo = (estado?.valor as { em?: string } | null)?.em;
  const inicioHistorico = cfg.inicioHistorico ?? INICIO_HISTORICO;
  const tresMeses = `${inicioDoMes(hojeBR(), -3)}T00:00:00-03:00`;
  // O banco guarda tudo o que já foi lido; a carga completa (historicoCompleto) só precisa rodar uma vez.
  const desde = opts.historicoCompleto
    ? "2020-01-01T00:00:00Z"
    : Date.parse(tresMeses) > Date.parse(inicioHistorico)
      ? tresMeses
      : inicioHistorico;
  const atividades = await api.atividadesDesde(desde);
  const idsDeals = new Set(deals.map((d) => d.id));
  const novosEventos = atividades
    .filter((a) => idsDeals.has(a.dealId))
    .map((a) => ({
      id: a.id,
      negocio_id: negocioId,
      deal_id: a.dealId,
      tipo: a.type,
      pipeline_id: a.metadata?.pipelineId ?? null,
      stage_id: etapaDoEvento(a),
      ocorrido_em: a.occurredAt,
    }));
  if (!simular) {
    for (const lote of chunk(novosEventos, 500)) {
      const { error } = await supabase.from("crm_eventos").upsert(lote, { onConflict: "id" });
      if (error) throw new Error("Erro gravando histórico do CRM: " + error.message);
    }
    const maisNovo = atividades.reduce<string | null>((m, a) => (!m || a.occurredAt > m ? a.occurredAt : m), ultimo ?? null);
    if (maisNovo) {
      await supabase.from("integracao_estado").upsert({ chave: chaveEstado, valor: { em: maisNovo }, atualizado_em: new Date().toISOString() });
    }
  }

  // 3) Recalcula o realizado do mês corrente e do anterior com todo o histórico guardado.
  const eventosBanco = simular
    ? []
    : await lerTudo<EventoCrm>((de, ate) =>
        supabase.from("crm_eventos").select("deal_id, stage_id, ocorrido_em, tipo, pipeline_id").eq("negocio_id", negocioId).order("id").range(de, ate),
      );
  const vistos = new Set<string>();
  const eventos: EventoCrm[] = [];
  for (const e of [...eventosBanco, ...novosEventos]) {
    const k = `${e.deal_id}|${e.stage_id}|${e.ocorrido_em}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    eventos.push({ deal_id: e.deal_id, stage_id: e.stage_id, ocorrido_em: e.ocorrido_em, tipo: e.tipo ?? null, pipeline_id: e.pipeline_id ?? null });
  }
  const hoje = hojeBR();
  const mesAnterior = inicioDoMes(hoje, -1);
  const inicio = mesAnterior < INICIO_REALIZADO ? INICIO_REALIZADO : mesAnterior;
  const fimExcl = inicioDoMes(hoje, 1);
  // Negócio com funil próprio (Energy): as etapas do funil do CRM, sem divisão por canal.
  // Responsável de cada lead em cada evento do histórico relido (ranking, auditoria).
  const responsaveis = new Map<string, [string, string][]>();
  for (const a of [...atividades].sort((x, y) => Date.parse(x.occurredAt) - Date.parse(y.occurredAt))) {
    if (!a.metadata?.responsibleUserId) continue;
    const h = responsaveis.get(a.dealId) ?? [];
    h.push([a.occurredAt, a.metadata.responsibleUserId]);
    responsaveis.set(a.dealId, h);
  }
  // Funis por canal: a visão padrão e as visões ("Leads do mês", MQL/não MQL) saem da mesma passada.
  const visoes = cfg.funilUnico ? [] : detalharVisoes(linhasDeals, eventos, cfg, inicio, fimExcl);
  const contagens = cfg.funilUnico ? calcularFunilUnico(linhasDeals, eventos, cfg.funilUnico, inicio, fimExcl) : contarPorDia(visoes);
  if (!simular && visoes.length > 0) {
    // Lista de leads de cada número (agendadas, realizadas, propostas, vendas), por mês e visão.
    const nome = (id: string | null) => (id ? nomesUsuarios[id] ?? null : null);
    const porMes = new Map<string, Record<string, LeadEtapa[]>>();
    for (const v of visoes) {
      if (!ETAPAS_COM_LISTA.includes(etapaBase(v.etapa))) continue;
      const mes = v.data.slice(0, 7);
      const doMes = porMes.get(mes) ?? {};
      const k = `${v.canal}|${v.etapa}`;
      const responsavel = nome(v.deal.responsavel_user_id);
      const sdr = nome(v.deal.sdr_user_id);
      (doMes[k] ??= []).push({ nome: v.deal.nome || v.deal.empresa || "(sem nome)", responsavel, preVendas: sdr && sdr !== responsavel ? sdr : null, data: v.data, origem: v.deal.origem ?? null });
      porMes.set(mes, doMes);
    }
    // Ranking de pré-vendas (agendadas e realizadas, todos os leads e canais): quem era o responsável no
    // momento do agendamento, pelo histórico relido (cada evento traz o responsável daquele instante).
    const padrao = visoes.filter((v) => !v.etapa.includes(":"));
    for (let mes = inicio.slice(0, 7); mes < fimExcl.slice(0, 7); mes = inicioDoMes(`${mes}-01`, 1).slice(0, 7)) {
      const ranking = rankingPreVendas(padrao.filter((v) => v.data.startsWith(mes)), eventos, cfg, responsaveis);
      const valor = Object.fromEntries(
        Object.entries(ranking).map(([etapa, pessoas]) => [etapa, pessoas.map((p) => ({ nome: (p.pessoa && nomesUsuarios[p.pessoa]) || "Sem responsável", total: p.leads.length, leads: p.leads }))]),
      );
      await supabase.from("integracao_estado").upsert({ chave: `ranking:${slug}:${mes}`, valor, atualizado_em: new Date().toISOString() });
    }
    for (let mes = inicio.slice(0, 7); mes < fimExcl.slice(0, 7); mes = inicioDoMes(`${mes}-01`, 1).slice(0, 7)) {
      const lista = porMes.get(mes) ?? {};
      for (const l of Object.values(lista)) l.sort((a, b) => a.data.localeCompare(b.data));
      await supabase.from("integracao_estado").upsert({ chave: `leads_funil:${slug}:${mes}`, valor: lista, atualizado_em: new Date().toISOString() });
    }
  }
  if (!simular) {
    const { error: limpar } = await supabase
      .from("funil_realizado")
      .delete()
      .eq("negocio_id", negocioId)
      .eq("fonte", "pipefacil")
      .gte("data", inicio)
      .lt("data", fimExcl);
    if (limpar) throw new Error("Erro limpando realizado do CRM: " + limpar.message);
    const agora = new Date().toISOString();
    for (const lote of chunk(contagens, 500)) {
      const { error } = await supabase
        .from("funil_realizado")
        .insert(lote.map((c) => ({ negocio_id: negocioId, ...c, fonte: "pipefacil", synced_at: agora })));
      if (error) throw new Error("Erro gravando realizado do CRM: " + error.message);
    }
  }

  // 4) Vendas a partir dos Ganhos (negócio com recebidoPeloCrm lê o Ganho direto do espelho: sem vendas).
  const inicioVendas = cfg.inicioVendas ?? INICIO_REALIZADO;
  // Dono da venda: o responsável no momento do último Ganho do funil de vendas (o histórico relido
  // a cada execução cobre os últimos 3 meses; antes disso vale o responsável atual).
  const responsavelNoGanho = new Map<string, string>();
  for (const a of [...atividades].sort((x, y) => Date.parse(x.occurredAt) - Date.parse(y.occurredAt))) {
    const etapa = etapaDoEvento(a);
    if (a.metadata?.responsibleUserId && etapa && cfg.stagesGanhoVenda.includes(etapa)) responsavelNoGanho.set(a.dealId, a.metadata.responsibleUserId);
  }
  const ganhas = cfg.recebidoPeloCrm ? [] : vendasGanhas(linhasDeals, eventos, cfg, responsavelNoGanho).filter((g) => g.data >= inicioVendas);

  // 5) Base da Auditoria comercial (Dados → Auditoria): leads que chegaram a Reunião Agendada, com campos,
  // marcos (mesma regra do Dashboard), situação da reunião e linha do tempo.
  if (!simular && !cfg.funilUnico) {
    const etapas = new Map<string, { nome: string; funil: string }>();
    for (const f of await api.funis()) for (const st of f.stages ?? []) etapas.set(st.id, { nome: st.name, funil: f.name });
    const leads = montarAuditoria({
      deals: linhasDeals,
      extras: new Map(deals.map((d) => [d.id, d])),
      eventos,
      cfg,
      etapas,
      responsaveis,
      vendedores: responsavelNoGanho,
      nomes: nomesUsuarios,
    });
    await supabase.from("integracao_estado").upsert({
      chave: `auditoria:${slug}`,
      valor: { atualizado_em: new Date().toISOString(), leads },
      atualizado_em: new Date().toISOString(),
    });
  }
  let vendas: Resultado = { ganhas: ganhas.length, criadas: 0, atualizadas: 0, removidas: 0, semVinculo: [] as string[] };
  if (opts.criarVendas && !simular) vendas = await sincronizarVendas(supabase, api, negocioId, ganhas, cfg.emailsAlternativos, slug);

  const semCanal = linhasDeals.filter((d) => !d.canal).length;
  return {
    leads: deals.length,
    semCanal,
    eventosNovos: novosEventos.length,
    historicoDesde: desde,
    realizado: contagens,
    vendas: { ...vendas, lista: ganhas },
  };
}

async function sincronizarVendas(
  supabase: SupabaseClient,
  api: Pipefacil,
  negocioId: string,
  ganhas: ReturnType<typeof vendasGanhas>,
  emailsAlternativos: Record<string, string> = {},
  slug?: string,
) {
  // Vínculo Pipefácil → portal pelo e-mail de login.
  const membros = await api.membros();
  const emailPorUsuario = new Map(membros.filter((m) => m.email).map((m) => [m.userId, m.email!.toLowerCase()]));
  const perfilPorEmail = new Map<string, string>();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Erro lendo usuários: " + error.message);
    for (const u of data.users) if (u.email) perfilPorEmail.set(u.email.toLowerCase(), u.id);
    if (data.users.length < 1000) break;
  }
  const perfil = (userId: string | null) => {
    const email = userId ? emailPorUsuario.get(userId) : undefined;
    if (!email) return null;
    const alternativo = emailsAlternativos[email]?.toLowerCase();
    return perfilPorEmail.get(email) ?? (alternativo ? perfilPorEmail.get(alternativo) ?? null : null);
  };
  // Usuário do Pipefácil → perfil do portal (pelo e-mail), para as telas que procuram a pessoa no CRM
  // (visão do SDR: pace, no-show e RQA). Sem isso, elas casam pelo nome.
  if (slug) {
    const perfis = Object.fromEntries(membros.map((m) => [m.userId, perfil(m.userId)] as const).filter(([, p]) => !!p));
    await supabase.from("integracao_estado").upsert({ chave: `pipefacil:${slug}:perfis`, valor: perfis, atualizado_em: new Date().toISOString() });
  }

  const { data: existentes, error: erroExist } = await supabase
    .from("vendas")
    .select("id, crm_deal_id")
    .eq("negocio_id", negocioId)
    .not("crm_deal_id", "is", null);
  if (erroExist) throw new Error("Erro lendo vendas do CRM: " + erroExist.message);
  const idPorDeal = new Map((existentes ?? []).map((v) => [v.crm_deal_id as string, v.id as string]));

  let criadas = 0;
  let atualizadas = 0;
  const semVinculo: string[] = [];
  const manter = new Set<string>();
  for (const g of ganhas) {
    // Vendedor sem login no portal (e-mail do Pipefácil sem conta): a venda entra sem dono (conta no
    // recebido do negócio, sem comissão de closer) e fica listada em semVinculo.
    const closer = perfil(g.closer_user_id);
    if (!closer) semVinculo.push(g.cliente ?? g.deal_id);
    const sdr = perfil(g.sdr_user_id);
    const campos = {
      negocio_id: negocioId,
      profile_id: closer,
      indicador_id: sdr && sdr !== closer ? sdr : null,
      papel: "closer",
      tipo: "individual",
      origem: "pipefacil",
      canal: g.canal,
      ...(g.canal_origem ? { canal_origem: g.canal_origem } : {}),
      valor: g.valor,
      valor_antecipado: g.valor,
      mrr: g.mrr,
      primeiro_contrato: true, // funis de entrada só trabalham primeira venda (monetização é outro funil)
      data: g.data,
      cliente: g.cliente,
      produto: g.produto,
      lancamento_manual: false,
      crm_deal_id: g.deal_id,
      synced_at: new Date().toISOString(),
    };
    manter.add(g.deal_id);
    const id = idPorDeal.get(g.deal_id);
    // Valor da implantação (migration 0116): só vai quando preenchido; sem a coluna, grava a venda sem ele.
    const semColunaImplantacao = (e: { code?: string } | null) => e?.code === "42703" || e?.code === "PGRST204";
    const comImplantacao = g.implantacao != null ? { ...campos, valor_implantacao: g.implantacao } : campos;
    // Sem a migration 0113 (vendas.profile_id opcional), venda sem dono é recusada pelo banco: fica de fora.
    // Sem a migration 0115 (canal "alternativo" e canal_origem), a venda de canal alternativo é recusada.
    const semDonoRecusada = (e: { code?: string } | null) =>
      (!closer && e?.code === "23502") || (g.canal === "alternativo" && (e?.code === "23514" || e?.code === "42703" || e?.code === "PGRST204"));
    if (id) {
      let { error } = await supabase.from("vendas").update(comImplantacao).eq("id", id);
      if (error && comImplantacao !== campos && semColunaImplantacao(error)) ({ error } = await supabase.from("vendas").update(campos).eq("id", id));
      if (semDonoRecusada(error)) continue;
      if (error) throw new Error("Erro atualizando venda do CRM: " + error.message);
      atualizadas += 1;
    } else {
      let { error } = await supabase.from("vendas").insert(comImplantacao);
      if (error && comImplantacao !== campos && semColunaImplantacao(error)) ({ error } = await supabase.from("vendas").insert(campos));
      if (semDonoRecusada(error)) {
        manter.delete(g.deal_id);
        continue;
      }
      if (error) throw new Error("Erro criando venda do CRM: " + error.message);
      criadas += 1;
    }
  }
  // Ganho desfeito no CRM: a venda sai do portal.
  const remover = Array.from(idPorDeal.entries())
    .filter(([deal]) => !manter.has(deal))
    .map(([, id]) => id);
  if (remover.length > 0) {
    const { error } = await supabase.from("vendas").delete().in("id", remover);
    if (error) throw new Error("Erro removendo venda do CRM: " + error.message);
  }
  return { ganhas: ganhas.length, criadas, atualizadas, removidas: remover.length, semVinculo };
}

// ---------------------------------------------------------------- orquestração

export async function runSyncIntegracoes(opts: OpcoesSync = {}): Promise<Resultado> {
  const supabase = createAdminClient();
  const hoje = hojeBR();
  // Sem lista, roda todos menos os de sincronização separada (chamados com ?negocio=slug).
  const lista = opts.negocios ?? opts.slugs;
  const slugs = Array.from(new Set([...Object.keys(TRESC_POR_NEGOCIO), ...Object.keys(CRM_POR_NEGOCIO)])).filter((s) =>
    lista ? lista.includes(s) : !CRM_POR_NEGOCIO[s]?.syncSeparado,
  );
  const { data: negocios } = await supabase.from("negocios").select("id, slug").in("slug", slugs);
  const resultado: Resultado = {};
  const erros: string[] = [];

  // Negócios em paralelo (contas separadas), para caber no tempo da função.
  await Promise.all(
    (negocios ?? []).map(async (n) => {
      const r: Resultado = {};
      const c3 = TRESC_POR_NEGOCIO[n.slug];
      if (c3) {
        const token = process.env[c3.tokenEnv];
        try {
          if (!token) throw new Error(`${c3.tokenEnv} não configurado`);
          r.tresc = await sync3c(supabase, n.id, token, c3.segundosConexao, opts.desde3c ?? somaDias(hoje, -1), !!opts.simular);
        } catch (e) {
          const msg = `${n.slug}/3c: ${e instanceof Error ? e.message : String(e)}`;
          erros.push(msg);
          r.tresc = { erro: msg };
        }
      }
      const crm = CRM_POR_NEGOCIO[n.slug];
      if (crm) {
        try {
          r.crm = await syncCrm(supabase, n.slug, n.id, crm, opts);
        } catch (e) {
          const msg = `${n.slug}/pipefacil: ${e instanceof Error ? e.message : String(e)}`;
          erros.push(msg);
          r.crm = { erro: msg };
        }
      }
      resultado[n.slug] = r;
    }),
  );

  if (!opts.simular) {
    await supabase.from("sync_log").insert({
      fonte: "integracoes:3c+pipefacil",
      status: erros.length ? "erro" : "ok",
      detalhe: [opts.origem, ...erros].filter(Boolean).join(" | ") || null,
    });
  }
  return { ok: erros.length === 0, erros, ...resultado };
}
