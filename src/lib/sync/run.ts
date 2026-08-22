import { createAdminClient } from "@/lib/supabase/admin";
import { buscarProducaoDados } from "./dados";
import { buscarAssinado } from "./assinado";
import { buscarEntrevistas } from "./entrevistas";
import { buscarOperacoes } from "./weekly";
import { normalizarNome } from "./parse";

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
  const entrevistas = await buscarEntrevistas();
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

  // ---------- aba Assinado: funil (assinaturas/pagos) + vendas ----------
  const assinado = await buscarAssinado();

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
  const operacoes = await buscarOperacoes();
  const weeklyRows = operacoes.linhas.map((l) => ({
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
    synced_at: new Date().toISOString(),
  }));
  for (const batch of chunk(weeklyRows, 1000)) {
    const { error } = await supabase
      .from("weekly_operacoes")
      .upsert(batch, { onConflict: "chave_natural" });
    if (error) throw new Error("Erro gravando weekly_operacoes: " + error.message);
  }

  const chavesVendas = Array.from(new Set(assinado.vendas.map((v) => v.chaveNatural)));
  const weeklyIdPorChave = new Map<string, string>();
  for (const chavesBatch of chunk(chavesVendas, 500)) {
    const { data: idsRows, error } = await supabase
      .from("weekly_operacoes")
      .select("id, chave_natural")
      .in("chave_natural", chavesBatch);
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
