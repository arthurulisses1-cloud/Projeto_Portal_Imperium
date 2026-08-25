"use client";

import { useEffect, useMemo, useState } from "react";
import "./weekly-dash.css";
import {
  compute,
  SM,
  K,
  PC,
  PC0,
  N1,
  dbr,
  type WeeklyDataset,
  type WeeklyState,
} from "@/lib/weekly-compute";

const MESES_NOME = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const MESES_ABREV = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function lastDayOfMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}

type Preset = { label: string; from: string; to: string };
type StatusFiltro = WeeklyState["status"];

function buildPresets(ano: number, mesAtual: number, lastData: string): Record<string, Preset> {
  const mesAnteriorNum = mesAtual === 1 ? 12 : mesAtual - 1;
  const anoMesAnterior = mesAtual === 1 ? ano - 1 : ano;
  const d30 = new Date(lastData + "T12:00:00");
  const from30 = new Date(d30);
  from30.setDate(from30.getDate() - 29);
  const triMesInicio = mesAtual >= 3 ? mesAtual - 2 : 1;
  return {
    mes: {
      label: MESES_NOME[mesAtual],
      from: `${ano}-${pad(mesAtual)}-01`,
      to: `${ano}-${pad(mesAtual)}-${pad(lastDayOfMonth(ano, mesAtual))}`,
    },
    anterior: {
      label: MESES_NOME[mesAnteriorNum],
      from: `${anoMesAnterior}-${pad(mesAnteriorNum)}-01`,
      to: `${anoMesAnterior}-${pad(mesAnteriorNum)}-${pad(lastDayOfMonth(anoMesAnterior, mesAnteriorNum))}`,
    },
    d30: { label: "Últimos 30 dias", from: from30.toISOString().slice(0, 10), to: lastData },
    tri: {
      label: "Trimestre",
      from: `${ano}-${pad(triMesInicio)}-01`,
      to: `${ano}-${pad(mesAtual)}-${pad(lastDayOfMonth(ano, mesAtual))}`,
    },
    ano: {
      label: `Ano (jan–${MESES_ABREV[mesAtual].toLowerCase()})`,
      from: `${ano}-01-01`,
      to: `${ano}-${pad(mesAtual)}-${pad(lastDayOfMonth(ano, mesAtual))}`,
    },
  };
}

const SUN = "M12 7a5 5 0 100 10 5 5 0 000-10zM12 1v3M12 20v3M3.5 3.5l2 2M18.5 18.5l2 2M1 12h3M20 12h3M3.5 20.5l2-2M18.5 5.5l2-2";
const MOON = "M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z";

function Icon({ d, size = 15 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d={d} />
    </svg>
  );
}

export default function WeeklyDashboard({
  dataset,
  anoAtual,
  eyebrow = "Weekly de Receita · Império",
  titulo = "Painel de Comando",
  rotuloEquipe = "Equipe",
}: {
  dataset: WeeklyDataset;
  anoAtual: number;
  eyebrow?: string;
  titulo?: string;
  rotuloEquipe?: string;
}) {
  const [skin, setSkin] = useState<"imperium" | "matri">("imperium");
  const [matriTheme, setMatriTheme] = useState<"dark" | "light">("dark");
  const [tab, setTab] = useState<"p1" | "p2" | "p3" | "p4" | "p5">("p1");

  const [periodKey, setPeriodKey] = useState("mes");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [team, setTeam] = useState<string | null>(null);
  const [person, setPerson] = useState<string | null>(null);
  const [origem, setOrigem] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFiltro>("all");

  useEffect(() => {
    const savedSkin = window.localStorage.getItem("weekly-skin");
    const savedTheme = window.localStorage.getItem("weekly-matri-theme");
    if (savedSkin === "imperium" || savedSkin === "matri") setSkin(savedSkin);
    if (savedTheme === "dark" || savedTheme === "light") setMatriTheme(savedTheme);
  }, []);
  useEffect(() => {
    window.localStorage.setItem("weekly-skin", skin);
  }, [skin]);
  useEffect(() => {
    window.localStorage.setItem("weekly-matri-theme", matriTheme);
  }, [matriTheme]);

  const mesAtual = new Date().getMonth() + 1;
  const presets = useMemo(() => buildPresets(anoAtual, mesAtual, dataset.lastData), [anoAtual, mesAtual, dataset.lastData]);

  const from = periodKey === "custom" ? customFrom || presets.mes.from : presets[periodKey]?.from ?? presets.mes.from;
  const to = periodKey === "custom" ? customTo || presets.mes.to : presets[periodKey]?.to ?? presets.mes.to;

  const S: WeeklyState = { from, to, team, person, origem, status };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- S é reconstruído a cada render; os campos abaixo já cobrem a reatividade real
  const C = useMemo(() => compute(dataset, S), [dataset, from, to, team, person, origem, status]);

  // O filtro de Status (Tudo/Pago/Quase certo) só deve afetar o Ritmo e os
  // KPIs do meio — as abas de baixo (Resultado, Funil, Forecast, Individual,
  // Canais) sempre mostram o consolidado real do período inteiro, senão os
  // números "descasam" entre o que a Weekly mostra ali no meio vs. embaixo
  // (pedido do Diretor, 2026-08-25).
  const SConsolidado: WeeklyState = { from, to, team, person, origem, status: "all" };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const CConsolidado = useMemo(() => compute(dataset, SConsolidado), [dataset, from, to, team, person, origem]);

  function teamOf(personId: string | null): string | null {
    if (!personId) return null;
    return dataset.people[personId]?.time ?? null;
  }

  function clickTeam(tm: string) {
    const novo = team === tm ? null : tm;
    setTeam(novo);
    if (person && teamOf(person) !== novo) setPerson(null);
  }
  function clickPerson(id: string) {
    if (person === id) {
      setPerson(null);
    } else {
      setPerson(id);
      setTeam(teamOf(id) ?? team);
    }
  }
  function clickOrigem(o: string) {
    setOrigem(origem === o ? null : o);
  }
  function limparFiltro(f: "team" | "person" | "origem" | "status" | "all") {
    if (f === "all") {
      setTeam(null);
      setPerson(null);
      setOrigem(null);
      setStatus("all");
    } else if (f === "status") setStatus("all");
    else if (f === "team") setTeam(null);
    else if (f === "person") setPerson(null);
    else if (f === "origem") setOrigem(null);
  }

  const scopeLabel = person ? dataset.people[person]?.nome ?? "—" : team || "Império";

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="weekly-dash" data-skin={skin} data-matri-theme={matriTheme}>
        <div className="wd-wrap">
          <header className="wd-head">
            <div className="wd-htitle">
              <div className="wd-eyebrow">{eyebrow}</div>
              <div className="wd-title">{titulo}</div>
              <div className="wd-sub">
                {scopeLabel} · <b>{dbr(from)} a {dbr(to)}</b> · <b>{C.duDec}</b> de {C.duTot} dias úteis
              </div>
            </div>
            <div className="wd-hright">
              {skin === "matri" && (
                <button
                  className="wd-tgl"
                  title="Alternar tema claro/escuro"
                  onClick={() => setMatriTheme(matriTheme === "dark" ? "light" : "dark")}
                >
                  <Icon d={matriTheme === "dark" ? SUN : MOON} />
                </button>
              )}
              <button
                className="wd-tgl"
                title="Alternar identidade visual"
                onClick={() => setSkin(skin === "imperium" ? "matri" : "imperium")}
              >
                {skin === "imperium" ? "IMPERIUM" : "MATRI BANK"}
              </button>
            </div>
          </header>

          <FiltroBar
            presets={presets}
            periodKey={periodKey}
            setPeriodKey={setPeriodKey}
            customFrom={customFrom}
            customTo={customTo}
            setCustomFrom={setCustomFrom}
            setCustomTo={setCustomTo}
            teams={dataset.teams}
            team={team}
            setTeam={(t) => {
              setTeam(t);
              if (person && teamOf(person) !== t) setPerson(null);
            }}
            status={status}
            setStatus={setStatus}
            rotuloEquipe={rotuloEquipe}
          />

          <Chips team={team} person={person ? dataset.people[person]?.nome ?? null : null} origem={origem} status={status} onClear={limparFiltro} />

          <Pace C={C} />

          <Kpis C={C} />

          <nav role="tablist" className="wd-nav">
            {([
              ["p1", "Resultado"],
              ["p2", "Funil"],
              ["p3", "Forecast"],
              ["p4", "Individual"],
              ["p5", "Canais & Histórico"],
            ] as const).map(([key, label]) => (
              <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </nav>

          {tab === "p1" && (
            <PanelResultado C={CConsolidado} dataset={dataset} team={team} person={person} onClickTeam={clickTeam} />
          )}
          {tab === "p2" && (
            <PanelFunil C={CConsolidado} team={team} person={person} onClickPerson={clickPerson} />
          )}
          {tab === "p3" && <PanelForecast C={CConsolidado} />}
          {tab === "p4" && <PanelIndividual C={CConsolidado} person={person} onClickPerson={clickPerson} />}
          {tab === "p5" && (
            <PanelCanais C={CConsolidado} dataset={dataset} S={SConsolidado} origem={origem} onClickOrigem={clickOrigem} />
          )}

          <footer className="mt-6 flex flex-wrap justify-between gap-3 border-t pt-3 text-[9.5px]" style={{ borderColor: "var(--line)", color: "var(--mute)" }}>
            <span>Fonte: aba Assinado + Produção (sync diário) · dados até {dbr(dataset.lastData)}</span>
            <span>Matri Bank · Imperium</span>
          </footer>
        </div>
      </div>
    </main>
  );
}

/* ---------------- Filter bar ---------------- */

function FiltroBar({
  presets, periodKey, setPeriodKey, customFrom, customTo, setCustomFrom, setCustomTo,
  teams, team, setTeam, status, setStatus, rotuloEquipe,
}: {
  presets: Record<string, Preset>;
  periodKey: string;
  setPeriodKey: (k: string) => void;
  customFrom: string;
  customTo: string;
  setCustomFrom: (v: string) => void;
  setCustomTo: (v: string) => void;
  teams: string[];
  team: string | null;
  setTeam: (t: string | null) => void;
  status: StatusFiltro;
  setStatus: (s: StatusFiltro) => void;
  rotuloEquipe: string;
}) {
  return (
    <div className="wd-fbar">
      <div className="wd-fg">
        <label>Período</label>
        <div className="wd-seg">
          {Object.entries(presets).map(([k, v]) => (
            <button key={k} aria-pressed={periodKey === k} onClick={() => setPeriodKey(k)}>
              {v.label}
            </button>
          ))}
          <button aria-pressed={periodKey === "custom"} onClick={() => setPeriodKey("custom")}>
            Personalizado
          </button>
        </div>
        {periodKey === "custom" && (
          <div className="wd-dates">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        )}
      </div>
      <div className="wd-fg">
        <label>{rotuloEquipe}</label>
        <div className="wd-seg">
          <button aria-pressed={!team} onClick={() => setTeam(null)}>Todas</button>
          {teams.map((t) => (
            <button key={t} aria-pressed={team === t} onClick={() => setTeam(t)}>{t}</button>
          ))}
        </div>
      </div>
      <div className="wd-fg">
        <label>Status</label>
        <div className="wd-seg">
          <button aria-pressed={status === "all"} onClick={() => setStatus("all")}>Assinado + pago</button>
          <button aria-pressed={status === "QUASE_CERTO"} onClick={() => setStatus("QUASE_CERTO")}>Finalizando pagamentos</button>
          <button aria-pressed={status === "PAGO"} onClick={() => setStatus("PAGO")}>Somente pago</button>
        </div>
      </div>
    </div>
  );
}

function Chips({
  team, person, origem, status, onClear,
}: {
  team: string | null;
  person: string | null;
  origem: string | null;
  status: StatusFiltro;
  onClear: (f: "team" | "person" | "origem" | "status" | "all") => void;
}) {
  const itens: [string, string, "team" | "person" | "origem" | "status"][] = [];
  if (team) itens.push(["Equipe", team, "team"]);
  if (person) itens.push(["Pessoa", person, "person"]);
  if (origem) itens.push(["Origem", origem, "origem"]);
  if (status === "PAGO") itens.push(["Status", "Somente pagos", "status"]);
  if (status === "QUASE_CERTO") itens.push(["Status", "Finalizando pagamentos", "status"]);

  if (itens.length === 0) {
    return (
      <div className="wd-chips">
        <span className="wd-chip hint">Clique em uma equipe, pessoa ou canal para cruzar os indicadores</span>
      </div>
    );
  }
  return (
    <div className="wd-chips">
      {itens.map(([k, v, f]) => (
        <span key={f} className="wd-chip">
          {k}: <b>{v}</b>
          <button aria-label="Remover filtro" onClick={() => onClear(f)}>×</button>
        </span>
      ))}
      <button className="wd-chip clr" onClick={() => onClear("all")}>Limpar filtros</button>
    </div>
  );
}

/* ---------------- Pace ---------------- */

function Pace({ C }: { C: ReturnType<typeof compute> }) {
  const { tot, meta, duTot, duDec } = C;
  const pct = meta.v > 0 ? Math.min(100, (tot.cred / meta.v) * 100) : 0;
  const pp = duTot ? (duDec / duTot) * 100 : 0;
  const esp = (meta.v * duDec) / (duTot || 1);
  const ratio = esp > 0 ? tot.cred / esp : 0;
  const falta = Math.max(0, meta.v - tot.cred);
  const rest = C.duRest;

  let tagBg = "var(--dim)", tagTxt = "SEM META", verdictTxt = " meta não definida para este recorte";
  if (meta.v) {
    if (ratio >= 1) {
      tagBg = "var(--go)"; tagTxt = "ADIANTADO";
      verdictTxt = ` ${PC0(ratio)} do ritmo necessário — sobra de ${SM(tot.cred - esp)}`;
    } else {
      tagBg = "var(--bad)"; tagTxt = "ATRASADO";
      verdictTxt = ` ${PC0(ratio)} do ritmo — déficit de ${SM(esp - tot.cred)}`;
    }
  }

  return (
    <section className="wd-pace">
      <div className="wd-pace-top">
        <div className="wd-pace-label">
          Ritmo do período — crédito assinado vs. meta de {SM(meta.v)}{meta.partial ? " (proporcional aos dias úteis)" : ""}
        </div>
        <div className="wd-pace-verdict">
          <span className="wd-tag" style={{ background: tagBg }}>{tagTxt}</span> {verdictTxt}
        </div>
      </div>
      <div className="wd-trackwrap">
        {pp < 99.5 && (
          <div className="wd-pacetag" style={{ left: `${Math.min(93, Math.max(7, pp))}%` }}>
            PACE · DIA {duDec} DE {duTot}
          </div>
        )}
        <div className="wd-track">
          <div className="wd-ticks">
            {Array.from({ length: duTot }, (_, i) => (
              <i key={i} className={i < duDec ? "past" : ""} />
            ))}
          </div>
          <div className="wd-fill" style={{ width: `${pct}%` }} />
          {pp < 99.5 && <div className="wd-paceline" style={{ left: `${pp}%` }} />}
          <div className="wd-fillnum">{SM(tot.cred)}{meta.v ? ` · ${PC0(tot.cred / meta.v)} da meta` : ""}</div>
        </div>
      </div>
      <div className="wd-pace-foot">
        {[
          ["Realizado", SM(tot.cred)],
          ["Esperado no pace", SM(esp)],
          ["Projeção do período", duDec ? SM((tot.cred / duDec) * duTot) : "—"],
          ["Falta p/ meta", SM(falta)],
          ["Necessário / dia útil", rest ? SM(falta / rest) : "—"],
        ].map(([l, v]) => (
          <div key={l} className="wd-pf">{l}<b>{v}</b></div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- KPIs ---------------- */

function Kpis({ C }: { C: ReturnType<typeof compute> }) {
  const { tot, meta, duDec, duTot } = C;
  const tkm = tot.n ? tot.cred / tot.n : 0;
  const queda = tot.cred ? tot.caiu / tot.cred : 0;
  const esp = (meta.v * duDec) / (duTot || 1);
  const proj = duDec ? (tot.cred / duDec) * duTot : 0;

  const cards = [
    { h: "Crédito assinado", v: SM(tot.cred), d: meta.v ? <span><b>{PC0(tot.cred / meta.v)}</b> da meta de {SM(meta.v)}</span> : "sem meta no recorte", c: tot.cred >= esp ? "k-go" : "k-bad" },
    { h: "Crédito pago", v: SM(tot.pago), d: <span><b>{tot.nPago}</b> de {tot.n} operações liquidadas</span>, c: "k-go" },
    { h: "Operações", v: String(tot.n), d: <span><b>{duDec ? N1(tot.n / duDec) : "0"}</b> por dia útil</span>, c: "" },
    { h: "Ticket médio", v: tkm ? K(tkm) : "—", d: <span>meta de <b>R$ 70 K</b> por operação</span>, c: tkm >= 70000 ? "k-go" : "k-warn" },
    { h: "Projeção", v: proj ? SM(proj) : "—", d: meta.v ? <span>{proj >= meta.v ? <b>acima</b> : <><b>abaixo</b></>} da meta no ritmo atual</span> : "—", c: proj >= meta.v ? "k-go" : "k-bad" },
    { h: "Taxa de queda", v: PC(queda), d: <span><b>{tot.nCaiu}</b> operações caíram · {K(tot.caiu)}</span>, c: queda > 0.15 ? "k-bad" : "k-warn" },
  ];

  return (
    <section className="wd-kpis">
      {cards.map((k) => (
        <div key={k.h} className={`wd-kpi ${k.c}`}>
          <h4>{k.h}</h4>
          <div className="v">{k.v}</div>
          <div className="d">{k.d}</div>
        </div>
      ))}
    </section>
  );
}

/* ---------------- Panel: Resultado ---------------- */

function PanelResultado({
  C, dataset, team, person, onClickTeam,
}: {
  C: ReturnType<typeof compute>;
  dataset: WeeklyDataset;
  team: string | null;
  person: string | null;
  onClickTeam: (t: string) => void;
}) {
  const { byTeam, duDec, duTot } = C;
  const out: React.ReactNode[] = [];

  if (dataset.teams.length === 2) {
    const [tA, tB] = dataset.teams;
    const a = byTeam[tA], b = byTeam[tB];
    if (a && b && a.n + b.n > 0) {
      const lead = a.cred >= b.cred ? [tA, a, tB, b] as const : [tB, b, tA, a] as const;
      out.push(
        <div key="lead" className="wd-al g">
          <div className="txt">
            <b>{lead[0]} lidera o período.</b>{" "}
            {SM(lead[1].cred)} contra {SM(lead[3].cred)} — {lead[3].cred ? `${N1(lead[1].cred / lead[3].cred)}× mais crédito` : "o outro time não registrou crédito"}.
            <em>{PC0(lead[1].meta.v ? lead[1].cred / lead[1].meta.v : 0)} da meta do período, com {lead[1].hc} pessoas ativas.</em>
          </div>
        </div>
      );
      if (a.e && b.e) {
        const eaA = a.e ? a.n / a.e : 0, eaB = b.e ? b.n / b.e : 0;
        const weak = eaA < eaB ? [tA, a, eaA, tB, b, eaB] as const : [tB, b, eaB, tA, a, eaA] as const;
        const topOk = weak[1].e >= weak[4].e;
        out.push(
          <div key="funil" className="wd-al">
            <div className="txt">
              <b>{weak[0]}: {topOk ? "o gargalo não é prospecção, é fechamento" : "a perda começa no topo do funil"}.</b>{" "}
              O time gerou {weak[1].e} entrevistas (contra {weak[4].e} do {weak[3]}) e converteu {PC0(weak[2])} delas em assinatura, contra {PC0(weak[5])}.
              <em>{topOk ? `Atividade está lá. A conversa é de técnica de fechamento com ${weak[1].lider}.` : "Volume de entrevistas abaixo do outro time — a conversa é de disciplina de prospecção."}</em>
            </div>
          </div>
        );
      }
      const apA = a.n ? a.nPago / a.n : 0, apB = b.n ? b.nPago / b.n : 0;
      if (a.n && b.n && Math.abs(apA - apB) > 0.1) {
        const w = apA < apB ? [tA, a, apA, apB] as const : [tB, b, apB, apA] as const;
        out.push(
          <div key="liq" className="wd-al w">
            <div className="txt">
              <b>A liquidação trava no {w[0]}.</b>{" "}
              {PC0(w[2])} das assinaturas viraram pago, contra {PC0(w[3])} do outro time — {w[1].nCaiu} operações caíram ({K(w[1].caiu)}).
              <em>Vale checar qualificação e documentação antes da assinatura.</em>
            </div>
          </div>
        );
      }
    }
  }
  if (person) {
    const p = C.people[person];
    if (p) {
      out.push(
        <div key="pessoa" className="wd-al g">
          <div className="txt">
            <b>{dataset.people[person]?.nome}</b> — {SM(p.cred)} em {p.ops} operações, {p.e} entrevistas ({C.duDec ? N1(p.e / C.duDec) : "0"}/dia útil) e {p.t.toLocaleString("pt-BR")} tentativas no período.
            <em>{p.rank} · {p.estrelas} estrelas.</em>
          </div>
        </div>
      );
    }
  }
  if (out.length === 0) out.push(<div key="empty" className="wd-empty">Sem operações neste recorte.</div>);

  return (
    <div>
      <div className="wd-grid2">
        {dataset.teams.map((tm) => {
          const t = byTeam[tm];
          if (!t) return null;
          const p = t.meta.v ? t.cred / t.meta.v : 0;
          const pPago = t.meta.v ? Math.min(100, (t.pago / t.meta.v) * 100) : 0;
          const pEmPagamento = Math.max(0, Math.min(100, p * 100) - pPago);
          const gap = Math.max(0, t.meta.v - t.cred);
          const sel = team === tm, dim = !!team && !sel;
          return (
            <div
              key={tm}
              className={`wd-card wd-tcard ${sel ? "sel" : ""} ${dim ? "dim" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => onClickTeam(tm)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClickTeam(tm); } }}
            >
              <div className="wd-team-h">
                <div className="wd-team-n">{tm}<small>{t.lider} · {t.hc} pessoas ativas</small></div>
                <div className="wd-team-p" style={{ color: p >= duDec / (duTot || 1) ? "var(--go)" : "var(--bad)" }}>{PC0(p)}</div>
              </div>
              <div className="wd-bar">
                <span className="wd-bar-pago" style={{ width: `${pPago}%` }} />
                <span className="wd-bar-empagamento" style={{ width: `${pEmPagamento}%` }} />
                <div className="mark" style={{ left: `${(duDec / (duTot || 1)) * 100}%` }} />
              </div>
              <div className="wd-team-meta"><span>{SM(t.cred)} de {SM(t.meta.v)}</span><span>pace: {SM((t.meta.v * duDec) / (duTot || 1))}</span></div>
              <div className="wd-team-stats">
                <div className="wd-ts">Assinaturas<b>{t.n}</b></div>
                <div className="wd-ts">Assinado<b>{SM(t.cred)}</b></div>
                <div className="wd-ts">Pago (qtd)<b>{t.nPago}</b></div>
                <div className="wd-ts">Pago<b>{SM(t.pago)}</b></div>
                <div className="wd-ts">Entrevistas<b>{t.e}</b></div>
                <div className="wd-ts">Gap p/ meta<b style={{ color: gap > 0 ? "var(--bad)" : "var(--go)" }}>{gap > 0 ? SM(gap) : "—"}</b></div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="wd-card" style={{ marginTop: 13 }}>
        <h3>Leitura do período <em>— o que os números dizem</em></h3>
        <div className="wd-alerts">{out}</div>
      </div>
    </div>
  );
}

/* ---------------- Panel: Funil ---------------- */

function PanelFunil({
  C, team, person, onClickPerson,
}: {
  C: ReturnType<typeof compute>;
  team: string | null;
  person: string | null;
  onClickPerson: (id: string) => void;
}) {
  const teams = Object.keys(C.byTeam);
  const show = team ? [team] : teams;

  const steps: [string, "t" | "alo" | "conex" | "e"][] = [
    ["Tentativas", "t"], ["Alôs", "alo"], ["Conexões", "conex"], ["Entrevistas", "e"],
  ];
  const rows = steps.map(([l, k]) => [l, show.map((n) => C.byTeam[n]?.[k] ?? 0)] as [string, number[]]);
  rows.push(["Assinaturas", show.map((n) => C.byTeam[n]?.n ?? 0)]);
  rows.push(["Pagos", show.map((n) => C.byTeam[n]?.nPago ?? 0)]);

  const conv: [string, keyof ReturnType<typeof compute>["byTeam"][string], keyof ReturnType<typeof compute>["byTeam"][string]][] = [
    ["Alô → Conexão", "conex", "alo"],
    ["Conexão → Entrevista", "e", "conex"],
    ["Entrevista → Assinatura", "n", "e"],
    ["Assinatura → Pago", "nPago", "n"],
  ];

  const pessoasList = Object.entries(C.people)
    .filter(([, p]) => p.t + p.alo + p.e > 0)
    .sort((a, b) => b[1].e - a[1].e)
    .slice(0, 10);

  return (
    <div>
      <div className="wd-card">
        <h3>Etapas do funil {person ? <em>— filtrado por pessoa</em> : <em>— {show.join(" vs. ")}</em>}</h3>
        <div className="wd-legend">
          {show.map((n) => (
            <span key={n}><i style={{ background: n === teams[0] ? "linear-gradient(90deg,var(--flame),var(--ember))" : "linear-gradient(90deg,var(--team2a),var(--team2b))" }} />{n}</span>
          ))}
        </div>
        <div className="wd-fn">
          {rows.map(([l, vals]) => {
            const mx = Math.max(...vals, 1);
            return (
              <div key={l as string} className="wd-fnrow">
                <div className="l">{l}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {vals.map((v, i) => (
                    <div key={i} className="wd-fnbar" style={{ height: show.length > 1 ? 19 : 24 }}>
                      <span className={show[i] === teams[0] ? "wd-max" : "wd-tem"} style={{ width: `${(v / mx) * 100}%` }}>
                        {v.toLocaleString("pt-BR")}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="v">{vals.reduce((a, b) => a + b, 0).toLocaleString("pt-BR")}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="wd-grid2" style={{ marginTop: 13 }}>
        <div className="wd-card">
          <h3>Conversão entre etapas <em>— onde está o gargalo</em></h3>
          <div className="wd-tblwrap">
            <table className="wd-table">
              <thead>
                <tr><th>Etapa</th>{show.map((n) => <th key={n}>{n.slice(0, 4)}.</th>)}{show.length > 1 && <th>Δ</th>}</tr>
              </thead>
              <tbody>
                {conv.map(([l, a, b]) => {
                  const vs = show.map((n) => {
                    const team = C.byTeam[n];
                    const denom = Number(team?.[b] ?? 0);
                    const numer = Number(team?.[a] ?? 0);
                    return denom ? numer / denom : NaN;
                  });
                  return (
                    <tr key={l}>
                      <td className="wd-nm">{l}</td>
                      {vs.map((v, i) => <td key={i}>{PC(v)}</td>)}
                      {show.length > 1 && (() => {
                        const dd = vs[0] - vs[1];
                        return <td><span className={`wd-pill ${!isFinite(dd) || Math.abs(dd) < 0.03 ? "wd-p-mut" : dd > 0 ? "wd-p-go" : "wd-p-bad"}`}>{isFinite(dd) ? (dd > 0 ? "+" : "") + PC(dd) : "—"}</span></td>;
                      })()}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="wd-card">
          <h3>Volume por etapa e por pessoa <em>— top atividade</em></h3>
          <div className="wd-tblwrap">
            <table className="wd-table">
              {pessoasList.length ? (
                <>
                  <thead><tr><th>Pessoa</th><th>Tent.</th><th>Alôs</th><th>Conex.</th><th>Entrev.</th><th>Ent./dia</th></tr></thead>
                  <tbody>
                    {pessoasList.map(([id, p]) => {
                      const ed = C.duDec ? p.e / C.duDec : 0;
                      return (
                        <tr key={id} className={`row ${person === id ? "sel" : ""}`} onClick={() => onClickPerson(id)}>
                          <td className="wd-nm">{p.nome}<small>{p.time || "—"}</small></td>
                          <td>{p.t.toLocaleString("pt-BR")}</td><td>{p.alo.toLocaleString("pt-BR")}</td><td>{p.conex}</td><td>{p.e}</td>
                          <td><span className={`wd-pill ${ed >= 1.5 ? "wd-p-go" : ed >= 0.75 ? "wd-p-warn" : "wd-p-bad"}`}>{N1(ed)}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </>
              ) : (
                <tbody><tr><td className="wd-empty">Sem atividade registrada.</td></tr></tbody>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Panel: Forecast ---------------- */

function PanelForecast({ C }: { C: ReturnType<typeof compute> }) {
  const { tot, meta, duRest, duDec, duTot, funnel } = C;
  const falta = Math.max(0, meta.v - tot.cred);
  const tkm = tot.n ? tot.cred / tot.n : 0;
  const proj = duDec ? (tot.cred / duDec) * duTot : 0;
  const opsNeed = tkm ? Math.ceil(falta / tkm) : 0;
  const eaConv = funnel.e ? tot.n / funnel.e : 0;
  const entrNeed = eaConv ? Math.ceil(opsNeed / eaConv) : 0;
  const ceConv = funnel.conex ? funnel.e / funnel.conex : 0;
  const conexNeed = ceConv ? Math.ceil(entrNeed / ceConv) : 0;

  const days = Object.entries(C.byDay).sort(([a], [b]) => (a < b ? -1 : 1));
  const mx = Math.max(...days.map(([, v]) => v.cred), 1);
  const slice = days.length > 24 ? days.slice(-24) : days;

  const resolvendo = C.ops.filter((o) => o.statusManual === "resolvendo_pendencia");
  const aguardando = C.ops.filter((o) => o.statusManual === "aguardando_pagamento");
  const somaResolvendo = resolvendo.reduce((s, o) => s + o.valor, 0);
  const somaAguardando = aguardando.reduce((s, o) => s + o.valor, 0);

  return (
    <div>
      <div className="wd-grid3">
        <div className="wd-card"><h3>Dias úteis restantes</h3><div className="wd-big">{duRest}</div>
          <div className="wd-bigsub">de {duTot} no período · {duDec} decorridos</div></div>
        <div className="wd-card"><h3>Falta para a meta</h3><div className="wd-big" style={{ color: "var(--flame)" }}>{SM(falta)}</div>
          <div className="wd-bigsub">{duRest ? `${SM(falta / duRest)} por dia útil restante` : "período encerrado"}</div></div>
        <div className="wd-card"><h3>Ritmo atual entrega</h3><div className="wd-big" style={{ color: proj >= meta.v ? "var(--go)" : "var(--bad)" }}>{SM(proj)}</div>
          <div className="wd-bigsub">{meta.v ? `${proj >= meta.v ? "supera" : "fica abaixo d"}a meta em ${SM(Math.abs(proj - meta.v))}` : "—"}</div></div>
      </div>
      <div className="wd-grid2" style={{ marginTop: 13 }}>
        <div className="wd-card"><h3>Resolvendo pendência</h3><div className="wd-big" style={{ color: "var(--flame)" }}>{SM(somaResolvendo)}</div>
          <div className="wd-bigsub">{resolvendo.length} operaç{resolvendo.length === 1 ? "ão" : "ões"} marcada{resolvendo.length === 1 ? "" : "s"} no Forecast</div></div>
        <div className="wd-card"><h3>Aguardando pagamento</h3><div className="wd-big" style={{ color: "var(--go)" }}>{SM(somaAguardando)}</div>
          <div className="wd-bigsub">{aguardando.length} operaç{aguardando.length === 1 ? "ão" : "ões"} · já contam em &quot;Finalizando pagamentos&quot;</div></div>
      </div>
      <div className="wd-grid2" style={{ marginTop: 13 }}>
        <div className="wd-card">
          <h3>O que falta — traduzido em atividade</h3>
          <div className="wd-tblwrap">
            <table className="wd-table">
              <thead><tr><th>Para fechar {SM(meta.v)}</th><th>Total</th><th>Por dia útil</th></tr></thead>
              <tbody>
                <tr><td className="wd-nm">Crédito a assinar</td><td>{SM(falta)}</td><td>{duRest ? SM(falta / duRest) : "—"}</td></tr>
                <tr><td className="wd-nm">Operações<small>ticket médio de {tkm ? K(tkm) : "—"}</small></td><td>{opsNeed || "—"}</td><td>{duRest && opsNeed ? N1(opsNeed / duRest) : "—"}</td></tr>
                <tr><td className="wd-nm">Entrevistas<small>conversão atual de {PC(eaConv)}</small></td><td>{entrNeed || "—"}</td><td>{duRest && entrNeed ? N1(entrNeed / duRest) : "—"}</td></tr>
                <tr><td className="wd-nm">Conexões<small>conversão atual de {PC(ceConv)}</small></td><td>{conexNeed || "—"}</td><td>{duRest && conexNeed ? N1(conexNeed / duRest) : "—"}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="wd-card">
          <h3>Crédito assinado por dia</h3>
          <div className="wd-hist">
            {slice.length ? slice.map(([d, v]) => (
              <div key={d} className="wd-hb">
                <div className="plot">
                  <div className="vl" style={{ bottom: `${(v.cred / mx) * 100}%` }}>{Math.round(v.cred / 1000)}K</div>
                  <div className="col" style={{ height: `${(v.cred / mx) * 100}%` }} />
                </div>
                <div className="lb">{dbr(d)}</div>
              </div>
            )) : <div className="wd-empty">Sem operações no período.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Panel: Individual ---------------- */

function PanelIndividual({
  C, person, onClickPerson,
}: {
  C: ReturnType<typeof compute>;
  person: string | null;
  onClickPerson: (id: string) => void;
}) {
  const list = Object.entries(C.people)
    .filter(([, p]) => p.ativo)
    .sort((a, b) => b[1].cred - a[1].cred || b[1].e - a[1].e);

  const lead = list.filter(([, p]) => p.rank !== "Legado");
  const zer = lead.filter(([, p]) => p.cred === 0);
  const par = lead.filter(([, p]) => p.dsp >= 30);
  const low = lead.filter(([, p]) => C.duDec && p.e / C.duDec < 0.5);

  const A: React.ReactNode[] = [];
  if (zer.length) A.push(<div key="zer" className="wd-al"><div className="txt"><b>{zer.length} pessoas sem crédito no período</b> — {zer.map(([, p]) => p.nome).join(", ")}.<em>Cada líder traz o plano de recuperação nome a nome nesta weekly.</em></div></div>);
  if (par.length) A.push(<div key="par" className="wd-al"><div className="txt"><b>{par.length} pessoas há 30+ dias sem pago</b> — {par.map(([, p]) => `${p.nome} (${p.dsp >= 99999 ? "nunca" : p.dsp + "d"})`).join(", ")}.<em>Mede tempo sem entregar, não esforço. Decidir entre recuperar ou substituir.</em></div></div>);
  if (low.length) A.push(<div key="low" className="wd-al w"><div className="txt"><b>{low.length} pessoas abaixo de 0,5 entrevista/dia</b> — a régua do SDR é <b>1,5/dia</b>.<em>{low.map(([, p]) => p.nome).join(", ")}. Sem entrevista não existe pipeline no mês seguinte.</em></div></div>);

  const top = list.filter(([, p]) => p.cred > 0).slice(0, 3);
  const topE = [...list].sort((a, b) => b[1].e - a[1].e).filter(([, p]) => p.e > 0).slice(0, 3);
  const T: React.ReactNode[] = [];
  if (top.length) T.push(<div key="top" className="wd-al g"><div className="txt"><b>Top produção</b> — {top.map(([, t]) => `${t.nome} (${K(t.cred)})`).join(" · ")}.<em>{top[0] ? PC0(top[0][1].cred / (C.tot.cred || 1)) : "0%"} do crédito do recorte concentrado no topo.</em></div></div>);
  if (topE.length) T.push(<div key="topE" className="wd-al g"><div className="txt"><b>Top atividade</b> — {topE.map(([, t]) => `${t.nome} (${t.e} entrevistas)`).join(" · ")}.<em>Reconhecer na weekly: atividade é o que o líder controla, resultado é consequência.</em></div></div>);
  if (C.tot.n) T.push(<div key="liq" className="wd-al g"><div className="txt"><b>Liquidação</b> — {PC0(C.tot.n ? C.tot.nPago / C.tot.n : 0)} das assinaturas viraram pago, contra meta de 60%.<em>Confirmar se o patamar se sustenta no mês seguinte antes de virar premissa.</em></div></div>);

  return (
    <div>
      <div className="wd-card">
        <h3>Produção por cabeça <em>— clique numa linha para filtrar todo o painel</em></h3>
        <div className="wd-tblwrap">
          <table className="wd-table">
            {list.length ? (
              <>
                <thead>
                  <tr><th>Pessoa</th><th>Meta</th><th>Crédito</th><th>Atingimento</th><th>Ops</th><th>Entrev.</th><th>Ent./dia</th><th>Tentativas</th><th>Dias s/ pago</th><th>Estrelas</th></tr>
                </thead>
                <tbody>
                  {list.map(([id, i]) => {
                    const at = i.meta > 0 ? i.cred / i.meta : null;
                    const ed = C.duDec ? i.e / C.duDec : 0;
                    const dc = i.dsp >= 30 ? "wd-p-bad" : i.dsp >= 15 ? "wd-p-warn" : "wd-p-go";
                    return (
                      <tr key={id} className={`row ${person === id ? "sel" : ""}`} onClick={() => onClickPerson(id)}>
                        <td className="wd-nm">{i.nome}<small>{i.time || "—"} · {i.rank}</small></td>
                        <td>{i.meta ? K(i.meta) : "—"}</td>
                        <td><b>{i.cred ? K(i.cred) : "—"}</b></td>
                        <td>{at !== null ? <><span className="wd-minibar"><span className={at >= 1 ? "ok" : ""} style={{ width: `${Math.min(100, at * 100)}%` }} /></span> {PC0(at)}</> : "—"}</td>
                        <td>{i.ops || "—"}</td>
                        <td>{i.e}</td>
                        <td><span className={`wd-pill ${ed >= 1.5 ? "wd-p-go" : ed >= 0.75 ? "wd-p-warn" : "wd-p-bad"}`}>{N1(ed)}</span></td>
                        <td>{i.t.toLocaleString("pt-BR")}</td>
                        <td><span className={`wd-pill ${dc}`}>{i.dsp >= 99999 ? "—" : i.dsp}</span></td>
                        <td>{i.estrelas ? "★".repeat(i.estrelas) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </>
            ) : (
              <tbody><tr><td className="wd-empty">Ninguém neste recorte.</td></tr></tbody>
            )}
          </table>
        </div>
      </div>
      <div className="wd-grid2" style={{ marginTop: 13 }}>
        <div className="wd-card"><h3>Precisa de atenção nesta weekly</h3><div className="wd-alerts">{A.length ? A : <div className="wd-empty">Nenhum alerta neste recorte.</div>}</div></div>
        <div className="wd-card"><h3>Destaques do período</h3><div className="wd-alerts">{T.length ? T : <div className="wd-empty">Sem destaques no recorte.</div>}</div></div>
      </div>
    </div>
  );
}

/* ---------------- Panel: Canais & Histórico ---------------- */

function PanelCanais({
  C, dataset, S, origem, onClickOrigem,
}: {
  C: ReturnType<typeof compute>;
  dataset: WeeklyDataset;
  S: WeeklyState;
  origem: string | null;
  onClickOrigem: (o: string) => void;
}) {
  const ent = Object.entries(C.byOrigem).sort((a, b) => b[1].cred - a[1].cred);
  const totOrigem = ent.reduce((s, [, v]) => s + v.cred, 0);
  const mxOrigem = Math.max(...ent.map(([, v]) => v.cred), 1);

  const months = Object.entries(C.byMonth).map(([m, v]) => [+m, v] as [number, { cred: number; n: number }]).sort((a, b) => a[0] - b[0]);
  const scope = S.team || "IMP";
  const metaM = (m: number) => (S.person ? 0 : scope === "IMP" ? dataset.metaImp[m] || 0 : dataset.metaTeam[scope]?.[m] || 0);
  const topHist = Math.max(...months.map(([m, v]) => Math.max(v.cred, metaM(m))), 1);

  const pauta: [string, string, string][] = [
    ["01 · 15 min", "Abertura de resultado", "Faturamento, crédito e pago por equipe frente à meta do Império"],
    ["02 · 20 min", "Funil por tribo", "Tentativa → conexão → entrevista → assinatura → pago"],
    ["03 · 15 min", "Forecast da semana", "O que falta e quantas entrevistas/dia isso exige"],
    ["04 · 25 min", "Indicadores individuais", "Produção por cabeça, zerados e baixa atividade"],
    ["05 · 10 min", "Bloqueios", "O que é gestão do líder vs. estruturação (advice)"],
    ["06 · 5 min", "Fechamento", "Ações da semana com dono e prazo"],
  ];

  return (
    <div>
      <div className="wd-grid2">
        <div className="wd-card">
          <h3>Origem do crédito <em>— clique para filtrar</em></h3>
          <div className="wd-fn">
            {ent.length ? ent.map(([o, v]) => (
              <div key={o} className="wd-fnrow wd-clik" role="button" tabIndex={0} style={{ opacity: origem && origem !== o ? 0.45 : 1 }} onClick={() => onClickOrigem(o)}>
                <div className="l">{o}</div>
                <div className="wd-fnbar"><span className="wd-max" style={{ width: `${(v.cred / mxOrigem) * 100}%` }}>{K(v.cred)}</span></div>
                <div className="v">{PC0(totOrigem ? v.cred / totOrigem : 0)}</div>
              </div>
            )) : <div className="wd-empty">Sem operações no período.</div>}
          </div>
        </div>
        <div className="wd-card">
          <h3>Histórico {new Date().getFullYear()} <em>— crédito assinado; tracejado = meta do mês</em></h3>
          <div className="wd-hist">
            {months.length ? months.map(([m, v]) => {
              const mt = metaM(m), ok = mt > 0 && v.cred >= mt;
              return (
                <div key={m} className="wd-hb">
                  <div className="plot">
                    <div className="vl" style={{ bottom: `${(v.cred / topHist) * 100}%` }}>{(v.cred / 1e6).toFixed(1).replace(".", ",")}M</div>
                    <div className="col" style={{ height: `${(v.cred / topHist) * 100}%`, background: ok ? "linear-gradient(180deg,var(--go),color-mix(in srgb,var(--go) 55%,#000))" : undefined }} />
                    {mt > 0 && <div className="goal" style={{ bottom: `${(mt / topHist) * 100}%` }} />}
                  </div>
                  <div className="lb">{MESES_ABREV[m]}</div>
                </div>
              );
            }) : <div className="wd-empty">Sem histórico.</div>}
          </div>
        </div>
      </div>
      <div className="wd-card" style={{ marginTop: 13 }}>
        <h3>Pauta da weekly <em>— 1h30, líderes apresentam</em></h3>
        <div className="wd-grid3">
          {pauta.map(([n, t, m]) => (
            <div key={n} className="wd-card" style={{ boxShadow: "none", borderTop: "2px solid var(--flame)" }}>
              <div style={{ fontSize: 8.5, letterSpacing: ".18em", color: "var(--flame)", fontWeight: 800 }}>{n}</div>
              <div style={{ fontSize: 12, fontWeight: 800, margin: "5px 0 4px" }}>{t}</div>
              <div style={{ fontSize: 10, color: "var(--mute)", lineHeight: 1.45 }}>{m}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
