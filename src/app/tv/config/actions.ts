"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { TV_SLIDES } from "@/lib/tv-config";

export async function salvarOrdemSlides(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "diretor") throw new Error("Só o Diretor edita o Painel TV.");

  const ordem = String(formData.get("ordem") ?? "").split(",").filter(Boolean);
  const chavesValidas = new Set(TV_SLIDES.map((s) => s.chave));
  if (ordem.length === 0 || !ordem.every((c) => chavesValidas.has(c))) {
    throw new Error("Ordem inválida.");
  }

  const { error } = await supabase
    .from("tv_config")
    .update({ ordem_slides: ordem, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", true);
  if (error) throw new Error(error.message);

  revalidatePath("/tv");
  revalidatePath("/tv/config");
}
