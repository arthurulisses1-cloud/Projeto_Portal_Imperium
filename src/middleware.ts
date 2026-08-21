import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Repassa o pathname num header pra páginas/layouts Server Component
  // saberem em que rota estão sem precisar virar Client Component
  // (usado pra não duplicar a lateral direita no Mural, que já tem a sua própria).
  request.headers.set("x-pathname", request.nextUrl.pathname);
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /auth/redefinir-senha precisa ficar acessível SEM sessão — é a página
  // que o link de "esqueci minha senha" abre; quem clica nele ainda não
  // está logado, então sem essa exceção o middleware redirecionava pro
  // /login antes da página processar o ?code= do link (bug real, achado
  // testando o fluxo de acesso por email real em 2026-08-22).
  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/auth/redefinir-senha");
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");

  // rotas de API (ex: /api/sync) cuidam da própria autenticação (chave secreta),
  // não usam sessão de login normal — o middleware não deve interferir nelas.
  if (isApiRoute) return response;

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
