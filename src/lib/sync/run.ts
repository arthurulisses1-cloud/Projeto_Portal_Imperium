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

export type SyncResultado = {
  funilLinhasGravadas: number;
  vendasInseridas: number;
  naoEncontrados: string[];
};

export async function runSync(): Promise<SyncResultado> {
  const supabase = createAdminClient();
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

  for (const batch of chunk(funilRowsDados, 1000)) {
    const { error } = await supabase
      .from("producao_funil")
      .upsert(batch, { onConflict: "profile_id,data,etapa,papel" });
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

  for (const batch of chunk(funilRowsEntrevistas, 1000)) {
    const { error } = await supabase
      .from("producao_funil")
      .upsert(batch, { onConflict: "profile_id,data,etapa,papel" });
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

  for (const batch of chunk(funilRowsAssinado, 1000)) {
    const { error } = await supabase
      .from("producao_funil")
      .upsert(batch, { onConflict: "profile_id,data,etapa,papel" });
    if (error) throw new Error("Erro gravando funil (Assinado): " + error.message);
    funilLinhasGravadas += batch.length;
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

  // ---------- Aba Assinado (de novo, sem filtro): espelho pra Weekly de Receita ----------
  const operacoes = await buscarOperacoes();
  const weeklyRows = operacoes.linhas.map((l) => ({
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
  if (operacoes.menorData && operacoes.maiorData) {
    const { error } = await supabase
      .from("weekly_operacoes")
      .delete()
      .gte("data", operacoes.menorData)
      .lte("data", operacoes.maiorData);
    if (error) throw new Error("Erro limpando weekly_operacoes antigas: " + error.message);
  }
  for (const batch of chunk(weeklyRows, 1000)) {
    const { error } = await supabase.from("weekly_operacoes").insert(batch);
    if (error) throw new Error("Erro gravando weekly_operacoes: " + error.message);
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
