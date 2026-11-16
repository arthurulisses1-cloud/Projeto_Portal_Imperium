// Sincronização do realizado dos negócios: 3C Plus (alôs/conexões) + Pipefácil (etapas e vendas).
// Roda em /api/sync-integracoes com o service role. Cada fonte falha sozinha: um erro no
// Pipefácil não impede o 3C de gravar, e vice-versa.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeBR } from "@/lib/data-br";
import { CRM_POR_NEGOCIO, INICIO_HISTORICO, INICIO_REALIZADO, TRESC_POR_NEGOCIO, type ConfigCrm } from "./config";
import { buscarLigacoesDoDia, contarAlosConexoes } from "./tresc";
import { Pipefacil, type AtividadePipefacil, type DealPipefacil } from "./pipefacil";
import { calcularRealizadoCrm, vendasGanhas, type DealCrm, type EventoCrm } from "./realizado";

export type OpcoesSync = {
  /** Dias do 3C a recalcular a partir desta data (YYYY-MM-DD); padrão: ontem e hoje. */
  desde3c?: string;
  /** Cria/atualiza as vendas a partir dos Ganhos do Pipefácil (pace e comissão). */
  criarVendas?: boolean;
  /** Só calcula e devolve, sem gravar nada no banco. */
  simular?: boolean;
  /** Só estes negócios (slugs). Sem lista: todos menos os de `syncSeparado`. */
  negocios?: string[];
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

/**
 * Canal do lead pelo campo de canal do negócio (padrão canal_origem). Sem ele, lead de
 * formulário/anúncio conta como Tráfego Pago; o resto cai no `canalSemValor` da config (ou fica sem canal).
 */
export function canalDoDeal(d: Pick<DealPipefacil, "properties" | "tags" | "tracking">, cfg: Pick<ConfigCrm, "campoCanal" | "canalSemValor"> = {}): string | null {
  const canal = TEXTO(d.properties?.[cfg.campoCanal ?? "canal_origem"]);
  if (canal) return canal;
  const tags = (d.tags ?? []).map((t) => t.name.toLowerCase());
  if (tags.some((t) => t.includes("tráfego pago") || t.includes("trafego pago") || t.includes("forms facebook"))) return "trafego";
  return cfg.canalSemValor ?? null;
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
    canal: canalDoDeal(d, cfg),
    faturamento: campos.faturamento ? TEXTO(p[campos.faturamento]) : null,
    cargo: campos.cargo ? TEXTO(p[campos.cargo]) : null,
    tamanho_time: campos.tamanhoTime ? TEXTO(p[campos.tamanhoTime]) : null,
    valor: NUMERO(d.value),
    mrr: NUMERO(p.mrr),
    nome: d.name,
    empresa: d.company?.name ?? TEXTO(p.nome_empresa),
    produtos,
    responsavel_user_id: d.responsibleUserId,
    closer_user_id: TEXTO(p.closer_usuario),
    sdr_user_id: TEXTO(p.sdr_usuario),
    criado_em: d.createdAt,
    fechado_em: d.closedAt,
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
  const linhasDeals = deals.map((d) => dealParaLinha(negocioId, d, cfg));
  if (!simular) {
    // tamanho_time só é usado no cálculo do MQL; crm_deals não tem essa coluna.
    const espelho = linhasDeals.map((d) => {
      const linha: Record<string, unknown> = { ...d };
      delete linha.tamanho_time;
      return linha;
    });
    for (const lote of chunk(espelho, 500)) {
      const { error } = await supabase.from("crm_deals").upsert(lote, { onConflict: "negocio_id,deal_id" });
      if (error) throw new Error("Erro gravando leads do CRM: " + error.message);
    }
  }

  // 2) Histórico novo desde a última leitura (com 10 min de folga; upsert por id evita duplicar).
  const chaveEstado = `pipefacil:${slug}:ultimo_evento`;
  const { data: estado } = await supabase.from("integracao_estado").select("valor").eq("chave", chaveEstado).maybeSingle();
  const ultimo = (estado?.valor as { em?: string } | null)?.em;
  const desde = ultimo ? new Date(Date.parse(ultimo) - 10 * 60 * 1000).toISOString() : cfg.inicioHistorico ?? INICIO_HISTORICO;
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
        supabase.from("crm_eventos").select("deal_id, stage_id, ocorrido_em").eq("negocio_id", negocioId).range(de, ate),
      );
  const vistos = new Set<string>();
  const eventos: EventoCrm[] = [];
  for (const e of [...eventosBanco, ...novosEventos]) {
    const k = `${e.deal_id}|${e.stage_id}|${e.ocorrido_em}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    eventos.push({ deal_id: e.deal_id, stage_id: e.stage_id, ocorrido_em: e.ocorrido_em });
  }
  const hoje = hojeBR();
  const mesAnterior = inicioDoMes(hoje, -1);
  const inicio = mesAnterior < INICIO_REALIZADO ? INICIO_REALIZADO : mesAnterior;
  const fimExcl = inicioDoMes(hoje, 1);
  const contagens = calcularRealizadoCrm(linhasDeals, eventos, cfg, inicio, fimExcl);
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

  // 4) Vendas a partir dos Ganhos (o negócio pode desligar: aí o Ganho só conta no funil).
  const inicioVendas = cfg.inicioVendas ?? INICIO_REALIZADO;
  const criaVendas = cfg.criarVendas !== false;
  const ganhas = criaVendas ? vendasGanhas(linhasDeals, eventos, cfg).filter((g) => g.data >= inicioVendas) : [];
  let vendas: Resultado = { ganhas: ganhas.length, criadas: 0, atualizadas: 0, removidas: 0, semVinculo: [] as string[] };
  if (criaVendas && opts.criarVendas && !simular) vendas = await sincronizarVendas(supabase, api, negocioId, ganhas);

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

async function sincronizarVendas(supabase: SupabaseClient, api: Pipefacil, negocioId: string, ganhas: ReturnType<typeof vendasGanhas>) {
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
    return email ? perfilPorEmail.get(email) ?? null : null;
  };

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
    const closer = perfil(g.closer_user_id);
    if (!closer) {
      semVinculo.push(g.cliente ?? g.deal_id);
      continue;
    }
    const sdr = perfil(g.sdr_user_id);
    const campos = {
      negocio_id: negocioId,
      profile_id: closer,
      indicador_id: sdr && sdr !== closer ? sdr : null,
      papel: "closer",
      tipo: "individual",
      origem: "pipefacil",
      canal: g.canal,
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
    if (id) {
      const { error } = await supabase.from("vendas").update(campos).eq("id", id);
      if (error) throw new Error("Erro atualizando venda do CRM: " + error.message);
      atualizadas += 1;
    } else {
      const { error } = await supabase.from("vendas").insert(campos);
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
  const slugs = Array.from(new Set([...Object.keys(TRESC_POR_NEGOCIO), ...Object.keys(CRM_POR_NEGOCIO)])).filter((s) =>
    opts.negocios ? opts.negocios.includes(s) : !CRM_POR_NEGOCIO[s]?.syncSeparado,
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
      detalhe: erros.length ? erros.join(" | ") : null,
    });
  }
  return { ok: erros.length === 0, erros, ...resultado };
}
