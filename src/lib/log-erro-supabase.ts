// Padrão do projeto até aqui: `const { data } = await supabase.from(...)...`
// e usar `(data ?? [])` direto — quando a query falha (RLS bloqueando,
// coluna renomeada, migration pendente), o erro nunca aparece em lugar
// nenhum, só vira "0" ou "lista vazia" na tela. Já causou bug real (ver
// memória "Weekly/Forecast arquitetura": Guerra Civil/Guerra de Tribos
// sumindo pra SDR/Closer por causa de RLS restrita, sem nenhum log).
//
// Uso: passa o `error` de QUALQUER resposta do supabase-js junto com um
// contexto curto — loga no console do servidor (visível nos logs do host)
// sem quebrar a página (mantém o comportamento de "cai pra vazio", só que
// agora com rastro). Não faz nada se `error` for null/undefined.
export function logErroSupabase(contexto: string, error: { message: string; code?: string } | null | undefined) {
  if (!error) return;
  console.error(`[supabase] ${contexto}: ${error.message}${error.code ? ` (code=${error.code})` : ""}`);
}
