"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function registrarCompromisso(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const entrevistas = Number(formData.get("entrevistas_comp") ?? 0);
  const assinaturas = Number(formData.get("assinaturas_comp") ?? 0);
  const pagos = Number(formData.get("pagos_comp") ?? 0);
  const hoje = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from("compromissos").insert({
    profile_id: user.id,
    data: hoje,
    entrevistas_comp: entrevistas,
    assinaturas_comp: assinaturas,
    pagos_comp: pagos,
    lancado: true,
    status: "andamento",
  });

  if (error) throw new Error(error.message);

  revalidatePath("/compromisso");
}
