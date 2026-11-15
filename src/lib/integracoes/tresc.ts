// Cliente do discador 3C Plus (API v1). Só leitura: lista as ligações de um dia e
// conta alôs (atendida e falou com o BDR) e conexões (conversa com o BDR >= N segundos).

const BASE = "https://app.3c.plus/api/v1";

export type Ligacao3c = {
  call_date: string; // "2026-11-11 18:12:39" (horário de Brasília)
  has_agent: boolean;
  speaking_with_agent_time: string; // "00:01:25"
  agent: string;
};

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
    if (l.has_agent) alos += 1;
    if (segundos(l.speaking_with_agent_time) >= segundosConexao) conexoes += 1;
  }
  return { alos, conexoes };
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
