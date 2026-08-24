"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { buscarFolha } from "@/lib/dre";

async function exigirDiretor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "diretor") throw new Error("Só o Diretor acessa a DRE.");
  return { supabase, userId: user.id };
}

export async function salvarConfigDre(formData: FormData) {
  const { supabase } = await exigirDiretor();

  const pctReceitaCredito = Number(formData.get("pct_receita_credito")) / 100;
  const pctReceitaParceiro = Number(formData.get("pct_receita_parceiro")) / 100;
  const pctImposto = Number(formData.get("pct_imposto")) / 100;
  const custoAluguel = Number(formData.get("custo_aluguel"));
  const custoTrafego = Number(formData.get("custo_trafego"));

  const { error } = await supabase
    .from("dre_configuracoes")
    .update({
      pct_receita_credito: pctReceitaCredito,
      pct_receita_parceiro: pctReceitaParceiro,
      pct_imposto: pctImposto,
      custo_aluguel: custoAluguel,
      custo_trafego: custoTrafego,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);
  if (error) throw new Error(error.message);

  revalidatePath("/dre");
}

export async function salvarProducaoParceiro(formData: FormData) {
  const { supabase } = await exigirDiretor();

  const ano = Number(formData.get("ano"));
  const mes = Number(formData.get("mes"));
  const valor = Number(formData.get("valor")) || 0;

  const { error } = await supabase
    .from("dre_producao_parceiro")
    .upsert({ ano, mes, valor, updated_at: new Date().toISOString() }, { onConflict: "ano,mes" });
  if (error) throw new Error(error.message);

  revalidatePath("/dre");
}

export async function adicionarDespesaExtra(formData: FormData) {
  const { supabase } = await exigirDiretor();

  const ano = Number(formData.get("ano"));
  const mes = Number(formData.get("mes"));
  const descricao = String(formData.get("descricao") ?? "").trim();
  const valor = Number(formData.get("valor"));
  const profileId = String(formData.get("profile_id") ?? "") || null;
  if (!descricao || !valor) throw new Error("Descrição e valor são obrigatórios.");

  const { error } = await supabase
    .from("dre_despesas_extras")
    .insert({ ano, mes, descricao, valor, profile_id: profileId });
  if (error) throw new Error(error.message);

  revalidatePath("/dre");
}

export async function excluirDespesaExtra(formData: FormData) {
  const { supabase } = await exigirDiretor();
  const id = String(formData.get("id"));

  const { error } = await supabase.from("dre_despesas_extras").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/dre");
}

export async function adicionarReceitaExtra(formData: FormData) {
  const { supabase } = await exigirDiretor();

  const ano = Number(formData.get("ano"));
  const mes = Number(formData.get("mes"));
  const descricao = String(formData.get("descricao") ?? "").trim();
  const valor = Number(formData.get("valor"));
  if (!descricao || !valor) throw new Error("Descrição e valor são obrigatórios.");

  const { error } = await supabase.from("dre_receitas_extras").insert({ ano, mes, descricao, valor });
  if (error) throw new Error(error.message);

  revalidatePath("/dre");
}

export async function excluirReceitaExtra(formData: FormData) {
  const { supabase } = await exigirDiretor();
  const id = String(formData.get("id"));

  const { error } = await supabase.from("dre_receitas_extras").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/dre");
}

export async function aprovarComissaoParceiro(formData: FormData) {
  const { supabase, userId } = await exigirDiretor();
  const id = String(formData.get("id"));

  const { error } = await supabase
    .from("comissoes_parceiro")
    .update({ status: "aprovado", aprovado_por: userId, aprovado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/dre");
  revalidatePath("/forecast");
}

// Fecha (tranca) a Folha + Comissão de Parceiro do mês de produção (ano,
// mes) — dali em diante /comissao e o painel do financeiro mostram esse
// snapshot em vez do número live. Bloqueia se sobrar comissão de parceiro
// acima do padrão sem aprovação, pra não trancar um número que ainda pode
// mudar. Reaproveita buscarFolha (mesma fonte que a DRE real usa) em vez
// de recalcular comissão do zero aqui.
export async function fecharMes(formData: FormData) {
  const { supabase, userId } = await exigirDiretor();
  const ano = Number(formData.get("ano"));
  const mes = Number(formData.get("mes"));
  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimMes = new Date(ano, mes, 0).toISOString().slice(0, 10);

  const { data: opsDoMes } = await supabase.from("weekly_operacoes").select("id, valor").gte("data", inicioMes).lte("data", fimMes);
  const idsDoMes = (opsDoMes ?? []).map((o) => o.id);

  if (idsDoMes.length > 0) {
    const { data: pendentes } = await supabase
      .from("comissoes_parceiro")
      .select("id")
      .eq("status", "pendente_aprovacao")
      .in("weekly_operacao_id", idsDoMes);
    if (pendentes && pendentes.length > 0) {
      throw new Error(
        `Existem ${pendentes.length} comissão(ões) de parceiro acima do padrão aguardando aprovação neste mês — resolva antes de fechar.`
      );
    }
  }

  const folha = await buscarFolha(supabase, ano, mes);

  const { data: fechamento, error: fechErr } = await supabase
    .from("fechamentos_mensais")
    .upsert(
      { ano, mes, status: "fechado", fechado_por: userId, fechado_em: new Date().toISOString() },
      { onConflict: "ano,mes" }
    )
    .select("id")
    .single();
  if (fechErr) throw new Error(fechErr.message);
  const fechamentoId = fechamento.id;

  await supabase.from("fechamento_pessoas").delete().eq("fechamento_id", fechamentoId);
  await supabase.from("fechamento_parceiros").delete().eq("fechamento_id", fechamentoId);

  if (folha.linhas.length > 0) {
    const { error } = await supabase.from("fechamento_pessoas").insert(
      folha.linhas.map((l) => ({
        fechamento_id: fechamentoId,
        profile_id: l.profileId,
        nome: l.nome,
        fixo: l.fixo,
        bonus: l.bonus,
        variavel: l.variavelSdr + l.variavelCloser + l.variavelGestao,
      }))
    );
    if (error) throw new Error(error.message);
  }

  if (idsDoMes.length > 0) {
    const valorPorOp = new Map((opsDoMes ?? []).map((o) => [o.id, Number(o.valor)]));
    const { data: comissoesDoMes } = await supabase
      .from("comissoes_parceiro")
      .select("id, weekly_operacao_id, nome_parceiro, chave_pix, percentual")
      .in("status", ["ok", "aprovado"])
      .in("weekly_operacao_id", idsDoMes);

    if (comissoesDoMes && comissoesDoMes.length > 0) {
      const linhas = comissoesDoMes.map((c) => {
        const valorTotal = (Number(c.percentual) / 100) * (valorPorOp.get(c.weekly_operacao_id) ?? 0);
        return {
          fechamento_id: fechamentoId,
          comissao_parceiro_id: c.id,
          nome_parceiro: c.nome_parceiro,
          chave_pix: c.chave_pix,
          valor_total: valorTotal,
          valor_repassado: valorTotal * 0.91,
          valor_retido: valorTotal * 0.09,
        };
      });
      const { error } = await supabase.from("fechamento_parceiros").insert(linhas);
      if (error) throw new Error(error.message);
    }
  }

  revalidatePath("/dre");
  revalidatePath("/comissao");
}

// Reabre um mês fechado (Diretor achou um erro) — limpa o snapshot pra ele
// corrigir e fechar de novo depois; não vira lançamento avulso no mês
// seguinte (decisão do Diretor, 2026-08-22).
export async function reabrirMes(formData: FormData) {
  const { supabase } = await exigirDiretor();
  const ano = Number(formData.get("ano"));
  const mes = Number(formData.get("mes"));

  const { data: fechamento } = await supabase
    .from("fechamentos_mensais")
    .select("id")
    .eq("ano", ano)
    .eq("mes", mes)
    .maybeSingle();
  if (!fechamento) return;

  await supabase.from("fechamento_pessoas").delete().eq("fechamento_id", fechamento.id);
  await supabase.from("fechamento_parceiros").delete().eq("fechamento_id", fechamento.id);
  const { error } = await supabase.from("fechamentos_mensais").update({ status: "aberto" }).eq("id", fechamento.id);
  if (error) throw new Error(error.message);

  revalidatePath("/dre");
  revalidatePath("/comissao");
}
