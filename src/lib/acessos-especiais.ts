// Exceções pontuais de acesso liberadas pelo Diretor pra pessoas
// específicas, fora da regra normal de papel — não é um papel novo, é
// só uma lista curta de profile_id. Se crescer muito, vale a pena virar
// uma coluna/tabela; por ora, 2 nomes, direto no código é mais simples.

// Forecast pra SDRs que pediram visibilidade da própria produção nesse
// formato (2026-08-25) — view-only: podeEditarOperacao() já não reconhece
// papel "sdr", então o botão de editar continua bloqueado pra eles.
export const SDR_FORECAST_LIBERADO = new Set<string>([
  "b5a30ced-7309-4629-8d91-c8d1274cfc23", // Cristina Santos
  "74658908-c885-4dd1-bcd4-f44b03011f8f", // Marcus Ryquelme
]);

// RH responsável pelo checklist pré-aula da Imperium Academy (pedido do
// Diretor, 2026-09-21: "Confirmar aula com professor", "Confirmar slide",
// "Agendar sala", "Enviar arte no grupo") — qualquer uma das duas pode dar
// check numa tarefa que conste como feita pra ambas (ver moverTarefa,
// src/app/(app)/tarefas/actions.ts, e sincronizarChecklistRhDaAula).
export const ACADEMY_RH = [
  { id: "2b708a5e-f991-4ffc-a1ed-52490be68290", nome: "Alana Veras" },
  { id: "de1b99f2-e1c1-4ba7-bfa1-d3da2f28f527", nome: "Letícia Diniz" },
];

// Analista de Growth — plano de comissão próprio do Igor Lobato (pedido do
// Diretor, 2026-09-24): os outros Analistas (Alana, Letícia, Procópio) não
// têm salário nenhum na Folha/DRE — só ele, responsável por destravar o
// Inbound, e o dele é sobre a RECEITA DO CANAL (weekly_operacoes.origem =
// 'INBOUND'), não produção pessoal — ver buscarRemuneracaoGrowth em
// src/lib/remuneracao.ts e growth_tiers (migration 0088).
export const ANALISTA_GROWTH_ID = "0d3c3964-ab74-4c47-86c8-2e0639ba33b2"; // Igor Lobato
// Só conta venda do Inbound com data a partir daqui em diante — pra
// sempre, mês a mês (não é só uma regra de transição de setembro).
export const ANALISTA_GROWTH_DESDE = "2026-09-28";

// Fixo mínimo garantido por PESSOA (não por rank) — pedido do Diretor,
// 2026-09-24: "centuriões antes tinham um fixo garantido de 2300... não se
// altera pros atuais", mas com valores diferentes por pessoa. Aplicado por
// cima do fixo calculado pelo tier normal de Centurião em commission_tiers
// (nunca abaixa quem já ganha mais pelo tier — só levanta o piso de quem
// ganharia menos).
export const CENTURIAO_FIXO_GARANTIDO: Record<string, number> = {
  "860ac6e0-4573-4682-bdb6-d0e4e7da110a": 2300, // Vinícius Ferreira
  "74658908-c885-4dd1-bcd4-f44b03011f8f": 2300, // Marcus Ryquelme
  "a49f5082-5209-4ade-9f66-2c59bb7e8267": 2700, // Nicolas Roberto
};
