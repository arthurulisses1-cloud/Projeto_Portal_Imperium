// Porta a lógica de cálculo do mockup "Weekly de Receita" pros dados reais
// do Portal (weekly_operacoes + producao_funil), mantendo a mesma forma de
// filtrar/agrupar por período · equipe · pessoa · origem · status.

export type WeeklyOp = {
  id: string;
  data: string; // yyyy-mm-dd
  sdrId: string | null;
  sdrNome: string | null;
  closerId: string | null;
  closerNome: string | null;
  time: string | null; // nome do Exército
  valor: number;
  faturamento: number;
  origem: string | null;
  produto: string | null;
  status: string; // PAGO | CAIU | REANÁLISE | ASSINADO | DESISTIU
  cliente: string | null;
};

export type PersonInfo = {
  nome: string;
  time: string | null;
  rank: string;
  role: string;
  ativo: boolean;
  estrelas: number;
  metaMensal: number;
  ultimoPago: string | null; // data da última venda paga (pra "dias sem pago")
  d: Record<string, [number, number, number, number]>; // data -> [tentativas, alos, conexoes, entrevistas]
};

export type WeeklyState = {
  from: string;
  to: string;
  team: string | null;
  person: string | null; // profile id
  origem: string | null;
  status: "all" | "PAGO";
};

export type WeeklyDataset = {
  teams: string[];
  liderPorTime: Record<string, string>;
  ops: WeeklyOp[];
  people: Record<string, PersonInfo>;
  metaTeam: Record<string, Record<number, number>>;
  metaImp: Record<number, number>;
  lastData: string;
  // metaMensal de cada pessoa foi calculada em cima deste mês/ano — usado
  // pra proporcionar a meta individual ao tamanho do período selecionado.
  anoReferenciaMeta: number;
  mesReferenciaMeta: number;
};

export function isDiaUtil(dataISO: string): boolean {
  const dow = new Date(dataISO + "T12:00:00").getDay();
  return dow >= 1 && dow <= 5;
}

export function utilDaysInRange(from: string, to: string): number {
  let n = 0;
  const cur = new Date(from + "T12:00:00");
  const end = new Date(to + "T12:00:00");
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow >= 1 && dow <= 5) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

function utilInMonth(y: number, m: number, from: string, to: string): [number, number] {
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  let inR = 0,
    tot = 0;
  const cur = new Date(first);
  while (cur <= last) {
    const iso = cur.toISOString().slice(0, 10);
    if (cur.getDay() >= 1 && cur.getDay() <= 5) {
      tot++;
      if (iso >= from && iso <= to) inR++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return [inR, tot];
}

function metaFor(
  dataset: WeeklyDataset,
  scope: string,
  from: string,
  to: string
): { v: number; partial: boolean } {
  let sum = 0,
    partial = false;
  for (let m = 1; m <= 12; m++) {
    const base = scope === "IMP" ? dataset.metaImp[m] : (dataset.metaTeam[scope] || {})[m];
    if (!base) continue;
    const y = +from.slice(0, 4);
    const [inR, tot] = utilInMonth(y, m, from, to);
    if (inR > 0) {
      sum += (base * inR) / tot;
      if (inR < tot) partial = true;
    }
  }
  return { v: sum, partial };
}

export type ComputedTeam = {
  lider: string;
  hc: number;
  cred: number;
  pago: number;
  caiu: number;
  n: number;
  nPago: number;
  nCaiu: number;
  t: number;
  alo: number;
  conex: number;
  e: number;
  meta: { v: number; partial: boolean };
};

export type ComputedPerson = {
  nome: string;
  time: string | null;
  rank: string;
  ativo: boolean;
  estrelas: number;
  meta: number;
  ultimoPago: string | null;
  dsp: number; // dias sem pago, referência = dataset.lastData; sem histórico = 99999
  t: number;
  alo: number;
  conex: number;
  e: number;
  cred: number;
  ops: number;
  pago: number;
  nPago: number;
};

export type Computed = {
  ops: WeeklyOp[];
  people: Record<string, ComputedPerson>;
  tot: { cred: number; n: number; pago: number; nPago: number; caiu: number; nCaiu: number };
  byTeam: Record<string, ComputedTeam>;
  funnel: { t: number; alo: number; conex: number; e: number };
  byOrigem: Record<string, { cred: number; n: number }>;
  byDay: Record<string, { cred: number; n: number }>;
  byMonth: Record<number, { cred: number; n: number }>;
  meta: { v: number; partial: boolean };
  duTot: number;
  duDec: number;
  duRest: number;
};

export function compute(dataset: WeeklyDataset, S: WeeklyState): Computed {
  const { from, to, team, person, origem, status } = S;
  const passOp = (o: WeeklyOp, useTeam: boolean, usePerson: boolean) => {
    if (o.data < from || o.data > to) return false;
    if (useTeam && team && o.time !== team) return false;
    if (usePerson && person && o.sdrId !== person && o.closerId !== person) return false;
    if (origem && o.origem !== origem) return false;
    if (status === "PAGO" && o.status !== "PAGO") return false;
    return true;
  };

  const ops = dataset.ops.filter((o) => passOp(o, true, true));

  // metaMensal de cada pessoa foi calculada pro mês de referência inteiro —
  // proporciona pro tamanho do período selecionado (mesmo raciocínio da
  // meta de equipe/Império em metaFor).
  const anoRef = dataset.anoReferenciaMeta;
  const mesRef = dataset.mesReferenciaMeta;
  const inicioRef = `${anoRef}-${String(mesRef).padStart(2, "0")}-01`;
  const fimRef = `${anoRef}-${String(mesRef).padStart(2, "0")}-${String(new Date(anoRef, mesRef, 0).getDate()).padStart(2, "0")}`;
  const duRefMeta = utilDaysInRange(inicioRef, fimRef);
  const metaProp = duRefMeta ? utilDaysInRange(from, to) / duRefMeta : 0;

  function buildPeople(useTeam: boolean, usePerson: boolean, srcOps: WeeklyOp[]) {
    const out: Record<string, ComputedPerson> = {};
    for (const id in dataset.people) {
      const info = dataset.people[id];
      if (useTeam && team && info.time !== team) continue;
      if (usePerson && person && id !== person) continue;
      let t = 0,
        alo = 0,
        conex = 0,
        e = 0,
        any = false;
      for (const k in info.d) {
        if (k >= from && k <= to) {
          any = true;
          const r = info.d[k];
          t += r[0];
          alo += r[1];
          conex += r[2];
          e += r[3];
        }
      }
      if (any || info.ativo) {
        const dsp = info.ultimoPago
          ? Math.max(
              0,
              Math.round(
                (new Date(dataset.lastData + "T12:00:00").getTime() -
                  new Date(info.ultimoPago + "T12:00:00").getTime()) /
                  86400000
              )
            )
          : 99999;
        out[id] = {
          nome: info.nome,
          time: info.time,
          rank: info.rank,
          ativo: info.ativo,
          estrelas: info.estrelas,
          meta: info.metaMensal * metaProp,
          ultimoPago: info.ultimoPago,
          dsp,
          t,
          alo,
          conex,
          e,
          cred: 0,
          ops: 0,
          pago: 0,
          nPago: 0,
        };
      }
    }
    for (const o of srcOps) {
      for (const id of [o.sdrId, o.closerId]) {
        if (!id) continue;
        const p = out[id];
        if (!p) continue;
        p.cred += o.valor;
        p.ops++;
        if (o.status === "PAGO") {
          p.pago += o.valor;
          p.nPago++;
        }
      }
    }
    return out;
  }

  const baseOps = dataset.ops.filter((o) => passOp(o, false, false));
  const people = buildPeople(true, true, ops);

  const agg = (arr: WeeklyOp[]) => ({
    cred: arr.reduce((s, o) => s + o.valor, 0),
    n: arr.length,
    pago: arr.filter((o) => o.status === "PAGO").reduce((s, o) => s + o.valor, 0),
    nPago: arr.filter((o) => o.status === "PAGO").length,
    caiu: arr.filter((o) => o.status === "CAIU").reduce((s, o) => s + o.valor, 0),
    nCaiu: arr.filter((o) => o.status === "CAIU").length,
  });
  const tot = agg(ops);

  const byTeam: Record<string, ComputedTeam> = {};
  for (const tm of dataset.teams) {
    const a = agg(baseOps.filter((o) => o.time === tm));
    const basePeople = buildPeople(false, false, baseOps);
    const pl = Object.entries(basePeople)
      .filter(([id]) => dataset.people[id]?.time === tm)
      .map(([, p]) => p);
    const f = (k: "t" | "alo" | "conex" | "e") => pl.reduce((s, p) => s + p[k], 0);
    byTeam[tm] = {
      ...a,
      lider: dataset.liderPorTime[tm] || "—",
      hc: pl.length,
      t: f("t"),
      alo: f("alo"),
      conex: f("conex"),
      e: f("e"),
      meta: metaFor(dataset, tm, from, to),
    };
  }

  const funnel = { t: 0, alo: 0, conex: 0, e: 0 };
  for (const p of Object.values(people)) {
    funnel.t += p.t;
    funnel.alo += p.alo;
    funnel.conex += p.conex;
    funnel.e += p.e;
  }

  const byOrigem: Record<string, { cred: number; n: number }> = {};
  for (const o of dataset.ops) {
    if (o.data < from || o.data > to) continue;
    if (team && o.time !== team) continue;
    if (person && o.sdrId !== person && o.closerId !== person) continue;
    if (status === "PAGO" && o.status !== "PAGO") continue;
    const key = o.origem || "Sem origem";
    (byOrigem[key] = byOrigem[key] || { cred: 0, n: 0 });
    byOrigem[key].cred += o.valor;
    byOrigem[key].n++;
  }

  const byDay: Record<string, { cred: number; n: number }> = {};
  for (const o of ops) {
    (byDay[o.data] = byDay[o.data] || { cred: 0, n: 0 });
    byDay[o.data].cred += o.valor;
    byDay[o.data].n++;
  }

  const byMonth: Record<number, { cred: number; n: number }> = {};
  for (const o of dataset.ops) {
    if (team && o.time !== team) continue;
    if (person && o.sdrId !== person && o.closerId !== person) continue;
    if (origem && o.origem !== origem) continue;
    if (status === "PAGO" && o.status !== "PAGO") continue;
    const m = +o.data.slice(5, 7);
    (byMonth[m] = byMonth[m] || { cred: 0, n: 0 });
    byMonth[m].cred += o.valor;
    byMonth[m].n++;
  }

  const scope = team || "IMP";
  const meta: { v: number; partial: boolean } = person
    ? { v: (dataset.people[person]?.metaMensal || 0) * metaProp, partial: metaProp !== 1 }
    : metaFor(dataset, scope, from, to);
  const duTot = utilDaysInRange(from, to);
  const decLimite = to < dataset.lastData ? to : dataset.lastData;
  const duDec = to < from ? 0 : utilDaysInRange(from, decLimite < from ? from : decLimite);

  return {
    ops,
    people,
    tot,
    byTeam,
    funnel,
    byOrigem,
    byDay,
    byMonth,
    meta,
    duTot,
    duDec: Math.min(duDec, duTot),
    duRest: Math.max(0, duTot - duDec),
  };
}

export const BRL = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");
export const M = (v: number) => "R$ " + (v / 1e6).toFixed(2).replace(".", ",") + " M";
export const K = (v: number) => "R$ " + Math.round(v / 1000).toLocaleString("pt-BR") + " K";
export const SM = (v: number) => (Math.abs(v) >= 1e6 ? M(v) : K(v));
export const PC = (v: number) => (isFinite(v) ? (v * 100).toFixed(1).replace(".", ",") + "%" : "—");
export const PC0 = (v: number) => (isFinite(v) ? Math.round(v * 100) + "%" : "—");
export const N1 = (v: number) => v.toFixed(1).replace(".", ",");
export const dbr = (s: string) => s.slice(8, 10) + "/" + s.slice(5, 7);
