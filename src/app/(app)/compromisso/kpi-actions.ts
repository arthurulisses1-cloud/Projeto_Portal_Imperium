"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { hojeBR } from "@/lib/data-br";

/** Grava o compromisso (meta do dia) e o realizado de cada KPI do cargo.
 *  Os KPIs válidos vêm do banco (kpi_definicoes), não do formulário. */
export async function salvarCompromissoKpis(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const negocioId = String(formData.get("negocio_id") ?? "");
  const cargo = String(formData.get("cargo") ?? "");
  if (!negocioId || !cargo) throw new Error("Negócio ou cargo ausente.");

  // confere que a pessoa é mesmo desse negócio/cargo
  const { data: vinc } = await supabase
    .from("profile_negocios")
    .select("cargo")
    .eq("profile_id", user.id)
    .eq("negocio_id", negocioId)
    .maybeSingle();
  if (!vinc || vinc.cargo !== cargo) throw new Error("Você não pertence a esse negócio.");

  const { data: defs } = await supabase
    .from("kpi_definicoes")
    .select("chave, label")
    .eq("negocio_id", negocioId)
    .eq("ativo", true)
    .contains("cargos", [cargo]);

  const num = (v: FormDataEntryValue | null) => Math.max(0, Number(String(v ?? "0").replace(",", ".")) || 0);
  const hoje = hojeBR();
  const linhas = (defs ?? []).map((d) => ({
    profile_id: user.id,
    negocio_id: negocioId,
    data: hoje,
    chave: d.chave,
    label: d.label,
    meta: num(formData.get(`meta_${d.chave}`)),
    realizado: num(formData.get(`real_${d.chave}`)),
    updated_at: new Date().toISOString(),
  }));
  if (linhas.length === 0) throw new Error("Esse cargo não tem indicadores cadastrados.");

  const { error } = await supabase.from("compromisso_kpis").upsert(linhas, { onConflict: "profile_id,negocio_id,data,chave" });
  if (error) throw new Error(error.message);
  revalidatePath("/compromisso");
}
