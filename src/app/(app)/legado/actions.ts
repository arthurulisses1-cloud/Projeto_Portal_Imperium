"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function salvarObservacao(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const profileId = String(formData.get("profile_id"));
  const observacao = String(formData.get("observacao") ?? "").trim();

  const { error } = await supabase
    .from("profiles")
    .update({ observacao_diretor: observacao || null })
    .eq("id", profileId);
  if (error) throw new Error(error.message);

  revalidatePath("/legado");
}

export async function salvarNascimento(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const profileId = String(formData.get("profile_id"));
  const dataNascimento = String(formData.get("data_nascimento") ?? "");

  const { error } = await supabase
    .from("profiles")
    .update({ data_nascimento: dataNascimento || null })
    .eq("id", profileId);
  if (error) throw new Error(error.message);

  revalidatePath("/legado");
}

export async function alternarAtivo(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const profileId = String(formData.get("profile_id"));
  const novoAtivo = String(formData.get("ativo")) === "true";

  const { error } = await supabase.from("profiles").update({ ativo: novoAtivo }).eq("id", profileId);
  if (error) throw new Error(error.message);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  await fetch(`${supabaseUrl}/auth/v1/admin/users/${profileId}`, {
    method: "PUT",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ban_duration: novoAtivo ? "none" : "876000h" }),
  });

  revalidatePath("/legado");
}

export async function salvarAdmissao(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const profileId = String(formData.get("profile_id"));
  const dataAdmissao = String(formData.get("data_admissao") ?? "");

  const { error } = await supabase
    .from("profiles")
    .update({ data_admissao: dataAdmissao || null })
    .eq("id", profileId);
  if (error) throw new Error(error.message);

  revalidatePath("/legado");
}
