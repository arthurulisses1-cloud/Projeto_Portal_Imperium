import { createClient } from "@supabase/supabase-js";

// Cliente com service_role — ignora RLS. Só pode ser usado em código que
// roda no servidor (rotas de API, jobs), NUNCA importado por um componente
// cliente. A chave nunca é exposta ao navegador (sem prefixo NEXT_PUBLIC_).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
