"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function exigirDiretor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "diretor") throw new Error("Só o Diretor acessa a DRE.");
  return supabase;
}

export async function salvarConfigDre(formData: FormData) {
  const supabase = await exigirDiretor();

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
  const supabase = await exigirDiretor();

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
  const supabase = await exigirDiretor();

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
  const supabase = await exigirDiretor();
  const id = String(formData.get("id"));

  const { error } = await supabase.from("dre_despesas_extras").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/dre");
}
