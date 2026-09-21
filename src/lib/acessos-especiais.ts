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
