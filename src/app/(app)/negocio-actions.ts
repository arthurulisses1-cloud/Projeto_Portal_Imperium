"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_MODO, COOKIE_NEGOCIO, COOKIE_VISUAL, NEGOCIO_TODOS } from "@/lib/negocios";

/** Troca o negócio em foco. A validação real (se a pessoa pode ver aquele
 *  negócio) acontece no layout, que ignora cookie de negócio não permitido. */
export async function trocarNegocio(slug: string) {
  const cookieStore = await cookies();
  const limpo = /^[a-z0-9-]{1,40}$/.test(slug) ? slug : NEGOCIO_TODOS;
  cookieStore.set(COOKIE_NEGOCIO, limpo, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

/** Visual (identidade de marca) escolhido pela pessoa, independente do negócio em foco. */
export async function trocarVisual(slug: string) {
  const cookieStore = await cookies();
  const limpo = /^[a-z0-9-]{1,40}$/.test(slug) ? slug : "auto";
  cookieStore.set(COOKIE_VISUAL, limpo, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

/** Versão clara ou escura do visual (auto = padrão de cada marca). */
export async function trocarModo(modo: string) {
  const cookieStore = await cookies();
  const limpo = modo === "claro" || modo === "escuro" ? modo : "auto";
  cookieStore.set(COOKIE_MODO, limpo, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

/** Meta de recebimento do mês de um negócio (só o Diretor). */
export async function salvarMetaNegocio(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "diretor") throw new Error("Só o Diretor define a meta de recebimento.");

  const negocioId = String(formData.get("negocio_id") ?? "");
  const ano = Number(formData.get("ano"));
  const mes = Number(formData.get("mes"));
  const meta = Math.max(0, Number(String(formData.get("meta") ?? "0").replace(/\./g, "").replace(",", ".")) || 0);
  if (!negocioId || !ano || !mes) throw new Error("Dados incompletos.");

  const { error } = await supabase
    .from("metas_negocio")
    .upsert({ negocio_id: negocioId, ano, mes, meta_recebimento: meta, updated_at: new Date().toISOString() }, { onConflict: "negocio_id,ano,mes" });
  if (error) throw new Error(error.message);
  revalidatePath("/");
}
