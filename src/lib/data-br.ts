// Fuso horário do Brasil (America/Sao_Paulo — sem horário de verão desde
// 2019, sempre UTC-3). O servidor roda em UTC, e o navegador de quem usa o
// Portal pode estar configurado em qualquer fuso — então `new Date()
// .toISOString().slice(0, 10)` direto (que sempre converte pra UTC) mostra
// o dia ERRADO durante boa parte da noite no Brasil: das 21h à meia-noite
// BRT, o relógio UTC já virou o dia seguinte. Perto da virada de MÊS isso
// vira bug de verdade — achado pelo Diretor, 2026-08-31, ~21h: "o sistema
// já virou pra setembro mas ainda estamos em agosto".
//
// Toda comparação de "hoje" ou "início do mês" contra uma coluna `date` do
// banco (compromissos.data, vendas.data, weekly_operacoes.data...) precisa
// passar por aqui — nunca por `new Date().toISOString()` direto. Isso NÃO
// vale pra timestamps gravados em colunas `timestamptz` (synced_at,
// updated_at, criado_em...) — UTC ali está certo, o Postgres já exibe na
// hora certa por conta própria.
export function hojeBR(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export function inicioMesBR(): string {
  return hojeBR().slice(0, 7) + "-01";
}

// Último dia do mês corrente, no calendário do Brasil — mesmo raciocínio de
// hojeBR()/inicioMesBR(), pra substituir o padrão `new Date(hoje.getFullYear(),
// hoje.getMonth() + 1, 0)` (que também dependia do fuso do runtime).
export function fimMesBR(): string {
  const [ano, mes] = hojeBR().split("-").map(Number);
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}

// Converte "YYYY-MM-DD" num Date ancorado em UTC (meia-noite UTC daquele
// dia) — usar SEMPRE que precisar fazer aritmética de calendário (dia da
// semana, ±N dias, início de semana) a partir de uma data já resolvida por
// hojeBR(). Nunca usar os getters locais (getDay/getMonth sem prefixo UTC)
// nem `new Date()` puro pra isso: ambos dependem do fuso do runtime
// (servidor ou navegador de quem tá usando o Portal), que não é
// necessariamente o Brasil. getUTCDay/setUTCDate/toISOString são
// determinísticos em qualquer runtime.
export function paraDataUTC(dataStr: string): Date {
  const [y, m, d] = dataStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
