import { ehFimDeSemana, paraDataUTC } from "@/lib/data-br";

// Regras de cobrança de atualização e de rotação de leads parados — pedido
// do Diretor, 2026-10-09. Só lógica pura (sem banco), usada pelo menu lateral,
// pelo Mural, pela tela de Leads e pela rotação automática do sync.

// Etapas em que o closer é cobrado a atualizar o status do lead.
export const ETAPAS_COBRADAS = new Set(["fechamento", "subido", "ccb_enviada"]);

// Etapas "abertas": o lead ainda pode virar venda e portanto pode estagnar.
export const ETAPAS_ABERTAS = new Set([
  "validacao_entrevista",
  "entrevista_validada",
  "fechamento",
  "subido",
  "ccb_enviada",
]);

export const DIAS_ATE_ROTACIONAR = 30;
export const DIAS_PRIMEIRA_COBRANCA_SUBIDO = 1; // compliance responde em ~24h
export const DIAS_ENTRE_COBRANCAS = 2;
export const DIAS_PRAZO_PENDENCIA = 7;

export type LeadCobravel = {
  id: string;
  lead_nome: string;
  status_followup: string;
  em_reanalise: boolean;
  closer_profile_id: string | null;
  rot_responsavel_id: string | null;
  rot_fase: string | null;
  rot_desde: string | null;
  rot_primeiro_toque_em: string | null;
  subido_em: string | null;
  status_em: string | null;
  ultima_atualizacao_em: string | null;
  ultimo_movimento_em: string | null;
  compliance_comportamento: string | null;
  pendencia_prazo: string | null;
};

export type Cobranca =
  | { tipo: "pendencia_vencida"; dias: number }
  | { tipo: "atualizar_status"; dias: number }
  | { tipo: "recuperacao_nova"; dias: number };

export function dataBR(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function diasEntre(de: string, ate: string): number {
  return Math.round((paraDataUTC(ate).getTime() - paraDataUTC(de).getTime()) / 86400000);
}

// Quem responde pelo lead agora: na rotação é quem recebeu; fora dela, o
// closer original.
export function responsavelDoLead(l: Pick<LeadCobravel, "rot_responsavel_id" | "closer_profile_id">): string | null {
  return l.rot_responsavel_id ?? l.closer_profile_id;
}

// Sábado e domingo não geram cobrança (mesmo critério de Compromisso).
export function cobrancaDoLead(l: LeadCobravel, hoje: string): Cobranca | null {
  if (ehFimDeSemana(hoje)) return null;
  if (l.em_reanalise) return null; // reanálise tem o próprio lembrete (data do Jurídico)
  if (l.compliance_comportamento === "queda") return null;
  if (!ETAPAS_ABERTAS.has(l.status_followup)) return null;

  // Lead que acabou de chegar pra recuperação: cobra o primeiro contato de
  // diagnóstico até alguém registrar o primeiro toque.
  if (l.rot_fase && !l.rot_primeiro_toque_em && l.rot_desde) {
    return { tipo: "recuperacao_nova", dias: Math.max(0, diasEntre(l.rot_desde, hoje)) };
  }

  if (!ETAPAS_COBRADAS.has(l.status_followup)) return null;

  if (l.status_followup !== "fechamento" && l.compliance_comportamento === "pendencia" && l.pendencia_prazo && l.pendencia_prazo < hoje) {
    return { tipo: "pendencia_vencida", dias: diasEntre(l.pendencia_prazo, hoje) };
  }

  const base = l.ultima_atualizacao_em
    ? dataBR(l.ultima_atualizacao_em)
    : l.status_followup === "subido" && l.subido_em
      ? l.subido_em
      : l.status_em
        ? dataBR(l.status_em)
        : null;
  if (!base) return null;

  const limite =
    l.status_followup === "subido" && !l.ultima_atualizacao_em ? DIAS_PRIMEIRA_COBRANCA_SUBIDO : DIAS_ENTRE_COBRANCAS;
  const dias = diasEntre(base, hoje);
  return dias >= limite ? { tipo: "atualizar_status", dias } : null;
}

// ---------- Rotação ----------

export type LeadRotacionavel = {
  status_followup: string;
  em_reanalise: boolean;
  compliance_comportamento: string | null;
  closer_profile_id: string | null;
  ultimo_movimento_em: string | null;
  rot_desde: string | null;
  rot_fase: string | null;
  rot_tentaram: string[];
};

export function deveRotacionar(l: LeadRotacionavel, hoje: string): boolean {
  if (!ETAPAS_ABERTAS.has(l.status_followup)) return false;
  if (l.em_reanalise) return false;
  if (l.compliance_comportamento === "queda") return false;
  if (!l.closer_profile_id) return false;

  const refs = [l.ultimo_movimento_em ? dataBR(l.ultimo_movimento_em) : null, l.rot_desde].filter((x): x is string => !!x);
  if (refs.length === 0) return false;
  const maisRecente = refs.sort()[refs.length - 1];
  return diasEntre(maisRecente, hoje) >= DIAS_ATE_ROTACIONAR;
}

// Fila de closers: ignora o original e quem já tentou; entre os restantes
// escolhe o com menos leads em diagnóstico no momento (desempate por id, pra
// ser determinístico). Se todos já tentaram, a lista de tentativas zera e o
// ciclo recomeça.
export function escolherProximoCloser(
  l: Pick<LeadRotacionavel, "closer_profile_id" | "rot_tentaram">,
  closersAtivos: string[],
  cargaPorCloser: Map<string, number>
): { id: string; zerouTentativas: boolean } | null {
  const elegiveis = closersAtivos.filter((id) => id !== l.closer_profile_id);
  if (elegiveis.length === 0) return null;
  let candidatos = elegiveis.filter((id) => !l.rot_tentaram.includes(id));
  let zerou = false;
  if (candidatos.length === 0) {
    candidatos = elegiveis;
    zerou = true;
  }
  candidatos.sort((a, b) => (cargaPorCloser.get(a) ?? 0) - (cargaPorCloser.get(b) ?? 0) || a.localeCompare(b));
  return { id: candidatos[0], zerouTentativas: zerou };
}
