"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { COOKIE_NEGOCIO, NEGOCIO_TODOS } from "@/lib/negocios";

/** Troca o negócio em foco. A validação real (se a pessoa pode ver aquele
 *  negócio) acontece no layout, que ignora cookie de negócio não permitido. */
export async function trocarNegocio(slug: string) {
  const cookieStore = await cookies();
  const limpo = /^[a-z0-9-]{1,40}$/.test(slug) ? slug : NEGOCIO_TODOS;
  cookieStore.set(COOKIE_NEGOCIO, limpo, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}
