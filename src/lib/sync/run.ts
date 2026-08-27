import { createAdminClient } from "@/lib/supabase/admin";
import { buscarProducaoDados } from "./dados";
import { buscarAssinado } from "./assinado";
import { buscarEntrevistas } from "./entrevistas";
import { buscarEntrevistasLeads } from "./entrevistas-leads";
import { buscarOperacoes } from "./weekly";
import { normalizarNome } from "./parse";
import { csvUrl, SHEET_GIDS } from "./config";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type FunilRow = {
  profile_id: string;
  data: string;
  etapa: string;
  realizado: number;
  papel: string;
  meta: number;
  synced_at: string;
};

// Com apelidos em Gestão de Pessoas, duas grafias diferentes da planilha
// (ex.: nome certo + variação/erro de digitação cadastrada como alias) podem
// resolver pro mesmo profile_id no mesmo dia/etapa/papel — gerando duas
// linhas com a MESMA chave de conflito na mesma leva do upsert, o que o
// Postgres rejeita ("ON CONFLICT DO UPDATE command cannot affect row a
// second time"). Mescla somando `realizado` antes de gravar.
function mesclarFunil(linhas: FunilRow[]): FunilRow[] {
  const porChave = new Map<string, FunilRow>();
  for (const l of linhas) {
    const chave = `${l.profile_id}|${l.data}|${l.etapa}|${l.papel}`;
    const existente = porChave.get(chave);
    if (existente) existente.realizado += l.realizado;
    else porChave.set(chave, { ...l });
  }
  return Array.from(porChave.values());
}

export type SyncResultado = {
  funilLinhasGravadas: number;
  vendasInseridas: number;
  naoEncontrados: string[];
};

export async function runSync(): Promise<SyncResultado> {
  const supabase = createAdminClient();
  try {
    return await executarSync(supabase);
  } catch (e) {
    // Sem isso, um sync que quebra no meio do caminho não deixa nenhum
    // rastro em sync_log — só dá pra saber o motivo raspando o log do
    // servidor. Grava o erro e relança pra quem chamou ver o mesmo erro de sempre.
    const mensagem = e instanceof Error ? e.message : String(e);
    await supabase.from("sync_log").insert({
      fonte: "google_sheets:dados+assinado+entrevistas",
      status: "erro",
      detalhe: mensagem,
    });
    throw e;
  }
}

async function executarSync(supabase: ReturnType<typeof createAdminClient>): Promise<SyncResultado> {
  const unmatched = new Set<string>();
  let vendasInseridas = 0;
  let funilLinhasGravadas = 0;

  // ---------- mapa nome normalizado -> profile_id ----------
  // nomes_planilha (setado manualmente em Gestão de Pessoas) tem prioridade
  // sobre full_name, pra cobrir grafias da planilha que divergem do cadastro.
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, nomes_planilha");
  const nomeParaId = new Map<string, string>();
  for (const p of profiles ?? []) {
    nomeParaId.set(normalizarNome(p.full_name), p.id);
  }
  for (const p of profiles ?? []) {
    for (const alias of p.nomes_planilha ?? []) {
      if (alias) nomeParaId.set(normalizarNome(alias), p.id);
    }
  }

  // ---------- aba Dados: funil (tentativas/alôs/conexões) ----------
  const dados = await buscarProducaoDados();
  const funilRowsDados = dados.linhas
    .map((l) => {
      const profileId = nomeParaId.get(l.nomeNormalizado);
      if (!profileId) {
        unmatched.add(l.nomeNormalizado);
        return null;
      }
      return {
        profile_id: profileId,
        data: l.data,
        etapa: l.etapa,
        realizado: l.realizado,
        papel: l.papel,
        meta: 0,
        synced_at: new Date().toISOString(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const funilRowsDadosMesclado = mesclarFunil(funilRowsDados);

  // Mesmo raciocínio do bloco Entrevistas logo abaixo: a aba Dados sempre
  // vem com o histórico completo (uma coluna por dia, sem paginação), então
  // apaga tudo dessas 3 etapas antes de regravar — upsert sozinho deixava
  // lixo quando uma célula da planilha era corrigida/zerada depois do sync.
  const { error: limpezaDadosError } = await supabase
    .from("producao_funil")
    .delete()
    .in("etapa", ["tentativas", "alos", "conexoes"]);
  if (limpezaDadosError) throw new Error("Erro limpando funil antigo (Dados): " + limpezaDadosError.message);

  for (const batch of chunk(funilRowsDadosMesclado, 1000)) {
    const { error } = await supabase.from("producao_funil").insert(batch);
    if (error) throw new Error("Erro gravando funil (Dados): " + error.message);
    funilLinhasGravadas += batch.length;
  }

  // ---------- aba Entrevistas: funil (entrevistas, SDR + Closer) ----------
  // Uma leitura só, reaproveitada aqui e em buscarEntrevistasLeads() logo
  // abaixo — mesmo cuidado de corrida real com a planilha viva já resolvido
  // pra Assinado/weekly_operacoes (achado 2026-08-24).
  const resEntrevistas = await fetch(csvUrl(SHEET_GIDS.entrevistas), { cache: "no-store" });
  if (!resEntrevistas.ok) throw new Error(`Falha ao buscar aba Entrevistas: ${resEntrevistas.status}`);
  const entrevistasText = await resEntrevistas.text();

  const entrevistas = await buscarEntrevistas(entrevistasText);
  const funilRowsEntrevistas = entrevistas.linhas
    .map((l) => {
      const profileId = nomeParaId.get(l.nomeNormalizado);
      if (!profileId) {
        unmatched.add(l.nomeNormalizado);
        return null;
      }
      return {
        profile_id: profileId,
        data: l.data,
        etapa: l.etapa,
        realizado: l.realizado,
        papel: l.papel,
        meta: 0,
        synced_at: new Date().toISOString(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const funilRowsEntrevistasMesclado = mesclarFunil(funilRowsEntrevistas);

  // Apaga tudo de etapa='entrevistas' antes de regravar — a aba Entrevistas
  // sempre vem com o histórico completo, então o snapshot de agora é a
  // fonte da verdade inteira. Só upsert (sem delete) deixava lixo pra
  // sempre quando a planilha corrigia um SDR/Closer trocado: a linha errada
  // antiga (papel diferente da nova) nunca sumia, e cada entrevista
  // corrigida ficava contando 2x pro resto da vida (achado numa auditoria
  // 2026-08-21: total de papel='sdr' do mês tava quase o dobro do de
  // papel='closer', que deveriam ser sempre iguais 1:1 — cada entrevista
  // gera exatamente 1 crédito de SDR + 1 de Closer, ou 1 de "ambos").
  const { error: limpezaError } = await supabase.from("producao_funil").delete().eq("etapa", "entrevistas");
  if (limpezaError) throw new Error("Erro limpando funil antigo (Entrevistas): " + limpezaError.message);

  for (const batch of chunk(funilRowsEntrevistasMesclado, 1000)) {
    const { error } = await supabase.from("producao_funil").insert(batch);
    if (error) throw new Error("Erro gravando funil (Entrevistas): " + error.message);
    funilLinhasGravadas += batch.length;
  }

  // ---------- aba Entrevistas: pares SDR+Closer (pra checar "mesma Tribo") ----------
  // Nomes sem match viram null (não some a entrevista, só perde o lado sem
  // match) — diferente do bloco de crédito acima, aqui não tem como "unmatched"
  // pular a linha inteira, senão perderíamos o outro lado do par.
  const eventosEntrevistas = entrevistas.pares.map((p) => {
    if (p.sdrNorm && !nomeParaId.has(p.sdrNorm)) unmatched.add(p.sdrNorm);
    if (p.closerNorm && !nomeParaId.has(p.closerNorm)) unmatched.add(p.closerNorm);
    return {
      data: p.data,
      sdr_profile_id: p.sdrNorm ? nomeParaId.get(p.sdrNorm) ?? null : null,
      closer_profile_id: p.closerNorm ? nomeParaId.get(p.closerNorm) ?? null : null,
      quantidade: p.quantidade,
      synced_at: new Date().toISOString(),
    };
  });

  // Mesmo raciocínio do bloco de crédito: a aba Entrevistas sempre vem com o
  // histórico completo, então apaga tudo antes de regravar.
  const { error: limpezaEventosError } = await supabase.from("entrevistas_eventos").delete().not("id", "is", null);
  if (limpezaEventosError) throw new Error("Erro limpando entrevistas_eventos: " + limpezaEventosError.message);

  for (const batch of chunk(eventosEntrevistas, 1000)) {
    const { error } = await supabase.from("entrevistas_eventos").insert(batch);
    if (error) throw new Error("Erro gravando entrevistas_eventos: " + error.message);
  }

  // ---------- aba Entrevistas (de novo, com o lead de cada linha): Fase 2 ----------
  // Upsert por chave_natural (não apaga+recria) pra preservar
  // status_followup/observacao que o Closer preenche em /leads — mesmo
  // cuidado que weekly_operacoes já tem com status_manual/observacao.
  //
  // "Meus Leads" é um mini-CRM de fluxo de trabalho, não um histórico —
  // pedido do Diretor (2026-08-27): só o mês corrente pra frente, mês
  // passado descarta. Filtra ANTES de gravar (nem entra) e limpa o que
  // já tiver de mês anterior a cada sync (a janela "mês corrente" anda
  // conforme o calendário — sem essa limpeza, lead de julho ficaria
  // preso pra sempre assim que agosto virasse).
  const inicioMesLeads = new Date().toISOString().slice(0, 7) + "-01";
  const entrevistasLeads = (await buscarEntrevistasLeads(entrevistasText)).filter((l) => l.data >= inicioMesLeads);

  const { error: limpezaLeadsError } = await supabase.from("entrevistas_leads").delete().lt("data", inicioMesLeads);
  if (limpezaLeadsError) throw new Error("Erro limpando entrevistas_leads de meses anteriores: " + limpezaLeadsError.message);

  const leadRows = entrevistasLeads.map((l) => ({
    chave_natural: l.chaveNatural,
    data: l.data,
    lead_nome: l.leadNome,
    lead_telefone: l.leadTelefone,
    id_msp: l.idMsp,
    sdr_profile_id: l.sdrNormalizado ? nomeParaId.get(l.sdrNormalizado) ?? null : null,
    closer_profile_id: l.closerNormalizado ? nomeParaId.get(l.closerNormalizado) ?? null : null,
    canal: l.canal,
    origem: l.origem,
    entrevistado: l.entrevistado,
    estado_civil: l.estadoCivil,
    decisor: l.decisor,
    dores: l.dores,
    documentacao_ciente: l.documentacaoCiente,
    valores_apresentados: l.valoresApresentados,
    synced_at: new Date().toISOString(),
  }));
  for (const batch of chunk(leadRows, 1000)) {
    const { error } = await supabase.from("entrevistas_leads").upsert(batch, { onConflict: "chave_natural" });
    if (error) throw new Error("Erro gravando entrevistas_leads: " + error.message);
  }

  // ---------- aba Assinado: funil (assinaturas/pagos) + vendas ----------
  // Uma leitura SÓ da aba, reaproveitada aqui e em buscarOperacoes() logo
  // abaixo — ver comentário em weekly.ts sobre a corrida entre duas
  // requisições separadas pra mesma planilha viva (achado 2026-08-24).
  const resAssinado = await fetch(csvUrl(SHEET_GIDS.assinado), { cache: "no-store" });
  if (!resAssinado.ok) throw new Error(`Falha ao buscar aba Assinado: ${resAssinado.status}`);
  const assinadoText = await resAssinado.text();

  const assinado = await buscarAssinado(assinadoText);

  const funilRowsAssinado = assinado.funil
    .map((l) => {
      const profileId = nomeParaId.get(l.nomeNormalizado);
      if (!profileId) {
        unmatched.add(l.nomeNormalizado);
        return null;
      }
      return {
        profile_id: profileId,
        data: l.data,
        etapa: l.etapa,
        realizado: l.realizado,
        papel: l.papel,
        meta: 0,
        synced_at: new Date().toISOString(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const funilRowsAssinadoMesclado = mesclarFunil(funilRowsAssinado);

  // Mesmo bug do bloco Entrevistas (achado numa auditoria 2026-08-22 sobre
  // assinaturas do Rafael Saboya: 19 "como SDR" no ranking, mas 17 dessas
  // eram lixo de uma correção de SDR/Closer trocado na planilha que nunca
  // foi apagado — só upsert nunca limpa a linha com o papel ANTIGO). Apaga
  // o intervalo de datas coberto pela aba antes de regravar, mesmo padrão
  // já usado abaixo pra `vendas`.
  if (assinado.menorData && assinado.maiorData) {
    const { error: limpezaAssinadoError } = await supabase
      .from("producao_funil")
      .delete()
      .in("etapa", ["assinaturas", "pagos"])
      .gte("data", assinado.menorData)
      .lte("data", assinado.maiorData);
    if (limpezaAssinadoError) throw new Error("Erro limpando funil antigo (Assinado): " + limpezaAssinadoError.message);
  }

  for (const batch of chunk(funilRowsAssinadoMesclado, 1000)) {
    const { error } = await supabase.from("producao_funil").insert(batch);
    if (error) throw new Error("Erro gravando funil (Assinado): " + error.message);
    funilLinhasGravadas += batch.length;
  }

  // ---------- Aba Assinado (de novo, sem filtro): espelho pra Weekly/Forecast ----------
  // Roda ANTES de gravar vendas de propósito: vendaRows usa a mesma
  // chaveNatural (ver assinado.ts) pra achar o id da operação equivalente
  // aqui e gravar o vínculo direto (vendas.weekly_operacao_id), em vez de
  // ficar casando por data+valor+cliente na hora de exibir (frágil — nome de
  // cliente com acentuação/espaço diferente já quebrava esse match).
  // Upsert por chave_natural (não apaga+recria) pra preservar status_manual/
  // observacao que o closer/líder preenche no Forecast — ver migration 0024.
  const operacoes = await buscarOperacoes(assinadoText);

  // ---------- Meus Leads: fecha o loop com a aba Assinado ----------
  // "Colocou em assinado na planilha, já manda o card pra assinado aqui" —
  // e "quem foi assinado mas tá pago, manda pro pago" (pedido do Diretor,
  // 2026-08-27) — um fato objetivo que vem de fora (alguém assinou/pagou)
  // sobrepõe o que o Closer tinha deixado manualmente em status_followup, e
  // já entra qualificado (temperatura quente + valor do crédito), sem
  // exigir que o Closer preencha de novo o que a planilha já sabe. Casa por
  // SDR+Closer+nome do cliente normalizado — não dá pra usar chaveNatural de
  // weekly_operacoes (inclui data/valor: a data da entrevista e a da
  // assinatura são diferentes por natureza). Quando há mais de uma operação
  // pro mesmo par, fica com a de data mais recente.
  const assinadoPorPessoaCliente = new Map<string, { valor: number; data: string; pago: boolean }>();
  for (const l of operacoes.linhas) {
    if (!l.cliente) continue;
    const chave = `${l.sdrNormalizado ?? ""}|${l.closerNormalizado ?? ""}|${normalizarNome(l.cliente)}`;
    const existente = assinadoPorPessoaCliente.get(chave);
    if (!existente || l.data >= existente.data) {
      assinadoPorPessoaCliente.set(chave, { valor: l.valor, data: l.data, pago: l.status === "PAGO" });
    }
  }
  const leadsParaAssinar = entrevistasLeads
    .map((l) => {
      const chave = `${l.sdrNormalizado ?? ""}|${l.closerNormalizado ?? ""}|${normalizarNome(l.leadNome)}`;
      const match = assinadoPorPessoaCliente.get(chave);
      return match ? { chaveNatural: l.chaveNatural, valor: match.valor, statusAlvo: match.pago ? "pago" : "assinado" } : null;
    })
    .filter((x): x is { chaveNatural: string; valor: number; statusAlvo: string } => x !== null);
  for (const grupo of chunk(leadsParaAssinar, 20)) {
    await Promise.all(
      grupo.map((l) =>
        supabase
          .from("entrevistas_leads")
          .update({ status_followup: l.statusAlvo, temperatura: "quente", valor_credito: l.valor })
          .eq("chave_natural", l.chaveNatural)
          .neq("status_followup", "perdido")
      )
    );
  }

  // weekly_operacoes.data é a data de ASSINATURA, não de pagamento —
  // pago_em guarda a data real de pagamento. Fonte primária: a coluna
  // "DIA DO PAGAMENTO" da própria planilha (achado 2026-08-24 — ela
  // sempre existiu, a sync só nunca lia; até aqui pago_em vinha só de
  // "quando a sync PRIMEIRO percebeu que o status virou PAGO", uma
  // aproximação que atrasava o crédito pro dia em que o sync rodasse, não
  // o dia real do pagamento — por isso "pagos de sexta" só apareciam se a
  // sync tivesse rodado na própria sexta). Se a célula vier vazia (planilha
  // sem essa informação ainda pra aquela linha), cai pro heurístico antigo
  // como fallback: mantém o pago_em já gravado, ou usa hoje se acabou de
  // virar PAGO nesta sync — melhor que nada até a planilha preencher.
  // Lê a tabela INTEIRA (paginada), não por intervalo de data — tentamos
  // filtrar por `data` antes (achado 2026-08-24: `.in()` com ~1000 chaves de
  // nomes longos virava URL grande demais pro PostgREST), mas o intervalo
  // de data usa o menor/maior DATA da leitura ATUAL da planilha, e uma linha
  // órfã cuja data antiga tenha ficado fora desse intervalo (ex.: era a
  // data mais recente da planilha e virou a única com aquela data depois de
  // alguém editar a data de assinatura) escapava da varredura de órfãs
  // (achado 2026-08-26 — Luiz Manoel Gomes Junior duplicado no Forecast:
  // a linha antiga tinha `data` fora do range calculado pela leitura nova).
  // A tabela é pequena (algumas centenas de linhas), então ler tudo é barato
  // e elimina esse ponto cego de vez.
  const statusAnteriorPorChave = new Map<string, { status: string; pago_em: string | null }>();
  const idPorChaveAnterior = new Map<string, string>();
  {
    let from = 0;
    const pageSize = 1000;
    for (;;) {
      const { data: existentes, error: existentesError } = await supabase
        .from("weekly_operacoes")
        .select("id, chave_natural, status, pago_em")
        .range(from, from + pageSize - 1);
      if (existentesError) throw new Error("Erro lendo status anterior de weekly_operacoes: " + existentesError.message);
      for (const e of existentes ?? []) {
        statusAnteriorPorChave.set(e.chave_natural, { status: e.status, pago_em: e.pago_em });
        idPorChaveAnterior.set(e.chave_natural, e.id);
      }
      if (!existentes || existentes.length < pageSize) break;
      from += pageSize;
    }
  }
  const hojeStr = new Date().toISOString().slice(0, 10);

  const weeklyRows = operacoes.linhas.map((l) => {
    const anterior = statusAnteriorPorChave.get(l.chaveNatural);
    let pagoEm: string | null;
    if (l.status !== "PAGO") {
      pagoEm = null;
    } else if (l.pagoEmPlanilha) {
      pagoEm = l.pagoEmPlanilha;
    } else if (anterior?.pago_em) {
      pagoEm = anterior.pago_em;
    } else {
      pagoEm = hojeStr;
    }

    return {
      chave_natural: l.chaveNatural,
      data: l.data,
      sdr_profile_id: l.sdrNormalizado ? nomeParaId.get(l.sdrNormalizado) ?? null : null,
      closer_profile_id: l.closerNormalizado ? nomeParaId.get(l.closerNormalizado) ?? null : null,
      cliente: l.cliente,
      valor: l.valor,
      faturamento: l.faturamento,
      produto: l.produto,
      origem: l.origem,
      status: l.status,
      pago_em: pagoEm,
      synced_at: new Date().toISOString(),
    };
  });
  for (const batch of chunk(weeklyRows, 1000)) {
    const { error } = await supabase
      .from("weekly_operacoes")
      .upsert(batch, { onConflict: "chave_natural" });
    if (error) throw new Error("Erro gravando weekly_operacoes: " + error.message);
  }

  // Limpa linhas órfãs: `chave_natural` inclui a data de assinatura, então
  // editar essa data na planilha (ou apagar a linha) faz o upsert acima
  // CRIAR uma chave nova em vez de atualizar a antiga — a linha velha nunca
  // era removida, ficava fantasma em weekly_operacoes e duplicava o lead no
  // Forecast (achado 2026-08-26). `idPorChaveAnterior` já tem todo mundo que
  // existia no range lido acima; quem não aparece na leitura atual da
  // planilha é órfão — some da aba, some do banco. Perde status_manual/
  // observacao dessa linha específica (inevitável sem ID estável por linha
  // na planilha), mas é sempre a linha ERRADA que fica pra trás.
  const chaveAtuais = new Set(operacoes.linhas.map((l) => l.chaveNatural));
  const idsOrfaos = Array.from(idPorChaveAnterior.entries())
    .filter(([chave]) => !chaveAtuais.has(chave))
    .map(([, id]) => id);
  for (const batch of chunk(idsOrfaos, 200)) {
    const { error } = await supabase.from("weekly_operacoes").delete().in("id", batch);
    if (error) throw new Error("Erro removendo weekly_operacoes órfãs: " + error.message);
  }

  // Mesmo ajuste do bloco acima: intervalo de data em vez de `.in()` com
  // centenas de chave_natural (nomes longos embutidos na chave estouravam
  // a URL do PostgREST — "Bad Request").
  const weeklyIdPorChave = new Map<string, string>();
  if (assinado.menorData && assinado.maiorData) {
    const { data: idsRows, error } = await supabase
      .from("weekly_operacoes")
      .select("id, chave_natural")
      .gte("data", assinado.menorData)
      .lte("data", assinado.maiorData);
    if (error) throw new Error("Erro buscando ids de weekly_operacoes pra vincular vendas: " + error.message);
    for (const row of idsRows ?? []) weeklyIdPorChave.set(row.chave_natural, row.id);
  }

  const vendaRows = assinado.vendas
    .map((v) => {
      const profileId = nomeParaId.get(v.nomeNormalizado);
      if (!profileId) {
        unmatched.add(v.nomeNormalizado);
        return null;
      }
      return {
        profile_id: profileId,
        tipo: "individual" as const,
        valor: v.valor,
        data: v.data,
        origem: v.origem,
        multiplicador: v.multiplicador,
        cliente: v.cliente,
        papel: v.papel,
        weekly_operacao_id: weeklyIdPorChave.get(v.chaveNatural) ?? null,
        synced_at: new Date().toISOString(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  // Substitui por completo as vendas do período coberto pra nunca duplicar
  // entre execuções (a planilha não tem uma chave estável por linha).
  if (assinado.menorData && assinado.maiorData) {
    const idsEnvolvidos = Array.from(new Set(vendaRows.map((v) => v.profile_id)));
    for (const idsBatch of chunk(idsEnvolvidos, 200)) {
      const { error } = await supabase
        .from("vendas")
        .delete()
        .in("profile_id", idsBatch)
        .gte("data", assinado.menorData)
        .lte("data", assinado.maiorData);
      if (error) throw new Error("Erro limpando vendas antigas: " + error.message);
    }
  }
  for (const batch of chunk(vendaRows, 1000)) {
    const { error } = await supabase.from("vendas").insert(batch);
    if (error) throw new Error("Erro gravando vendas: " + error.message);
    vendasInseridas += batch.length;
  }

  // ---------- compromissos.*_real: liga a integração pendente ----------
  // Mesmo caminho que o Ranking já usa pro individual (producao_funil por
  // pessoa/dia, contando os dois papéis — sem risco de duplicar entre
  // PESSOAS diferentes aqui, é a produção da própria pessoa que lançou o
  // compromisso). Pagos usa pago_em (não producao_funil.etapa='pagos', que
  // é keyed pela data de assinatura, não de pagamento — mesmo cuidado já
  // documentado em CentralNotificacoes). Só atualiza compromissos que JÁ
  // existem (a pessoa precisa ter lançado a meta do dia) — nunca cria linha.
  //
  // Janela de só 5 dias (não os 60 do streak): uma vez que o dia real de
  // uma pessoa está gravado, ele não muda mais (a produção daquele dia já
  // fechou) — recalcular passado inteiro a cada sync só soma latência sem
  // ganho, e quase estourou o tempo do Server Action de "Sincronizar agora"
  // (achado 2026-08-24: sync manual voltava com erro genérico do Next
  // escondendo a causa — corte de escopo aqui é a correção).
  const dataMinimaReal = new Date();
  dataMinimaReal.setDate(dataMinimaReal.getDate() - 5);
  const dataMinimaRealStr = dataMinimaReal.toISOString().slice(0, 10);

  const { data: compromissosExistentes, error: compromissosError } = await supabase
    .from("compromissos")
    .select("id, profile_id, data")
    .gte("data", dataMinimaRealStr);
  if (compromissosError) throw new Error("Erro lendo compromissos pra atualizar realizado: " + compromissosError.message);

  if (compromissosExistentes && compromissosExistentes.length > 0) {
    const idsCompromisso = Array.from(new Set(compromissosExistentes.map((c) => c.profile_id)));
    const [{ data: funilReal, error: funilRealError }, { data: opsPagasReal, error: opsPagasError }] = await Promise.all([
      supabase
        .from("producao_funil")
        .select("profile_id, data, etapa, realizado")
        .in("profile_id", idsCompromisso)
        .in("etapa", ["entrevistas", "assinaturas"])
        .gte("data", dataMinimaRealStr),
      supabase
        .from("weekly_operacoes")
        .select("sdr_profile_id, closer_profile_id, pago_em")
        .eq("status", "PAGO")
        .not("pago_em", "is", null)
        .gte("pago_em", dataMinimaRealStr),
    ]);
    if (funilRealError) throw new Error("Erro lendo producao_funil pra compromissos.real: " + funilRealError.message);
    if (opsPagasError) throw new Error("Erro lendo weekly_operacoes pra compromissos.real: " + opsPagasError.message);

    const entrevistasPorChave = new Map<string, number>();
    const assinaturasPorChave = new Map<string, number>();
    for (const r of funilReal ?? []) {
      const chave = `${r.profile_id}|${r.data}`;
      const mapa = r.etapa === "entrevistas" ? entrevistasPorChave : assinaturasPorChave;
      mapa.set(chave, (mapa.get(chave) ?? 0) + r.realizado);
    }
    // Venda "ambos" (mesma pessoa SDR e Closer): profile_id só entra 1x no
    // Set, então conta 1 pago, não 2 — mesmo cuidado de sempre.
    const pagosPorChave = new Map<string, number>();
    for (const o of opsPagasReal ?? []) {
      const pessoasDaOperacao = Array.from(new Set([o.sdr_profile_id, o.closer_profile_id].filter((x): x is string => !!x)));
      for (const pid of pessoasDaOperacao) {
        const chave = `${pid}|${o.pago_em}`;
        pagosPorChave.set(chave, (pagosPorChave.get(chave) ?? 0) + 1);
      }
    }

    for (const grupo of chunk(compromissosExistentes, 20)) {
      await Promise.all(
        grupo.map((c) => {
          const chave = `${c.profile_id}|${c.data}`;
          return supabase
            .from("compromissos")
            .update({
              entrevistas_real: entrevistasPorChave.get(chave) ?? 0,
              assinaturas_real: assinaturasPorChave.get(chave) ?? 0,
              pagos_real: pagosPorChave.get(chave) ?? 0,
            })
            .eq("id", c.id);
        })
      );
    }
  }

  const detalhe = JSON.stringify({
    funilLinhasGravadas,
    vendasInseridas,
    naoEncontrados: Array.from(unmatched).slice(0, 50),
    totalNaoEncontrados: unmatched.size,
  });

  await supabase.from("sync_log").insert({
    fonte: "google_sheets:dados+assinado+entrevistas",
    status: "ok",
    detalhe,
  });

  return { funilLinhasGravadas, vendasInseridas, naoEncontrados: Array.from(unmatched) };
}
