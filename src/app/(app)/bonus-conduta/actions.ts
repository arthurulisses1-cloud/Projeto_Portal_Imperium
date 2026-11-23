"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Fecha o bônus de conduta de um mês: para cada pessoa listada, aplica ou não o bônus (R$ do profile_negocios.bonus_conduta).
 * Só o Diretor. A lista de quem entra vem do formulário (campo "linhas"), mas o valor é sempre lido do cadastro.
 */
export async function salvarBonusConduta(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  const { data: eu } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (eu?.role !== "diretor") throw new Error("Só o Diretor fecha o bônus de conduta.");

  const ano = Number(formData.get("ano"));
  const mes = Number(formData.get("mes"));
  if (!(ano >= 2026) || !(mes >= 1 && mes <= 12)) throw new Error("Mês inválido.");

  const linhas = formData.getAll("linhas").map(String); // "profileId:negocioId"
  if (linhas.length === 0) throw new Error("Nenhuma pessoa com bônus neste mês.");

  const { data: vinculos, error: erroLeitura } = await supabase.from("profile_negocios").select("profile_id, negocio_id, bonus_conduta").gt("bonus_conduta", 0);
  if (erroLeitura) throw new Error("Não foi possível ler os bônus (a migration 0122 já rodou?): " + erroLeitura.message);
  const valorPor = new Map((vinculos ?? []).map((v) => [`${v.profile_id}:${v.negocio_id}`, Number(v.bonus_conduta)]));

  const agora = new Date().toISOString();
  const registros = linhas
    .filter((k) => valorPor.has(k))
    .map((k) => {
      const [profileId, negocioId] = k.split(":");
      return {
        profile_id: profileId,
        negocio_id: negocioId,
        ano,
        mes,
        aplicado: formData.get("aplicar_" + k) === "on",
        valor: valorPor.get(k)!,
        decidido_por: user.id,
        decidido_em: agora,
      };
    });
  if (registros.length === 0) throw new Error("Nenhuma das pessoas enviadas tem bônus cadastrado.");

  const { error } = await supabase.from("bonus_conduta_mes").upsert(registros, { onConflict: "profile_id,negocio_id,ano,mes" });
  if (error) throw new Error(error.message);
  revalidatePath("/bonus-conduta");
  revalidatePath("/financeiro-negocio");
  revalidatePath("/dre-negocios");
}
