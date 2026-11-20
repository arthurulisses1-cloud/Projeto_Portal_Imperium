// Cliente do discador 3C Plus (API v1). Só leitura: lista as ligações de um dia e
// conta alôs (atendida e falou com o BDR) e conexões (conversa com o BDR >= N segundos).
//
// Alô: o BDR estava na ligação e ela foi atendida. Na discagem manual o BDR está sempre na
// linha, então has_agent sozinho contava ligação que ninguém atendeu: status Falha (8) e
// Não Atendida (5) não são alô (auditoria de 16/11/2026: 71 das 118 manuais de novembro).

const BASE = "https://app.3c.plus/api/v1";

export type Ligacao3c = {
  call_date: string; // "2026-11-11 18:12:39" (horário de Brasília)
  has_agent: boolean;
  /** 4 Desligada, 5 Não Atendida, 6 Abandonada, 7 Finalizada, 8 Falha, 9/15 Caixa postal. */
  status_id?: number;
  speaking_with_agent_time: string; // "00:01:25"
  agent: string;
  agent_id?: number | null;
  /** Nome da campanha (uma por BDR, com o nome dele; ex.: "Jorge Abudi - Eventos"). */
  campaign?: string | null;
};

const STATUS_NAO_ATENDIDA = [5, 8];

/** Texto sem acento e em minúsculas, para casar nomes de campanha. */
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Usuário do Pipefácil dono da campanha: a primeira chave de `campanhas` com que o nome da campanha começa. */
export function pessoaDaCampanha(campanha: string | null | undefined, campanhas: Record<string, string>): string | null {
  if (!campanha) return null;
  const nome = normalizar(campanha);
  for (const [prefixo, pessoa] of Object.entries(campanhas)) if (nome.startsWith(normalizar(prefixo))) return pessoa;
  return null;
}

/**
 * Tentativas de cada pré-vendas: toda ligação discada (inclusive não atendida, caixa postal e as do discador
 * automático, que não têm agente), atribuída pela campanha, que é uma por BDR. Todo mapeado aparece, com zero
 * se não ligou (a gravação sobrescreve o dia inteiro). Campanha fora do mapa conta só no total do time.
 */
export function tentativasPorPessoa(ligacoes: Ligacao3c[], campanhas: Record<string, string>): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of Object.values(campanhas)) out.set(id, 0);
  for (const l of ligacoes) {
    const quem = pessoaDaCampanha(l.campaign, campanhas);
    if (quem) out.set(quem, (out.get(quem) ?? 0) + 1);
  }
  return out;
}

export function segundos(hms: string | null | undefined): number {
  if (!hms) return 0;
  const p = hms.split(":").map((x) => Number(x) || 0);
  while (p.length < 3) p.unshift(0);
  return p[0] * 3600 + p[1] * 60 + p[2];
}

/** Alôs e conexões de uma lista de ligações (pura, testada). */
export function contarAlosConexoes(ligacoes: Ligacao3c[], segundosConexao: number): { alos: number; conexoes: number } {
  let alos = 0;
  let conexoes = 0;
  for (const l of ligacoes) {
    if (l.has_agent && !STATUS_NAO_ATENDIDA.includes(Number(l.status_id))) alos += 1;
    if (segundos(l.speaking_with_agent_time) >= segundosConexao) conexoes += 1;
  }
  return { alos, conexoes };
}

/** Alôs e conexões de cada pré-vendas (agente do 3C → usuário do Pipefácil pelo `agentes`). Todo mapeado
 *  aparece, com zero se não ligou (a gravação sobrescreve o dia inteiro). */
export function contarPorPessoa(ligacoes: Ligacao3c[], segundosConexao: number, agentes: Record<number, string>): Map<string, { alos: number; conexoes: number }> {
  const out = new Map<string, { alos: number; conexoes: number }>();
  for (const id of Object.values(agentes)) out.set(id, { alos: 0, conexoes: 0 });
  const porPessoa = new Map<string, Ligacao3c[]>();
  for (const l of ligacoes) {
    const quem = l.agent_id != null ? agentes[Number(l.agent_id)] : undefined;
    if (!quem) continue;
    porPessoa.set(quem, [...(porPessoa.get(quem) ?? []), l]);
  }
  porPessoa.forEach((ls, quem) => out.set(quem, contarAlosConexoes(ls, segundosConexao)));
  return out;
}

/** Todas as ligações de um dia (YYYY-MM-DD), paginando de 1000 em 1000. */
export async function buscarLigacoesDoDia(token: string, dia: string): Promise<Ligacao3c[]> {
  const out: Ligacao3c[] = [];
  for (let page = 1; page <= 100; page++) {
    const qs = new URLSearchParams({
      start_date: `${dia} 00:00:00`,
      end_date: `${dia} 23:59:59`,
      per_page: "1000",
      page: String(page),
      api_token: token,
    });
    const res = await fetch(`${BASE}/calls?${qs}`, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) throw new Error(`3C Plus respondeu ${res.status} ao listar ligações de ${dia}`);
    const json = (await res.json()) as { data: Ligacao3c[]; meta?: { pagination?: { total_pages?: number } } };
    out.push(...(json.data ?? []));
    const total = json.meta?.pagination?.total_pages ?? 1;
    if (page >= total) break;
  }
  return out;
}
