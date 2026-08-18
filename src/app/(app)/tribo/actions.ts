"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function criarTribo(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const nome = String(formData.get("nome") ?? "").trim();
  const exercitoId = String(formData.get("exercito_id") ?? "");
  if (!nome || !exercitoId) throw new Error("Nome e Exército são obrigatórios.");

  const { error } = await supabase.from("tribos").insert({
    nome,
    exercito_id: exercitoId,
    closer_id: user.id,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/tribo");
}

export async function renomearTribo(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) throw new Error("Nome é obrigatório.");

  const { error } = await supabase.from("tribos").update({ nome }).eq("closer_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/tribo");
}

export async function atualizarLogoTribo(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const file = formData.get("logo") as File | null;
  if (!file || file.size === 0) throw new Error("Selecione uma imagem.");

  const ext = file.name.split(".").pop() || "png";
  const path = `${user.id}/logo-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("tribo-logos")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (uploadError) throw new Error(uploadError.message);

  const { data: pub } = supabase.storage.from("tribo-logos").getPublicUrl(path);

  const { error } = await supabase
    .from("tribos")
    .update({ logo_url: pub.publicUrl })
    .eq("closer_id", user.id);
  if (error) throw new Error(error.message);

  revalidatePath("/tribo");
}

export async function convidarMembro(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "closer") throw new Error("Só Closers convidam membros.");

  const { data: tribo } = await supabase
    .from("tribos")
    .select("id")
    .eq("closer_id", user.id)
    .single();
  if (!tribo) throw new Error("Você ainda não tem uma Tribo.");

  const nome = String(formData.get("nome") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!nome || !email) throw new Error("Nome e email são obrigatórios.");

  const senha = "Imperium@" + Math.floor(1000 + Math.random() * 9000);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password: senha, email_confirm: true }),
  });

  const createData = await createRes.json();
  if (!createRes.ok) {
    throw new Error(createData?.msg || createData?.message || "Erro ao criar conta.");
  }

  const newUserId = createData.id as string;

  const patchRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${newUserId}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ full_name: nome, role: "sdr", rank: "legionario", tribo_id: tribo.id }),
  });
  if (!patchRes.ok) {
    const errBody = await patchRes.text();
    throw new Error("Conta criada, mas falhou ao vincular à Tribo: " + errBody);
  }

  revalidatePath("/tribo");
  return { email, senha };
}

export async function deixarFeedback(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const sdrId = String(formData.get("sdr_id"));
  const texto = String(formData.get("texto") ?? "").trim();
  if (!texto) throw new Error("Escreva o feedback.");

  const { error } = await supabase.from("feedbacks_sdr").insert({
    sdr_id: sdrId,
    closer_id: user.id,
    texto,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/tribo");
}

export async function registrarPerda(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const motivo = String(formData.get("motivo") ?? "").trim();
  const observacao = String(formData.get("observacao") ?? "").trim();
  const data = String(formData.get("data") ?? "") || new Date().toISOString().slice(0, 10);
  if (!motivo) throw new Error("Selecione o motivo.");

  const { error } = await supabase.from("perdas").insert({
    profile_id: user.id,
    motivo,
    observacao: observacao || null,
    data,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/tribo");
}
