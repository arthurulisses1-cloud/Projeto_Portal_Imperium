"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { runSync } from "@/lib/sync/run";

async function exigirDiretor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "diretor") throw new Error("Só o Diretor pode fazer isso.");
  return supabase;
}

async function exigirLiderOuDiretor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "diretor" && profile?.role !== "lider") {
    throw new Error("Só líderes e o Diretor podem fazer isso.");
  }
  return supabase;
}

export async function atualizarCargo(formData: FormData) {
  const supabase = await exigirDiretor();
  const profileId = String(formData.get("profile_id"));
  const role = String(formData.get("role"));
  const rank = String(formData.get("rank"));

  const { error } = await supabase.from("profiles").update({ role, rank }).eq("id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath("/gestao");
}

export async function atualizarTribo(formData: FormData) {
  const supabase = await exigirDiretor();
  const profileId = String(formData.get("profile_id"));
  const triboId = String(formData.get("tribo_id") ?? "");

  const { error } = await supabase
    .from("profiles")
    .update({ tribo_id: triboId || null })
    .eq("id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath("/gestao");
}

export async function atualizarLegado(formData: FormData) {
  const supabase = await exigirDiretor();
  const exercitoId = String(formData.get("exercito_id"));
  const legadoId = String(formData.get("legado_id") ?? "");

  const { error } = await supabase
    .from("exercitos")
    .update({ legado_id: legadoId || null })
    .eq("id", exercitoId);
  if (error) throw new Error(error.message);
  revalidatePath("/gestao");
}

export async function salvarNomesPlanilha(formData: FormData) {
  const supabase = await exigirDiretor();
  const profileId = String(formData.get("profile_id"));
  const nomes = formData.getAll("nomes_planilha").map(String).filter((n) => n.trim() !== "");

  const { error } = await supabase
    .from("profiles")
    .update({ nomes_planilha: nomes.length > 0 ? nomes : null })
    .eq("id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath("/gestao");
}

export async function dispararSyncManual() {
  await exigirLiderOuDiretor();
  const resultado = await runSync();

  revalidatePath("/");
  revalidatePath("/producao");
  revalidatePath("/tribo");
  revalidatePath("/exercito");
  revalidatePath("/ranking");
  revalidatePath("/comissao");
  revalidatePath("/legado");
  revalidatePath("/weekly");
  revalidatePath("/minha-producao");
  revalidatePath("/forecast");

  return resultado;
}
