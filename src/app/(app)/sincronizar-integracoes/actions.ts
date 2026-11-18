"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CRM_POR_NEGOCIO, TRESC_POR_NEGOCIO } from "@/lib/integracoes/config";
import { runSyncIntegracoes } from "@/lib/integracoes/run";

export type RespostaSincronizarTudo = { ok: boolean; mensagem: string; erros: string[]; negocios: number };

/**
 * Botão do Diretor: sincroniza de uma vez todas as integrações dos negócios (3C Plus + Pipefácil e, no Energy, a Sunne).
 * Os negócios de sincronização separada (Energy) rodam em paralelo com os demais, cada um com a sua leitura.
 */
export async function sincronizarTodasIntegracoes(): Promise<RespostaSincronizarTudo> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, mensagem: "Sessão expirada. Entre de novo.", erros: [], negocios: 0 };
  const { data: eu } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (eu?.role !== "diretor") return { ok: false, mensagem: "Só o Diretor sincroniza todas as integrações.", erros: [], negocios: 0 };

  const todos = Array.from(new Set([...Object.keys(TRESC_POR_NEGOCIO), ...Object.keys(CRM_POR_NEGOCIO)]));
  const separados = todos.filter((s) => CRM_POR_NEGOCIO[s]?.syncSeparado);
  const juntos = todos.filter((s) => !CRM_POR_NEGOCIO[s]?.syncSeparado);

  // Os caches da Sunne e da Api4com expiram em minutos; invalida para o dashboard já ler o dado novo.
  revalidateTag("sunne");
  revalidateTag("api4com");

  const grupos = [juntos, ...separados.map((s) => [s])].filter((g) => g.length > 0);
  const resultados = await Promise.allSettled(grupos.map((g) => runSyncIntegracoes({ negocios: g, criarVendas: true, origem: "manual:todas" })));

  const erros: string[] = [];
  for (const r of resultados) {
    if (r.status === "rejected") erros.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    else if (Array.isArray(r.value.erros)) erros.push(...(r.value.erros as string[]));
  }

  revalidatePath("/");
  revalidatePath("/negocio");
  revalidatePath("/pace");
  revalidatePath("/comissao-negocio");
  return {
    ok: erros.length === 0,
    mensagem: erros.length === 0 ? "Todas as integrações atualizadas." : "Parte da atualização falhou. O que deu certo já foi gravado.",
    erros,
    negocios: todos.length,
  };
}
