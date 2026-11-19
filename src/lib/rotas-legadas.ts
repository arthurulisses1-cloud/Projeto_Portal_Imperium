// Sistema antigo da Matri (tribos, exércitos, plano de carreira, estrelas, marcos, ranking, campanhas...): desativado em 2026-11-19
// por decisão do Diretor. As telas ficam escondidas e bloqueadas (o código e os dados continuam guardados, dá para religar).
// Continuam no ar: histórico financeiro (DRE antiga, Fechamento e Comissão até outubro/2026), Imperium Academy,
// Gestão de Pessoas e Meu Legado.

/** Religa as telas e os blocos do sistema antigo. Deixe false. */
export const MATRI_ANTIGO_ATIVO = false;

/** Rotas do sistema antigo que redirecionam para o Mural. */
export const ROTAS_LEGADAS = [
  "/tribo",
  "/exercito",
  "/carreira",
  "/estrelas",
  "/marcos",
  "/ranking",
  "/recordes",
  "/trilha",
  "/campanhas",
  "/minha-producao",
  "/weekly",
  "/forecast",
  "/parceiros",
  "/visao-diaria",
  "/fechamento-semanal",
  "/pace",
  "/contestacoes",
  "/validacao",
  "/aprovacoes",
];

/** O caminho é de uma rota do sistema antigo (a própria rota ou uma sub-rota; "/pace" não pega "/pace-negocio")? */
export function ehRotaLegada(pathname: string): boolean {
  if (MATRI_ANTIGO_ATIVO) return false;
  return ROTAS_LEGADAS.some((r) => pathname === r || pathname.startsWith(r + "/"));
}
