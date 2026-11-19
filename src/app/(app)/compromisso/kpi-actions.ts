"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { hojeBR } from "@/lib/data-br";
import { createAdminClient } from "@/lib/supabase/admin";
import { KPIS_ENERGIA, buscarCompromissoEnergia, vinculoEnergia } from "@/lib/energy-time";
import { buscarPainelCloser, vinculoCloser } from "@/lib/closer-negocio";

/** Compromisso do executivo do Energy: o realizado é automático (Sunne), o compromisso (meta) é digitado por ele. */
export async function salvarCompromissoEnergia(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  const vinc = await vinculoEnergia(supabase, user.id);
  if (!vinc) throw new Error("Você não é do Maximus Energy.");
  const hoje = hojeBR();
  const real = await buscarCompromissoEnergia(createAdminClient(), user.id, hoje);
  const realizado: Record<string, number> = { contas_subidas: real.contasSubidas, assinaturas: real.assinaturas ?? 0, kwh_gerado: real.kwh };
  const num = (v: FormDataEntryValue | null) => Math.max(0, Number(String(v ?? "0").replace(",", ".")) || 0);
  const linhas = KPIS_ENERGIA.map((k) => ({
    profile_id: user.id,
    negocio_id: vinc.id,
    data: hoje,
    chave: k.chave,
    label: k.label,
    meta: num(formData.get("meta_" + k.chave)),
    realizado: realizado[k.chave],
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("compromisso_kpis").upsert(linhas, { onConflict: "profile_id,negocio_id,data,chave" });
  if (error) throw new Error(error.message);
  revalidatePath("/compromisso");
}

/**
 * Executivo do Match Sales: o compromisso de reuniões agendadas (e o realizado delas), de recebido e de MRR é digitado por ele;
 * o realizado de recebido e de MRR vem das vendas de hoje, e as reuniões realizadas são automáticas (não passam por aqui).
 */
export async function salvarCompromissoMatchExecutivo(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  const vinc = await vinculoCloser(supabase, user.id);
  if (!vinc || vinc.slug !== "matchsales" || String(formData.get("negocio_id") ?? "") !== vinc.id) throw new Error("Você não é executivo do Match Sales.");
  const hoje = hojeBR();
  const painel = await buscarPainelCloser(createAdminClient(), vinc, { id: user.id, nome: "" }, { ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)), hoje });
  const num = (v: FormDataEntryValue | null) => Math.max(0, Number(String(v ?? "0").replace(",", ".")) || 0);
  const agora = new Date().toISOString();
  const base = { profile_id: user.id, negocio_id: vinc.id, data: hoje, updated_at: agora };
  const linhas = [
    { ...base, chave: "reunioes_agendadas", label: "Reuniões agendadas", meta: num(formData.get("meta_agendadas")), realizado: num(formData.get("realizado_agendadas")) },
    { ...base, chave: "recebido", label: "Recebido (R$)", meta: num(formData.get("meta_recebido")), realizado: painel.hoje.recebido },
    { ...base, chave: "mrr", label: "MRR (R$)", meta: num(formData.get("meta_mrr")), realizado: painel.hoje.mrr },
  ];
  const { error } = await supabase.from("compromisso_kpis").upsert(linhas, { onConflict: "profile_id,negocio_id,data,chave" });
  if (error) throw new Error(error.message);
  revalidatePath("/compromisso");
}

/** BDR do Match Sales: só o compromisso de reuniões agendadas é manual (meta e realizado); as realizadas são automáticas. */
export async function salvarAgendadasBdr(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  const negocioId = String(formData.get("negocio_id") ?? "");
  if (!negocioId) throw new Error("Negócio ausente.");
  const { data: vinc } = await supabase.from("profile_negocios").select("cargo").eq("profile_id", user.id).eq("negocio_id", negocioId).maybeSingle();
  if (!vinc || !["bdr", "sdr", "pre_vendas"].includes(vinc.cargo)) throw new Error("Você não é pré-vendas nesse negócio.");
  const { data: def } = await supabase.from("kpi_definicoes").select("chave, label").eq("negocio_id", negocioId).eq("chave", "reunioes_agendadas").eq("ativo", true).maybeSingle();
  if (!def) throw new Error("Indicador de reuniões agendadas não cadastrado.");
  const num = (v: FormDataEntryValue | null) => Math.max(0, Number(String(v ?? "0").replace(",", ".")) || 0);
  const { error } = await supabase.from("compromisso_kpis").upsert(
    {
      profile_id: user.id,
      negocio_id: negocioId,
      data: hojeBR(),
      chave: def.chave,
      label: def.label,
      meta: num(formData.get("meta")),
      realizado: num(formData.get("realizado")),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id,negocio_id,data,chave" },
  );
  if (error) throw new Error(error.message);
  revalidatePath("/compromisso");
}

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
