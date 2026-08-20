"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function decidirEvidencia(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const id = String(formData.get("id"));
  const status = String(formData.get("status")); // aprovado | rejeitado

  const { error } = await supabase
    .from("promotion_evidence")
    .update({ status, decidido_por: user.id })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/validacao");
}

// Aprovar aqui é o "toca o sino" de verdade — já promove a pessoa (atualiza
// profiles.rank pro próximo nível da transição). Rejeitar só fecha o pedido,
// sem mexer no rank; a pessoa pode solicitar de novo mais pra frente.
export async function decidirPromocao(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const id = String(formData.get("id"));
  const status = String(formData.get("status")); // aprovado | rejeitado

  const { data: pedido } = await supabase
    .from("promotion_requests")
    .select("id, profile_id, transicao")
    .eq("id", id)
    .single();
  if (!pedido) throw new Error("Solicitação não encontrada.");

  const { error } = await supabase
    .from("promotion_requests")
    .update({ status, decidido_por: user.id, decidido_em: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  if (status === "aprovado") {
    const proximoRank = pedido.transicao.split("_")[1];
    const { error: rankError } = await supabase.from("profiles").update({ rank: proximoRank }).eq("id", pedido.profile_id);
    if (rankError) throw new Error(rankError.message);
  }

  revalidatePath("/validacao");
}
