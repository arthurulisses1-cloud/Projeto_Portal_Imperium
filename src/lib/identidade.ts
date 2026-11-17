import { createHmac } from "crypto";

// Identidade de um lead sem guardar dado pessoal: o telefone e as partes do nome viram códigos (HMAC) e só os
// códigos são gravados ou mantidos em cache. Serve para saber se o mesmo cliente está no Pipefácil e na Sunne.

const LIGACOES = new Set(["de", "da", "do", "das", "dos", "e", "di", "du"]);

/** Só dígitos, sem DDI do Brasil (55). Precisa de pelo menos 10 dígitos (DDD + número). */
export function normalizarTelefone(v: unknown): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  let d = String(v).replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length >= 10 ? d.slice(-11) : null;
}

/** Palavras do nome em minúsculas, sem acento e sem ligações ("de", "da"...). */
export function tokensDoNome(nome: unknown): string[] {
  if (typeof nome !== "string") return [];
  return Array.from(
    new Set(
      nome
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 3 && !LIGACOES.has(t)),
    ),
  );
}

function pimenta(): string {
  return process.env.PII_PEPPER || process.env.CRON_SECRET || "senatus-local";
}

export function codigo(valor: string): string {
  return createHmac("sha256", pimenta()).update(valor).digest("hex").slice(0, 32);
}

export type IdentidadeLead = { telefoneHash: string | null; nomeTokens: string[] };

/** Códigos do telefone e do nome (um por palavra) de um lead. */
export function identidadeDe(telefone: unknown, nome: unknown): IdentidadeLead {
  const tel = normalizarTelefone(telefone);
  return { telefoneHash: tel ? codigo("tel:" + tel) : null, nomeTokens: tokensDoNome(nome).map((t) => codigo("nome:" + t)) };
}

export type Casamento = "forte" | "provavel" | "so_telefone" | null;

/**
 * Compara dois leads: mesmo telefone E nome em comum. "forte" = telefone igual e 2 ou mais palavras do nome iguais;
 * "provável" = telefone igual e 1 palavra em comum; "só telefone" = telefone igual sem nenhuma palavra do nome em comum
 * (não conta como o mesmo lead, só aparece para conferência).
 */
export function casarLeads(a: IdentidadeLead, b: IdentidadeLead): Casamento {
  if (!a.telefoneHash || !b.telefoneHash || a.telefoneHash !== b.telefoneHash) return null;
  const nomesB = new Set(b.nomeTokens);
  const emComum = a.nomeTokens.filter((t) => nomesB.has(t)).length;
  if (emComum >= 2) return "forte";
  if (emComum === 1) return "provavel";
  return "so_telefone";
}

/** Casamentos que contam como o mesmo lead. */
export function ehOMesmoLead(c: Casamento): boolean {
  return c === "forte" || c === "provavel";
}
