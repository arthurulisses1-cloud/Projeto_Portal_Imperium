"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const PAPEIS_VALIDOS = ["diretor", "lider", "closer", "sdr"];

export async function definirVisualizacao(formData: FormData) {
  const papel = String(formData.get("papel") ?? "diretor");
  const cookieStore = await cookies();

  if (PAPEIS_VALIDOS.includes(papel)) {
    cookieStore.set("view_role", papel, { path: "/", maxAge: 60 * 60 * 24 * 30 });
  }

  revalidatePath("/", "layout");
}
