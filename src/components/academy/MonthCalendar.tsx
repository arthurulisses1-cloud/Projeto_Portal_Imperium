"use client";

import { useMemo, useState } from "react";

export type EventoCalendario = {
  id: string;
  data: string; // YYYY-MM-DD
  tema: string;
  trilhaNome: string;
  cor: string;
  icone: string;
  marco: boolean;
  realizada: boolean;
};

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Calendário mensal de verdade (tipo Google Agenda): grade de 6 semanas,
// dias fora do mês esmaecidos, um chip colorido por trilha em cada dia que
// tem aula. Sem lib externa — é só aritmética de datas.
export default function MonthCalendar({
  eventos,
  mesInicial,
  onClickEvento,
  legenda,
}: {
  eventos: EventoCalendario[];
  mesInicial?: string; // YYYY-MM
  onClickEvento?: (id: string) => void;
  legenda?: { nome: string; cor: string; icone: string }[];
}) {
  const hoje = new Date();
  const [mes, setMes] = useState(() => {
    const base = mesInicial ? new Date(mesInicial + "-01T12:00:00") : hoje;
    return { ano: base.getFullYear(), mes: base.getMonth() };
  });

  const eventosPorDia = useMemo(() => {
    const mapa = new Map<string, EventoCalendario[]>();
    for (const ev of eventos) {
      const arr = mapa.get(ev.data) ?? [];
      arr.push(ev);
      mapa.set(ev.data, arr);
    }
    return mapa;
  }, [eventos]);

  const primeiroDiaMes = new Date(mes.ano, mes.mes, 1);
  const inicioGrade = new Date(primeiroDiaMes);
  inicioGrade.setDate(inicioGrade.getDate() - primeiroDiaMes.getDay());

  const celulas: { data: Date; iso: string; foraDoMes: boolean; hoje: boolean }[] = [];
  const cursor = new Date(inicioGrade);
  for (let i = 0; i < 42; i++) {
    const iso = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
    celulas.push({
      data: new Date(cursor),
      iso,
      foraDoMes: cursor.getMonth() !== mes.mes,
      hoje: iso === `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  // Corta a última semana se não tiver nenhum dia do mês atual (evita linha vazia)
  const semanas = [];
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7));
  while (semanas.length > 4 && semanas[semanas.length - 1].every((c) => c.foraDoMes)) semanas.pop();

  function mudarMes(delta: number) {
    setMes((m) => {
      const d = new Date(m.ano, m.mes + delta, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() };
    });
  }

  return (
    <div className="academy-cal">
      <div className="academy-cal-head">
        <button type="button" onClick={() => mudarMes(-1)} className="academy-cal-nav">‹</button>
        <h3>{MESES[mes.mes]} {mes.ano}</h3>
        <button type="button" onClick={() => mudarMes(1)} className="academy-cal-nav">›</button>
      </div>

      {legenda && legenda.length > 0 && (
        <div className="academy-cal-legenda">
          {legenda.map((l) => (
            <span key={l.nome} className="academy-cal-legenda-item">
              <span className="academy-cal-dot" style={{ background: l.cor }} />
              {l.icone} {l.nome}
            </span>
          ))}
        </div>
      )}

      <div className="academy-cal-grid academy-cal-dow">
        {DIAS_SEMANA.map((d) => (
          <div key={d} className="academy-cal-dow-cell">{d}</div>
        ))}
      </div>

      {semanas.map((semana, wi) => (
        <div key={wi} className="academy-cal-grid">
          {semana.map((cel) => {
            const evs = eventosPorDia.get(cel.iso) ?? [];
            return (
              <div key={cel.iso} className={`academy-cal-cell ${cel.foraDoMes ? "fora" : ""} ${cel.hoje ? "hoje" : ""}`}>
                <span className="academy-cal-daynum">{cel.data.getDate()}</span>
                <div className="academy-cal-evs">
                  {evs.map((ev) => (
                    <button
                      type="button"
                      key={ev.id}
                      onClick={() => onClickEvento?.(ev.id)}
                      className={`academy-cal-chip ${ev.realizada ? "realizada" : ""} ${onClickEvento ? "clicavel" : ""}`}
                      style={{ background: ev.cor + "26", borderColor: ev.cor, color: ev.cor }}
                      title={ev.tema}
                    >
                      <span>{ev.icone}</span>
                      <span className="academy-cal-chip-txt">{ev.marco ? "★ " : ""}{ev.tema}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
