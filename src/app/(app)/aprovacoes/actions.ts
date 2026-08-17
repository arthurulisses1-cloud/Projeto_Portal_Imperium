"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { NEXT_RANK, type Rank } from "@/lib/carreira";

export async function decidirPromocao(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const id = String(formData.get("id"));
  const status = String(formData.get("status")); // aprovado | rejeitado
  const profileId = String(formData.get("profile_id"));
  const rankAtual = String(formData.get("rank_atual")) as Rank;

  const { error } = await supabase
    .from("promotion_requests")
    .update({ status, decidido_por: user.id, decidido_em: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);

  if (status === "aprovado") {
    const proximo = NEXT_RANK[rankAtual];
    if (proximo) {
      const { error: err2 } = await supabase
        .from("profiles")
        .update({ rank: proximo })
        .eq("id", profileId);
      if (err2) throw new Error(err2.message);
    }
  }

  revalidatePath("/aprovacoes");
}
