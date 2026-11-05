"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hojeBR } from "@/lib/data-br";

function valorBR(v: FormDataEntryValue | null): number {
  const bruto = String(v ?? "").trim().replace(/\s/g, "").replace(/^R\$/, "");
  // aceita 1.234,56 e 1234.56
  const normal = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
  const n = Number(normal);
  return Number.isFinite(n) ? n : 0;
}

/** Registra uma venda/recebimento de um negócio. Quem pode (Diretor ou Head do
 *  negócio) é garantido pela RLS; aqui só validamos os dados. */
export async function lancarVenda(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const slug = String(formData.get("negocio_slug") ?? "");
  const vendedorId = String(formData.get("vendedor_id") ?? "");
  const valor = valorBR(formData.get("valor"));
  const data = String(formData.get("data") ?? "") || hojeBR();
  const cliente = String(formData.get("cliente") ?? "").trim() || null;
  const produto = String(formData.get("produto") ?? "").trim() || null;
  const observacao = String(formData.get("observacao") ?? "").trim() || null;
  const indicadorId = String(formData.get("indicador_id") ?? "") || null;

  if (!slug || !vendedorId) throw new Error("Escolha o negócio e o vendedor.");
  if (!(valor > 0)) throw new Error("Informe um valor maior que zero.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > hojeBR()) throw new Error("Data inválida (não pode ser futura).");

  const { data: negocio } = await supabase.from("negocios").select("id, status").eq("slug", slug).maybeSingle();
  if (!negocio || negocio.status !== "ativo") throw new Error("Negócio inválido ou arquivado.");

  const { data: vinc } = await supabase
    .from("profile_negocios")
    .select("cargo")
    .eq("profile_id", vendedorId)
    .eq("negocio_id", negocio.id)
    .maybeSingle();
  if (!vinc) throw new Error("Esse vendedor não pertence ao negócio escolhido.");

  const papel = ["sdr", "bdr", "pre_vendas"].includes(vinc.cargo) ? "sdr" : "closer";

  const { error } = await supabase.from("vendas").insert({
    profile_id: vendedorId,
    tipo: "individual",
    valor,
    data,
    origem: "lancamento manual",
    cliente,
    produto,
    observacao,
    indicador_id: indicadorId && indicadorId !== vendedorId ? indicadorId : null,
    papel,
    negocio_id: negocio.id,
    lancamento_manual: true,
    lancado_por: user.id,
  });
  if (error) throw new Error("Não foi possível lançar: " + error.message);

  revalidatePath("/lancar-vendas");
  revalidatePath("/");
  redirect(`/lancar-vendas?negocio=${slug}&ok=1`);
}

export async function excluirVendaManual(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const slug = String(formData.get("negocio_slug") ?? "");
  if (!id) throw new Error("Lançamento inválido.");
  const { error } = await supabase.from("vendas").delete().eq("id", id).eq("lancamento_manual", true);
  if (error) throw new Error(error.message);
  revalidatePath("/lancar-vendas");
  revalidatePath("/");
  redirect(`/lancar-vendas?negocio=${slug}`);
}
