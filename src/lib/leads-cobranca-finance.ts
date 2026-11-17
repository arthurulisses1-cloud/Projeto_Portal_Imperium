import { ehFimDeSemana } from "@/lib/data-br";
import { dataBR, diasEntre, type Cobranca } from "@/lib/leads-cobranca";

// Lembretes dos leads do Vorp Finance (2026-11-17). Sem rodízio: o lead fica com quem o subiu; o sistema só
// lembra de atualizar o que está parado e cobra quem precisa aprovar uma venda. Só lógica pura.

export const DIAS_ATUALIZAR_ENTREVISTA = 2; // entrevista sem avançar
export const DIAS_ATUALIZAR_SUBIDO = 2; // subido ou pendência sem atualização
export const DIAS_APROVAR_VENDA = 1; // venda aguardando aprovação do Head
export const DIAS_ESTAGNADO = 7; // qualquer etapa aberta sem movimento
export const DIAS_ESCALA_HEAD = 4; // o Head também é avisado do que é dos outros a partir daqui

export type LeadFinanceCobravel = {
  id: string;
  lead_nome: string;
  status_followup: string;
  data: string;
  status_em: string | null;
  ultimo_movimento_em: string | null;
  ultima_atualizacao_em: string | null;
  sdr_profile_id: string | null;
  closer_profile_id: string | null;
};

/** Último sinal de vida do lead (data BR): movimento, atualização, mudança de status ou a própria entrevista. */
export function ultimoSinal(l: LeadFinanceCobravel): string {
  const datas = [l.ultimo_movimento_em, l.ultima_atualizacao_em, l.status_em].filter((x): x is string => !!x).map(dataBR);
  datas.push(l.data);
  return datas.sort()[datas.length - 1];
}

/**
 * Lembrete de um lead do Finance. `aprovador` = quem aprova vendas (Head): ele é cobrado pela venda
 * aguardando aprovação; o executivo não é cobrado por ela (está esperando). Fim de semana não cobra.
 */
export function cobrancaFinance(l: LeadFinanceCobravel, hoje: string, aprovador: boolean): Cobranca | null {
  if (ehFimDeSemana(hoje)) return null;
  const dias = diasEntre(ultimoSinal(l), hoje);

  if (l.status_followup === "venda_pendente") {
    return aprovador && dias >= DIAS_APROVAR_VENDA ? { tipo: "aprovar_venda", dias } : null;
  }
  if (dias >= DIAS_ESTAGNADO) return { tipo: "estagnado", dias };
  const limite = l.status_followup === "validacao_entrevista" ? DIAS_ATUALIZAR_ENTREVISTA : DIAS_ATUALIZAR_SUBIDO;
  return dias >= limite ? { tipo: "atualizar_status", dias } : null;
}
