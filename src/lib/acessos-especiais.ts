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
