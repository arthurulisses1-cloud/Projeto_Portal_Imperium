import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ViewerContext = {
  authUserId: string; // sessão real (auth.uid()) — sempre usar esse pra escrever/RLS
  effectiveId: string; // perfil que a página deve tratar como "o usuário" (pode ser outra pessoa em pré-visualização)
  effectiveRole: string;
  effectiveNome: string;
  isPreview: boolean;
  realRole: string;
};

// Diretor pode pré-visualizar telas pessoais (Forecast, Minha Produção,
// Comissão etc.) como se fosse outra pessoa específica — sem senha, sem
// impersonar a sessão de verdade. Funciona porque profiles/producao_funil/
// vendas/weekly_operacoes já dão leitura total pro Diretor via RLS; só a
// LÓGICA de "de quem são esses dados" muda pro perfil escolhido.
// NUNCA usar isPreview pra permitir ESCREVER como a pessoa pré-visualizada —
// escrita sempre deve checar authUserId contra a sessão real.
export async function getViewerContext(supabase: SupabaseClient): Promise<ViewerContext | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: realProfile } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .single();
  if (!realProfile) return null;

  if (realProfile.role === "diretor") {
    const cookieStore = await cookies();
    const previewId = cookieStore.get("preview_profile_id")?.value;
    if (previewId) {
      const { data: previewProfile } = await supabase
        .from("profiles")
        .select("id, role, full_name")
        .eq("id", previewId)
        .single();
      if (previewProfile) {
        return {
          authUserId: user.id,
          effectiveId: previewProfile.id,
          effectiveRole: previewProfile.role,
          effectiveNome: previewProfile.full_name,
          isPreview: true,
          realRole: "diretor",
        };
      }
    }
  }

  return {
    authUserId: user.id,
    effectiveId: user.id,
    effectiveRole: realProfile.role,
    effectiveNome: realProfile.full_name,
    isPreview: false,
    realRole: realProfile.role,
  };
}
