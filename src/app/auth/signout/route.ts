import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303, não o 307 padrão do redirect(): o form que chama essa rota é um POST puro
  // (não um Server Action), e um 307 manda o browser reenviar POST pra /login — que
  // só existe como página (GET). Isso derrubava a navegação em produção ("esta
  // página não está funcionando"); um F5 seguinte já é um GET normal e "resolvia".
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
