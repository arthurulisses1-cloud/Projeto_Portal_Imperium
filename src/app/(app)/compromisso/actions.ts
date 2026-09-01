"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { hojeBR } from "@/lib/data-br";

export async function registrarCompromisso(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const entrevistas = Number(formData.get("entrevistas_comp") ?? 0);
  const assinaturas = Number(formData.get("assinaturas_comp") ?? 0);
  const pagos = Number(formData.get("pagos_comp") ?? 0);
  const hoje = hojeBR();

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

// SDR pode ajustar a meta que ele mesmo lançou hoje (errou o número, quer
// revisar pra cima/baixo no meio do dia) — só o dia de HOJE, só a própria
// linha (where profile_id + data = hoje), nunca histórico.
export async function atualizarCompromisso(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const entrevistas = Number(formData.get("entrevistas_comp") ?? 0);
  const assinaturas = Number(formData.get("assinaturas_comp") ?? 0);
  const pagos = Number(formData.get("pagos_comp") ?? 0);
  const hoje = hojeBR();

  const { error } = await supabase
    .from("compromissos")
    .update({
      entrevistas_comp: entrevistas,
      assinaturas_comp: assinaturas,
      pagos_comp: pagos,
    })
    .eq("profile_id", user.id)
    .eq("data", hoje);

  if (error) throw new Error(error.message);

  revalidatePath("/compromisso");
}
