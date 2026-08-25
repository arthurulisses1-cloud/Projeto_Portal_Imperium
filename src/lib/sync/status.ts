import type { SupabaseClient } from "@supabase/supabase-js";

// Última vez que a sync rodou com SUCESSO (status "ok") — usado pra
// mostrar "Última sync em HH:MM" perto do botão manual, tanto pra
// confirmar que o automático (GitHub Actions/cron do Vercel) está
// rodando de verdade quanto pra saber se os dados na tela são recentes.
export async function buscarUltimaSyncOk(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from("sync_log")
    .select("executado_em")
    .eq("status", "ok")
    .order("executado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.executado_em ?? null;
}
