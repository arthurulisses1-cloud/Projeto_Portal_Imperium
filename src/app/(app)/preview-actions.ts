"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

async function exigirDiretor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "diretor") throw new Error("Só o Diretor pode pré-visualizar como outra pessoa.");
}

export async function limparPreview() {
  await exigirDiretor();
  const cookieStore = await cookies();
  cookieStore.delete("preview_profile_id");
  revalidatePath("/", "layout");
}
