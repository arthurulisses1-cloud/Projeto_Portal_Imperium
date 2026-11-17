import { identidadeDe, type IdentidadeLead } from "@/lib/identidade";
import type { ContatoPipefacil, DealPipefacil } from "./pipefacil";

// Telefone e nome dos contatos de um lead do Pipefácil, só para gerar os códigos de identidade (identidade.ts).
// A API documenta o contato como { id, phone, name, ... }; o item do lead traz `contact` (objeto livre) e, quando
// ele não traz o telefone, buscamos o contato pelo id na lista de contatos.

const CHAVES_TELEFONE = ["phone", "telefone", "phoneNumber", "whatsapp", "mobile", "celular"];

function texto(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v;
  if (typeof v === "number") return String(v);
  return null;
}

/** Telefone de um objeto de contato (chaves usuais, ou a primeira posição de uma lista `phones`). */
export function telefoneDoObjeto(o: unknown): string | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  for (const k of CHAVES_TELEFONE) {
    const t = texto(r[k]);
    if (t) return t;
  }
  if (Array.isArray(r.phones)) {
    for (const p of r.phones) {
      const obj = p && typeof p === "object" ? (p as Record<string, unknown>) : null;
      const t = texto(p) ?? (obj ? texto(obj.number ?? obj.phone ?? obj.value) : null);
      if (t) return t;
    }
  }
  return null;
}

export function nomeDoObjeto(o: unknown): string | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  return texto(r.displayName) ?? texto(r.name) ?? ([texto(r.firstName), texto(r.lastName)].filter(Boolean).join(" ") || null);
}

export function idDoContato(d: Pick<DealPipefacil, "contact" | "contactId">): string | null {
  const c = d.contact as Record<string, unknown> | null | undefined;
  return texto(c?.id) ?? texto(d.contactId);
}

export type CoberturaIdentidade = { total: number; comTelefone: number; viaLead: number; viaContatos: number };

/**
 * Identidade (códigos) de cada lead, na mesma ordem. `buscarContatos` só é chamado se algum lead vier sem
 * telefone no próprio item. O nome reúne o do lead, o do contato e o da empresa.
 */
export async function identidadesDosDeals(
  deals: DealPipefacil[],
  buscarContatos: () => Promise<ContatoPipefacil[]>,
): Promise<{ lista: IdentidadeLead[]; cobertura: CoberturaIdentidade }> {
  const faltaTelefone = deals.some((d) => !telefoneDoObjeto(d.contact));
  let contatos = new Map<string, ContatoPipefacil>();
  if (faltaTelefone) {
    try {
      contatos = new Map((await buscarContatos()).map((c) => [c.id, c]));
    } catch (e) {
      console.error("identidadesDosDeals: lista de contatos indisponível:", e);
    }
  }
  const cobertura: CoberturaIdentidade = { total: deals.length, comTelefone: 0, viaLead: 0, viaContatos: 0 };
  const lista = deals.map((d) => {
    let telefone = telefoneDoObjeto(d.contact);
    let contato = d.contact as unknown;
    if (telefone) cobertura.viaLead++;
    else {
      const id = idDoContato(d);
      const c = id ? contatos.get(id) : undefined;
      if (c) {
        telefone = telefoneDoObjeto(c);
        contato = c;
        if (telefone) cobertura.viaContatos++;
      }
    }
    if (telefone) cobertura.comTelefone++;
    const nomes = [d.name, nomeDoObjeto(contato), d.company?.name].filter((n): n is string => !!n).join(" ");
    return identidadeDe(telefone, nomes);
  });
  return { lista, cobertura };
}
