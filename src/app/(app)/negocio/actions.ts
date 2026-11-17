"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarNegociosVisiveis } from "@/lib/negocios";
import { CRM_POR_NEGOCIO, TRESC_POR_NEGOCIO } from "@/lib/integracoes/config";
import { runSyncIntegracoes } from "@/lib/integracoes/run";

/** Intervalo mínimo entre duas atualizações manuais do mesmo negócio. */
const INTERVALO_MS = 2 * 60 * 1000;

export type RespostaAtualizar = { ok: boolean; mensagem: string };

/**
 * Botão "Atualizar agora" do Dashboard do Negócio: roda a sincronização (3C Plus + Pipefácil)
 * só do negócio aberto. Quem vê o dashboard do negócio pode atualizar; o service role fica no servidor.
 */
export async function atualizarRealizado(slug: string): Promise<RespostaAtualizar> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, mensagem: "Sessão expirada. Entre de novo." };
  const { data: eu } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!eu) return { ok: false, mensagem: "Perfil não encontrado." };

  const visivel = (await buscarNegociosVisiveis(supabase, user.id, eu.role)).some((n) => n.slug === slug && n.status === "ativo");
  if (!visivel) return { ok: false, mensagem: "Você não tem acesso a este negócio." };
  if (!CRM_POR_NEGOCIO[slug] && !TRESC_POR_NEGOCIO[slug]) return { ok: false, mensagem: "Este negócio ainda não tem integração." };

  // Trava simples: uma atualização manual por negócio a cada 2 minutos.
  const admin = createAdminClient();
  const chave = `manual:${slug}:ultima`;
  const { data: estado } = await admin.from("integracao_estado").select("atualizado_em").eq("chave", chave).maybeSingle();
  const desde = estado?.atualizado_em ? Date.now() - Date.parse(estado.atualizado_em) : Infinity;
  if (desde < INTERVALO_MS) {
    const seg = Math.ceil((INTERVALO_MS - desde) / 1000);
    return { ok: false, mensagem: `Acabou de ser atualizado. Tente de novo em ${seg}s.` };
  }
  await admin.from("integracao_estado").upsert({ chave, valor: { por: user.id }, atualizado_em: new Date().toISOString() });

  const r = await runSyncIntegracoes({ slugs: [slug], criarVendas: true, origem: `manual:${slug}` });
  revalidatePath("/negocio");
  if (!r.ok) {
    console.error("atualizarRealizado:", r.erros);
    return { ok: false, mensagem: "Parte da atualização falhou (3C Plus ou Pipefácil). Os dados que deram certo já foram gravados." };
  }
  return { ok: true, mensagem: "Atualizado." };
}
