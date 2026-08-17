"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function registrarStrikeTime(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const profileId = String(formData.get("profile_id"));
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (!motivo) throw new Error("Motivo é obrigatório.");

  const { error } = await supabase.from("strikes").insert({
    profile_id: profileId,
    motivo,
    registrado_por: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/exercito");
  revalidatePath("/tribo");
}

export async function registrarPdiTime(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const profileId = String(formData.get("profile_id"));
  const observacao = String(formData.get("observacao") ?? "").trim();
  const planoAcao = String(formData.get("plano_acao") ?? "").trim();
  const proximaRevisao = String(formData.get("proxima_revisao") ?? "");
  if (!observacao) throw new Error("Observação é obrigatória.");

  const { error } = await supabase.from("pdi_registros").insert({
    profile_id: profileId,
    autor_id: user.id,
    observacao,
    plano_acao: planoAcao || null,
    proxima_revisao: proximaRevisao || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/exercito");
  revalidatePath("/tribo");
}

export async function marcarFaltaTime(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const profileId = String(formData.get("profile_id"));
  const hoje = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("compromissos").upsert(
    {
      profile_id: profileId,
      data: hoje,
      falta: true,
      lancado: false,
    },
    { onConflict: "profile_id,data" }
  );
  if (error) throw new Error(error.message);
  revalidatePath("/exercito");
  revalidatePath("/tribo");
}
