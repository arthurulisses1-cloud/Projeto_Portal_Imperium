"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CRM_POR_NEGOCIO } from "@/lib/integracoes/config";
import type { AuditoriaGravada } from "@/lib/integracoes/auditoria";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Quem valida a RQA: o Diretor, o Head do negócio ou um dos validadores da configuração do negócio. */
export async function podeValidarRqa(supabase: SupabaseClient, userId: string, role: string, negocioId: string, slug: string): Promise<boolean> {
  if (!CRM_POR_NEGOCIO[slug]?.rqa) return false;
  if (role === "diretor" || CRM_POR_NEGOCIO[slug]?.rqa?.validadores?.includes(userId)) return true;
  const { data } = await supabase.from("profile_negocios").select("cargo").eq("profile_id", userId).eq("negocio_id", negocioId).maybeSingle();
  return data?.cargo === "head";
}

/**
 * Validação do gerente de uma RQA (Auditoria → RQA): aprovada ou reprovada, com observação; "limpar" apaga
 * (volta a "sem validação"). Só Diretor ou Head, só em negócio com RQA (Acrópole) e só em reunião realizada
 * que está na base da Auditoria. Grava pelo servidor (a tabela não tem acesso pelo app).
 */
export async function salvarValidacaoRqa(formData: FormData): Promise<void> {
  const slug = String(formData.get("negocio") ?? "");
  const dealId = String(formData.get("deal") ?? "");
  const decisao = String(formData.get("decisao") ?? "");
  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 1000) || null;
  if (!CRM_POR_NEGOCIO[slug]?.rqa || !dealId || !["aprovada", "reprovada", "limpar"].includes(decisao)) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: eu } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!eu) return;
  const admin = createAdminClient();
  const { data: neg } = await admin.from("negocios").select("id").eq("slug", slug).single();
  if (!neg || !(await podeValidarRqa(supabase, user.id, eu.role, neg.id, slug))) return;

  // Só reunião realizada da base da Auditoria (o lead existe e chegou à realizada).
  const { data: est } = await admin.from("integracao_estado").select("valor").eq("chave", `auditoria:${slug}`).maybeSingle();
  const lead = ((est?.valor as AuditoriaGravada | null)?.leads ?? []).find((l) => l.id === dealId);
  if (!lead?.realizadaEm) return;

  if (decisao === "limpar") {
    await admin.from("rqa_gerente").delete().eq("negocio_id", neg.id).eq("deal_id", dealId);
  } else {
    await admin
      .from("rqa_gerente")
      .upsert({ negocio_id: neg.id, deal_id: dealId, decisao, observacao, atualizado_em: new Date().toISOString(), atualizado_por: user.id }, { onConflict: "negocio_id,deal_id" });
  }
  revalidatePath("/auditoria-comercial");
}
