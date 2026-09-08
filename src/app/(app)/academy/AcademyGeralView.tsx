"use client";

import { useMemo, useState } from "react";
import type { Trilha, Aula } from "@/lib/academy";
import { visualDaTrilha } from "@/lib/academy-visual";
import MonthCalendar, { type EventoCalendario } from "@/components/academy/MonthCalendar";
import {
  atualizarTrilha,
  criarAula,
  atualizarAula,
  excluirAula,
  moverAula,
  definirDatasEmLote,
} from "./actions";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function fmtData(iso: string | null) {
  if (!iso) return "sem data";
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function AcademyGeralView({
  trilhas,
  todasAulas,
  instrutoresPorTrilha,
}: {
  trilhas: Trilha[];
  todasAulas: Aula[];
  instrutoresPorTrilha: Record<string, { id: string; nome: string }[]>;
}) {
  const [trilhaSelecionada, setTrilhaSelecionada] = useState<string>(trilhas[0]?.id ?? "");
  const [aulaAberta, setAulaAberta] = useState<string | null>(null);

  const trilhaPorId = useMemo(() => Object.fromEntries(trilhas.map((t) => [t.id, t])), [trilhas]);

  const eventos: EventoCalendario[] = useMemo(
    () =>
      todasAulas
        .filter((a) => a.data)
        .map((a) => {
          const trilha = trilhaPorId[a.trilhaId];
          const visual = visualDaTrilha(trilha?.nome ?? "");
          return {
            id: a.id,
            data: a.data as string,
            tema: a.tema,
            trilhaNome: trilha?.nome ?? "—",
            cor: visual.cor,
            icone: visual.icone,
            marco: a.marco,
            realizada: a.realizada,
          };
        }),
    [todasAulas, trilhaPorId]
  );

  const legenda = trilhas.map((t) => {
    const v = visualDaTrilha(t.nome);
    return { nome: t.nome, cor: v.cor, icone: v.icone };
  });

  const trilhaAtual = trilhaPorId[trilhaSelecionada];
  const aulasDaTrilha = todasAulas.filter((a) => a.trilhaId === trilhaSelecionada).sort((a, b) => a.ordem - b.ordem);
  const visualAtual = trilhaAtual ? visualDaTrilha(trilhaAtual.nome) : null;

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Imperium Academy</h1>
        <p className="text-xs text-stone-400">Academy Geral — calendário de todas as trilhas + edição de aulas.</p>
      </div>

      <MonthCalendar
        eventos={eventos}
        onClickEvento={(id) => {
          const aula = todasAulas.find((a) => a.id === id);
          if (aula) {
            setTrilhaSelecionada(aula.trilhaId);
            setAulaAberta(id);
          }
        }}
        legenda={legenda}
      />

      <section className="card-imp">
        <div className="mb-4 flex flex-wrap gap-2">
          {trilhas.map((t) => {
            const v = visualDaTrilha(t.nome);
            const ativa = t.id === trilhaSelecionada;
            return (
              <button
                key={t.id}
                onClick={() => setTrilhaSelecionada(t.id)}
                className="rounded-full px-3 py-1.5 text-xs font-medium transition"
                style={
                  ativa
                    ? { background: v.gradiente, color: "#fff" }
                    : { border: `1px solid ${v.cor}55`, color: v.cor, background: v.bg }
                }
              >
                {v.icone} {t.nome}
              </button>
            );
          })}
        </div>

        {trilhaAtual && visualAtual && (
          <div>
            <div
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg p-4 text-white"
              style={{ background: visualAtual.gradiente }}
            >
              <div>
                <p className="text-xs uppercase tracking-wide opacity-80">{aulasDaTrilha.length} aulas</p>
                <h2 className="font-display text-xl">{visualAtual.icone} {trilhaAtual.nome}</h2>
              </div>
              <form action={atualizarTrilha} className="flex flex-wrap items-center gap-2 text-xs">
                <input type="hidden" name="id" value={trilhaAtual.id} />
                <select name="dia_semana" defaultValue={trilhaAtual.diaSemana} className="rounded border-none bg-white/20 px-2 py-1 text-xs text-white">
                  {DIAS_SEMANA.map((d, i) => (
                    <option key={i} value={i} className="text-imperium-bg">{d}</option>
                  ))}
                </select>
                <input type="time" name="hora_inicio" defaultValue={trilhaAtual.horaInicio} className="w-24 rounded border-none bg-white/20 px-2 py-1 text-xs text-white" />
                <span>–</span>
                <input type="time" name="hora_fim" defaultValue={trilhaAtual.horaFim} className="w-24 rounded border-none bg-white/20 px-2 py-1 text-xs text-white" />
                <button type="submit" className="rounded bg-white/25 px-2 py-1 text-[10px] hover:bg-white/40">Salvar</button>
              </form>
            </div>

            <form action={definirDatasEmLote} className="mb-4 flex flex-wrap items-center gap-2 rounded border border-imperium-line bg-imperium-bg/40 p-3 text-xs">
              <input type="hidden" name="trilha_id" value={trilhaAtual.id} />
              <span className="text-stone-400">🗓️ Gerar datas semanais a partir de:</span>
              <input type="date" name="data_inicio" required className="input-imp w-auto px-2 py-1 text-xs" />
              <button type="submit" className="btn-outline px-2 py-1 text-[10px]">Aplicar</button>
            </form>

            <div className="space-y-2">
              {aulasDaTrilha.map((aula) => (
                <AulaCard
                  key={aula.id}
                  aula={aula}
                  cor={visualAtual.cor}
                  instrutores={instrutoresPorTrilha[trilhaAtual.id] ?? []}
                  aberta={aulaAberta === aula.id}
                  onToggle={() => setAulaAberta(aulaAberta === aula.id ? null : aula.id)}
                />
              ))}

              <form action={criarAula} className="flex flex-wrap items-center gap-2 border-t border-imperium-line pt-3 text-xs">
                <input type="hidden" name="trilha_id" value={trilhaAtual.id} />
                <input name="tema" placeholder="Tema da nova aula" required className="input-imp flex-1 px-2 py-1 text-xs" />
                <input name="descricao" placeholder="Referência (opcional)" className="input-imp flex-1 px-2 py-1 text-xs" />
                <button type="submit" className="btn-gold px-3 py-1 text-[10px]">+ Aula</button>
              </form>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function AulaCard({
  aula,
  cor,
  instrutores,
  aberta,
  onToggle,
}: {
  aula: Aula;
  cor: string;
  instrutores: { id: string; nome: string }[];
  aberta: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded border border-imperium-line" style={{ borderLeftColor: cor, borderLeftWidth: 3 }}>
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-2 bg-imperium-bg/40 p-3 text-left">
        <div className="flex items-center gap-2">
          <span className="font-display text-xs text-gold">#{String(aula.ordem).padStart(2, "0")}</span>
          {aula.marco && <span title="Marco">★</span>}
          <span className="text-sm text-stone-100">{aula.tema}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-stone-500">
          <span>{fmtData(aula.data)}</span>
          <span>{aula.instrutorNome ?? "sem instrutor"}</span>
          <span>{aberta ? "▾" : "▸"}</span>
        </div>
      </button>

      {aberta && (
        <div className="space-y-2 border-t border-imperium-line bg-imperium-bg/20 p-3">
          <form action={atualizarAula} className="space-y-2">
            <input type="hidden" name="id" value={aula.id} />
            <div className="flex items-center gap-2 text-[10px] text-stone-500">
              <form action={moverAula} className="inline">
                <input type="hidden" name="id" value={aula.id} />
                <input type="hidden" name="direcao" value="cima" />
                <button type="submit" title="Mover pra cima" className="hover:text-gold">▲</button>
              </form>
              <form action={moverAula} className="inline">
                <input type="hidden" name="id" value={aula.id} />
                <input type="hidden" name="direcao" value="baixo" />
                <button type="submit" title="Mover pra baixo" className="hover:text-gold">▼</button>
              </form>
              <label className="ml-auto flex items-center gap-1">
                <input type="checkbox" name="marco" value="true" defaultChecked={aula.marco} className="accent-gold" />
                Marco
              </label>
              <form action={excluirAula} className="inline">
                <input type="hidden" name="id" value={aula.id} />
                <button type="submit" className="text-wine-bright hover:underline">Excluir</button>
              </form>
            </div>
            <div className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_1.3fr]">
              <input name="tema" defaultValue={aula.tema} className="input-imp px-2 py-1 text-xs" />
              <input name="descricao" defaultValue={aula.descricao ?? ""} placeholder="Referência" className="input-imp px-2 py-1 text-xs" />
              <input type="date" name="data" defaultValue={aula.data ?? ""} className="input-imp px-2 py-1 text-xs" />
              <select name="instrutor_id" defaultValue={aula.instrutorId ?? ""} className="input-imp px-2 py-1 text-xs">
                <option value="">— instrutor —</option>
                {instrutores.map((i) => (
                  <option key={i.id} value={i.id}>{i.nome}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-outline px-2 py-1 text-[10px]">Salvar aula</button>
          </form>
        </div>
      )}
    </div>
  );
}
