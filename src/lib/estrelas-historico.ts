import type { SupabaseClient } from "@supabase/supabase-js";
import { NEXT_RANK, STAR_PACE, perdaDoMes, inicioSemanaISO, type Rank } from "@/lib/carreira";

export type PessoaEstrelas = {
  id: string;
  nome: string;
  role: string;
  rank: Rank;
  starsTotal: number;
  triboNome: string | null;
};

export type DeltaMensal = { ganho: number; perda: number; delta: number; totalPago: number };

// "YYYY-MM" dos últimos `meses` meses, do mais antigo pro mais recente
// (inclui o mês corrente, parcial).
export function ultimosMesesChaves(meses: number, refISO: string): string[] {
  const [ano, mes] = refISO.slice(0, 7).split("-").map(Number);
  const chaves: string[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1));
    chaves.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return chaves;
}

// Reconstrói, pra cada pessoa (sdr/closer), o delta de estrela (ganho
// semanal em pagos + perda mensal por faixa de R$) mês a mês — mesma regra
// usada na auditoria de agosto/2026 (ver STAR_PACE/PERDA_MENSAL em
// carreira.ts). Não existe uma tabela de histórico de stars_total — isso
// reconstrói a progressão a partir dos dados brutos de venda, então NÃO
// reflete ajustes manuais feitos fora dessa fórmula.
export async function buscarHistoricoEstrelas(
  supabase: SupabaseClient,
  pessoas: PessoaEstrelas[],
  meses: string[] // "YYYY-MM", ordenado do mais antigo pro mais recente
): Promise<Map<string, Map<string, DeltaMensal>>> {
  if (pessoas.length === 0 || meses.length === 0) return new Map();

  const desde = `${meses[0]}-01`;
  const [anoAte, mesAte] = meses[meses.length - 1].split("-").map(Number);
  const ate = new Date(Date.UTC(anoAte, mesAte, 0)).toISOString().slice(0, 10);

  const ids = pessoas.map((p) => p.id);
  const { data: vendasBrutas } = await supabase
    .from("vendas")
    .select("profile_id, data, valor, multiplicador, papel, weekly_operacao_id")
    .in("profile_id", ids)
    .gte("data", desde)
    .lte("data", ate);

  const opIds = Array.from(new Set((vendasBrutas ?? []).map((v) => v.weekly_operacao_id).filter((id): id is string => !!id)));
  const { data: ops } = opIds.length
    ? await supabase.from("weekly_operacoes").select("id, status, pago_em").in("id", opIds)
    : { data: [] };
  const opPorId = new Map((ops ?? []).map((o) => [o.id, o]));

  const pagas = (vendasBrutas ?? [])
    .map((v) => {
      const op = v.weekly_operacao_id ? opPorId.get(v.weekly_operacao_id) : null;
      if (op && op.status !== "PAGO") return null;
      const dataRef: string = op?.pago_em ?? v.data;
      return { ...v, dataRef };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null && v.dataRef >= desde && v.dataRef <= ate);

  const resultado = new Map<string, Map<string, DeltaMensal>>();
  for (const mesChave of meses) resultado.set(mesChave, new Map());

  for (const pessoa of pessoas) {
    const proximoRank = NEXT_RANK[pessoa.rank];
    const pace = proximoRank ? STAR_PACE[proximoRank] : { cheia: 0, meia: 0 };
    const papeis = pessoa.role === "sdr" ? ["sdr", "ambos"] : ["closer", "ambos"];
    const minhas = pagas.filter((v) => v.profile_id === pessoa.id && papeis.includes(v.papel));

    for (const mesChave of meses) {
      const [ano, mes] = mesChave.split("-").map(Number);
      const primeiroDia = `${mesChave}-01`;
      const ultimoDia = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
      const doMes = minhas.filter((v) => v.dataRef >= primeiroDia && v.dataRef <= ultimoDia);

      // Ganho semanal: só semanas cuja segunda-feira cai dentro do mês.
      const porSemana = new Map<string, number>();
      for (const v of doMes) {
        const semana = inicioSemanaISO(v.dataRef);
        if (semana < primeiroDia || semana > ultimoDia) continue;
        porSemana.set(semana, (porSemana.get(semana) ?? 0) + (v.multiplicador ?? 1));
      }
      let ganho = 0;
      for (const qtd of Array.from(porSemana.values())) {
        if (pace.cheia > 0 && qtd >= pace.cheia) ganho += 1;
        else if (pace.meia > 0 && qtd >= pace.meia) ganho += 0.5;
      }

      const totalPago = doMes.reduce((s, v) => s + Number(v.valor), 0);
      const perda = perdaDoMes(pessoa.rank, totalPago);

      resultado.get(mesChave)!.set(pessoa.id, { ganho, perda, delta: ganho + perda, totalPago });
    }
  }

  return resultado;
}
