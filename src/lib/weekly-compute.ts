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
  statusManual: "resolvendo_pendencia" | "aguardando_pagamento" | null;
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

// "all" = assinado + pago (tudo); "PAGO" = só liquidado; "QUASE_CERTO" =
// pago + marcado "aguardando pagamento" no Forecast — a régua de "tô
// fechando esse mês", sem contar o que ainda tá em resolução de pendência.
export type WeeklyState = {
  from: string;
  to: string;
  team: string | null;
  person: string | null; // profile id
  origem: string | null;
  status: "all" | "PAGO" | "QUASE_CERTO";
};

// Nome do "time" fictício pra entrevista/assinatura/pago cujo SDR e Closer
// são de Tribos diferentes — regra do Diretor (2026-08-25): produção de uma
// Tribo só conta quando SDR e Closer são da MESMA Tribo. Usado hoje só em
// Minha Produção do Líder (ops/entrevistaEventos já vêm com esse time
// resolvido); a Weekly do Diretor (por Exército) não usa essa regra.
export const FORA_DA_TRIBO = "Fora da Tribo";

export type EntrevistaEvento = { data: string; time: string | null; quantidade: number };

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
  // Opcional: quando presente, byTeam.e/funnel.e passam a contar entrevistas
  // por este evento resolvido (SDR+Closer mesma Tribo) em vez da aproximação
  // por papel (crédito de quem não é 'sdr'). Ver FORA_DA_TRIBO.
  entrevistaEventos?: EntrevistaEvento[];
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
  pagoOuAguardando: number;
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
  role: string;
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
  tot: { cred: number; n: number; pago: number; pagoOuAguardando: number; nPago: number; caiu: number; nCaiu: number };
  byTeam: Record<string, ComputedTeam>;
  funnel: { t: number; alo: number; conex: number; e: number };
  byOrigem: Record<string, { cred: number; n: number }>;
  byDay: Record<string, { cred: number; n: number }>;
  byMonth: Record<number, { cred: number; n: number; pago: number }>;
  meta: { v: number; partial: boolean };
  duTot: number;
  duDec: number;
  duRest: number;
};

function passaStatus(o: WeeklyOp, status: WeeklyState["status"]): boolean {
  if (status === "PAGO") return o.status === "PAGO";
  if (status === "QUASE_CERTO") return o.status === "PAGO" || o.statusManual === "aguardando_pagamento";
  return true;
}

// "Crédito" = assinado e ainda válido (ou já pago) — CAIU/DESISTIU não contam,
// mesmo na visão "all". Isso é só pra somas de crédito (tot.cred, cred por
// pessoa/time/origem/dia/mês); tot.caiu/nCaiu (Taxa de queda) continuam
// vindo do conjunto CHEIO, sem esse filtro — senão a métrica de queda zera.
function contaComoCredito(o: WeeklyOp): boolean {
  return o.status !== "CAIU" && o.status !== "DESISTIU";
}

export function compute(dataset: WeeklyDataset, S: WeeklyState): Computed {
  const { from, to, team, person, origem, status } = S;
  const passOp = (o: WeeklyOp, useTeam: boolean, usePerson: boolean) => {
    if (o.data < from || o.data > to) return false;
    if (useTeam && team && o.time !== team) return false;
    if (usePerson && person && o.sdrId !== person && o.closerId !== person) return false;
    if (origem && o.origem !== origem) return false;
    if (!passaStatus(o, status)) return false;
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
          role: info.role,
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
  const opsCred = ops.filter(contaComoCredito);
  const people = buildPeople(true, true, opsCred);

  // `arr` já deve vir sem CAIU/DESISTIU pra cred/n/pago/nPago; caiu/nCaiu
  // são passados à parte, calculados sobre o conjunto CHEIO (ver contaComoCredito).
  const agg = (arr: WeeklyOp[], arrCheio: WeeklyOp[] = arr) => ({
    cred: arr.reduce((s, o) => s + o.valor, 0),
    n: arr.length,
    pago: arr.filter((o) => o.status === "PAGO").reduce((s, o) => s + o.valor, 0),
    // "Executado" pro leitor da Weekly: pago de verdade + o que já tá
    // marcado como aguardando pagamento no Forecast (assinado, faltando só
    // o dinheiro cair) — não inclui o resto do assinado ainda em aberto.
    pagoOuAguardando: arr
      .filter((o) => o.status === "PAGO" || o.statusManual === "aguardando_pagamento")
      .reduce((s, o) => s + o.valor, 0),
    nPago: arr.filter((o) => o.status === "PAGO").length,
    caiu: arrCheio.filter((o) => o.status === "CAIU").reduce((s, o) => s + o.valor, 0),
    nCaiu: arrCheio.filter((o) => o.status === "CAIU").length,
  });
  const tot = agg(opsCred, ops);

  const byTeam: Record<string, ComputedTeam> = {};
  for (const tm of dataset.teams) {
    const opsTeamCheio = baseOps.filter((o) => o.time === tm);
    const a = agg(opsTeamCheio.filter(contaComoCredito), opsTeamCheio);
    const basePeople = buildPeople(false, false, baseOps);
    const plEntries = Object.entries(basePeople).filter(([id]) => dataset.people[id]?.time === tm);
    const pl = plEntries.map(([, p]) => p);
    const f = (k: "t" | "alo" | "conex") => pl.reduce((s, p) => s + p[k], 0);
    // Entrevistas: cada uma gera crédito tanto pro SDR quanto pro Closer em
    // producao_funil (cada um vê a própria atividade) — somar todo mundo do
    // time contaria a mesma entrevista 2x. Com entrevistaEventos (Minha
    // Produção), usa a regra "mesma Tribo" de verdade; sem isso (Weekly do
    // Diretor), aproxima contando só o lado de quem conduz (Closer/Líder).
    const e = dataset.entrevistaEventos
      ? dataset.entrevistaEventos
          .filter((ev) => ev.time === tm && ev.data >= from && ev.data <= to)
          .reduce((s, ev) => s + ev.quantidade, 0)
      : plEntries.filter(([id]) => dataset.people[id]?.role !== "sdr").reduce((s, [, p]) => s + p.e, 0);
    byTeam[tm] = {
      ...a,
      lider: dataset.liderPorTime[tm] || "—",
      hc: pl.length,
      t: f("t"),
      alo: f("alo"),
      conex: f("conex"),
      e,
      meta: metaFor(dataset, tm, from, to),
    };
  }

  const funnel = { t: 0, alo: 0, conex: 0, e: 0 };
  for (const [id, p] of Object.entries(people)) {
    funnel.t += p.t;
    funnel.alo += p.alo;
    funnel.conex += p.conex;
    if (!dataset.entrevistaEventos && dataset.people[id]?.role !== "sdr") funnel.e += p.e;
  }
  // entrevistaEventos não carrega quem é a pessoa (só o par SDR+Closer já
  // resolvido em Tribo/Fora da Tribo) — só dá pra usar quando não há um
  // "person" selecionado; com pessoa selecionada, cai no fallback acima
  // (que já é por pessoa via `people`).
  if (dataset.entrevistaEventos && !person) {
    funnel.e = dataset.entrevistaEventos
      .filter((ev) => ev.data >= from && ev.data <= to && (!team || ev.time === team))
      .reduce((s, ev) => s + ev.quantidade, 0);
  }

  const byOrigem: Record<string, { cred: number; n: number }> = {};
  for (const o of dataset.ops) {
    if (o.data < from || o.data > to) continue;
    if (team && o.time !== team) continue;
    if (person && o.sdrId !== person && o.closerId !== person) continue;
    if (!passaStatus(o, status)) continue;
    if (!contaComoCredito(o)) continue;
    const key = o.origem || "Sem origem";
    (byOrigem[key] = byOrigem[key] || { cred: 0, n: 0 });
    byOrigem[key].cred += o.valor;
    byOrigem[key].n++;
  }

  const byDay: Record<string, { cred: number; n: number }> = {};
  for (const o of opsCred) {
    (byDay[o.data] = byDay[o.data] || { cred: 0, n: 0 });
    byDay[o.data].cred += o.valor;
    byDay[o.data].n++;
  }

  const byMonth: Record<number, { cred: number; n: number; pago: number }> = {};
  for (const o of dataset.ops) {
    if (team && o.time !== team) continue;
    if (person && o.sdrId !== person && o.closerId !== person) continue;
    if (origem && o.origem !== origem) continue;
    if (!passaStatus(o, status)) continue;
    if (!contaComoCredito(o)) continue;
    const m = +o.data.slice(5, 7);
    (byMonth[m] = byMonth[m] || { cred: 0, n: 0, pago: 0 });
    byMonth[m].cred += o.valor;
    byMonth[m].n++;
    if (o.status === "PAGO") byMonth[m].pago += o.valor;
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
