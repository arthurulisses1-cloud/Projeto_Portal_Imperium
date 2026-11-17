"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { runSync } from "@/lib/sync/run";
import { AREAS_ANALISTA } from "@/lib/permissoes-analista";

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

// Permissão customizada por Analista — pedido do Diretor, 2026-09-21:
// "quero poder setar o que cada um pode ver e editar". Um checkbox
// ver/editar por área (ver AREAS_ANALISTA, src/lib/permissoes-analista.ts)
// — grava as 10 áreas sempre, mesmo desmarcadas (upsert idempotente é mais
// simples que só gravar diferença do padrão, e a tabela é minúscula).
export async function salvarPermissoesAnalista(formData: FormData) {
  const supabase = await exigirDiretor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profileId = String(formData.get("profile_id"));

  const linhas = AREAS_ANALISTA.map((a) => ({
    profile_id: profileId,
    area: a.key,
    pode_ver: formData.get(`ver_${a.key}`) === "on",
    pode_editar: formData.get(`editar_${a.key}`) === "on",
    atualizado_por: user!.id,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("analista_permissoes").upsert(linhas, { onConflict: "profile_id,area" });
  if (error) throw new Error(error.message);
  revalidatePath("/gestao");
}

export async function atualizarCargo(formData: FormData) {
  const supabase = await exigirDiretor();
  const profileId = String(formData.get("profile_id"));
  const role = String(formData.get("role"));
  if (!["sdr", "closer", "lider", "diretor", "investidor", "analista"].includes(role)) throw new Error("Papel inválido.");

  // O rank (Legionário etc.) não é mais usado: o cargo agora é por negócio (profile_negocios).
  const { error } = await supabase.from("profiles").update({ role }).eq("id", profileId);
  if (error) throw new Error(error.message);
  revalidatePath("/gestao");
}

const CARGOS_NEGOCIO = ["head", "executivo", "closer", "sdr", "bdr", "pre_vendas", "gestor", "outro"];

/** Põe a pessoa em um negócio (ou muda o cargo dela nele). `principal` = o negócio que abre por padrão. */
export async function salvarVinculoNegocio(formData: FormData) {
  const supabase = await exigirDiretor();
  const profileId = String(formData.get("profile_id") ?? "");
  const negocioId = String(formData.get("negocio_id") ?? "");
  const cargo = String(formData.get("cargo") ?? "");
  const principal = formData.get("principal") === "on";
  if (!profileId || !negocioId) throw new Error("Escolha a pessoa e o negócio.");
  if (!CARGOS_NEGOCIO.includes(cargo)) throw new Error("Cargo inválido.");

  if (principal) {
    await supabase.from("profile_negocios").update({ principal: false }).eq("profile_id", profileId);
  }
  const { error } = await supabase
    .from("profile_negocios")
    .upsert({ profile_id: profileId, negocio_id: negocioId, cargo, principal }, { onConflict: "profile_id,negocio_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/gestao");
}

export async function removerVinculoNegocio(formData: FormData) {
  const supabase = await exigirDiretor();
  const profileId = String(formData.get("profile_id") ?? "");
  const negocioId = String(formData.get("negocio_id") ?? "");
  if (!profileId || !negocioId) throw new Error("Vínculo inválido.");
  const { error } = await supabase.from("profile_negocios").delete().eq("profile_id", profileId).eq("negocio_id", negocioId);
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
// Devolve { erro } em vez de lançar: em produção o Next esconde a mensagem de erros lançados por ações
// ("An error occurred in the Server Components render"), então o texto nunca chegava à tela.
function mensagemAuth(e: { message: string; code?: string; status?: number }): string {
  const m = (e.message ?? "").toLowerCase();
  if (e.code === "over_email_send_rate_limit" || m.includes("rate limit")) {
    return "O Supabase limitou o envio de e-mails (padrão: poucos por hora para o projeto todo). Espere cerca de uma hora ou use \"Gerar senha nova\" para essa pessoa.";
  }
  if (e.code === "email_exists" || m.includes("already been registered") || m.includes("already registered")) {
    return "Esse e-mail já está cadastrado em outra conta.";
  }
  if (m.includes("invalid") && m.includes("email")) return "E-mail inválido.";
  return e.message;
}

export async function enviarLinkAcesso(formData: FormData): Promise<{ email: string } | { erro: string }> {
  try {
    await exigirDiretor();
  } catch {
    return { erro: "Só o Diretor pode trocar o e-mail de acesso." };
  }
  const profileId = String(formData.get("profile_id") ?? "");
  const emailReal = String(formData.get("email_real") ?? "").trim().toLowerCase();
  if (!profileId || !emailReal) return { erro: "E-mail é obrigatório." };

  const admin = createAdminClient();

  const { error: updateError } = await admin.auth.admin.updateUserById(profileId, {
    email: emailReal,
    email_confirm: true,
  });
  if (updateError) return { erro: "Não foi possível trocar o e-mail: " + mensagemAuth(updateError) };

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const redirectTo = `${proto}://${host}/auth/redefinir-senha`;

  const { error: resetError } = await admin.auth.resetPasswordForEmail(emailReal, { redirectTo });
  if (resetError) return { erro: "O e-mail foi trocado, mas o link não foi enviado: " + mensagemAuth(resetError) };

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
  const negocioId = String(formData.get("negocio_id") ?? "") || null;
  const cargoNegocio = String(formData.get("cargo_negocio") ?? "executivo");
  if (!nome || !email) throw new Error("Nome e email são obrigatórios.");
  if (negocioId && !CARGOS_NEGOCIO.includes(cargoNegocio)) throw new Error("Cargo inválido.");

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
    .update({ full_name: nome, role })
    .eq("id", created.user.id);
  if (updateError) throw new Error("Conta criada, mas falhou ao ajustar o papel: " + updateError.message);
  if (negocioId) {
    const { error: vincError } = await admin
      .from("profile_negocios")
      .upsert({ profile_id: created.user.id, negocio_id: negocioId, cargo: cargoNegocio, principal: true }, { onConflict: "profile_id,negocio_id" });
    if (vincError) throw new Error("Conta criada, mas falhou ao vincular ao negócio: " + vincError.message);
  }

  revalidatePath("/gestao");
  return { email, senha };
}

// Apaga o usuário inteiro (auth.users + todo dado dele — vendas,
// producao_funil, compromissos, comentarios, etc. têm "on delete cascade"
// até profiles, que por sua vez tem "on delete cascade" até auth.users, ver
// migration 0001). Some pra sempre — sem lixeira. Se a pessoa for
// closer_id de uma Tribo ou legado_id de um Exército, o Postgres recusa o
// delete (FK sem cascade nesses dois casos, de propósito) até desvincular
// primeiro em Gestão de Pessoas.
export async function excluirUsuario(formData: FormData) {
  await exigirDiretor();
  const profileId = String(formData.get("profile_id") ?? "");
  if (!profileId) throw new Error("profile_id é obrigatório.");

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(profileId);
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
