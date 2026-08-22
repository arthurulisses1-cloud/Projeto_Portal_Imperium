"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
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

// Troca o email de teste (falso, sem caixa de entrada de verdade) por um
// email real e dispara o fluxo padrão de "esqueci minha senha" do Supabase
// pra esse endereço — a pessoa recebe o link, define a própria senha, e a
// gente nunca chega a ver/manusear a senha dela. Substitui o antigo modelo
// de gerar uma senha temporária e mostrar em tela (que só funcionava uma
// vez e não dava pra recuperar depois).
export async function enviarLinkAcesso(formData: FormData) {
  await exigirDiretor();
  const profileId = String(formData.get("profile_id") ?? "");
  const emailReal = String(formData.get("email_real") ?? "").trim().toLowerCase();
  if (!profileId || !emailReal) throw new Error("Email é obrigatório.");

  const admin = createAdminClient();

  const { error: updateError } = await admin.auth.admin.updateUserById(profileId, {
    email: emailReal,
    email_confirm: true,
  });
  if (updateError) throw new Error("Erro ao atualizar email: " + updateError.message);

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const redirectTo = `${proto}://${host}/auth/redefinir-senha`;

  const { error: resetError } = await admin.auth.resetPasswordForEmail(emailReal, { redirectTo });
  if (resetError) throw new Error("Email atualizado, mas falhou ao enviar o link: " + resetError.message);

  revalidatePath("/gestao");
  return { email: emailReal };
}

// Fallback pra quando email não é uma opção viável (sem SMTP configurado,
// domínio da empresa fora do nosso controle) — gera uma senha nova
// diretamente e devolve pra tela, igual o fluxo antigo de "Closer convida
// SDR" já fazia, só que pra conta que já existe. O Diretor vê a senha UMA
// vez e compartilha por fora (WhatsApp, pessoalmente) — não fica salva em
// lugar nenhum depois disso, então se perder, só gerando outra.
export async function gerarSenhaNova(formData: FormData) {
  await exigirDiretor();
  const profileId = String(formData.get("profile_id") ?? "");
  if (!profileId) throw new Error("profile_id é obrigatório.");

  const { randomInt } = await import("crypto");
  const senha = "Imperium#" + randomInt(100000, 999999);

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(profileId, { password: senha });
  if (error) throw new Error("Erro ao gerar senha: " + error.message);

  return { senha };
}

// Antes só existia um jeito de criar conta: o Closer convidando um SDR pra
// própria Tribo (ver convidarMembro em tribo/actions.ts) — sem forma
// nenhuma do Diretor cadastrar um Closer, Líder ou SDR direto. Mesma
// mecânica (cria no Auth + a trigger handle_new_user já cria a linha
// mínima em profiles, aqui só ajusta pro papel/cargo/tribo certos), mas
// liberado pra qualquer papel.
export async function criarUsuario(formData: FormData) {
  await exigirDiretor();

  const nome = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "sdr");
  const rank = String(formData.get("rank") ?? "legionario");
  const triboId = String(formData.get("tribo_id") ?? "") || null;
  if (!nome || !email) throw new Error("Nome e email são obrigatórios.");

  const { randomInt } = await import("crypto");
  const senha = "Imperium#" + randomInt(100000, 999999);

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { full_name: nome },
  });
  if (createError) throw new Error("Erro ao criar conta: " + createError.message);

  const { error: updateError } = await admin
    .from("profiles")
    .update({ full_name: nome, role, rank, tribo_id: triboId })
    .eq("id", created.user.id);
  if (updateError) throw new Error("Conta criada, mas falhou ao ajustar papel/tribo: " + updateError.message);

  revalidatePath("/gestao");
  return { email, senha };
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
