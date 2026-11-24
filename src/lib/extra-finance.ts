// "Extra" do Vorp Finance: vendas do fundo do Matri em que não houve ninguém do time do Finance (nem como dono, nem como participante).
// Ficam fora do Recebido e da meta do time. Venda de outro fundo do grupo (Addebtare, Adianta Jus...) conta no Recebido.
import { createAdminClient } from "@/lib/supabase/admin";
import { ehFundoMatri } from "@/lib/comissao-negocio";

export type VendaParaExtra = { id: string; profile_id: string | null; indicador_id?: string | null };

/** A venda é Extra? (pura) `fundoMatri` = ids das vendas cujo lead é do fundo do Matri; `time` = membros do Finance. */
export function ehVendaExtra(v: VendaParaExtra, time: ReadonlySet<string>, fundoMatri: ReadonlySet<string>): boolean {
  if (!fundoMatri.has(v.id)) return false;
  const timeNaVenda = (v.profile_id && time.has(v.profile_id)) || (v.indicador_id && time.has(v.indicador_id));
  return !timeNaVenda;
}

/** Ids das vendas (entre as dadas) cujo lead de origem é do fundo do Matri. Lido com o admin: a RLS não pode esconder venda de ninguém. */
export async function vendasDoFundoMatri(ids: string[]): Promise<Set<string>> {
  const resultado = new Set<string>();
  if (ids.length === 0) return resultado;
  try {
    const { data, error } = await createAdminClient()
      .from("entrevistas_leads")
      .select("venda_id, fundo_destino, sub_mesmo_fundo, sub_fundo_novo")
      .in("venda_id", ids);
    if (error) return resultado;
    for (const l of data ?? []) {
      if (ehFundoMatri(l.fundo_destino as string | null, l.sub_mesmo_fundo as boolean | null, l.sub_fundo_novo as string | null)) resultado.add(l.venda_id as string);
    }
  } catch (e) {
    console.error("vendasDoFundoMatri indisponível:", e);
  }
  return resultado;
}
