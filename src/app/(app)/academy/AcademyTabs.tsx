"use client";

import { useState } from "react";
import type { Trilha, Aula, Material } from "@/lib/academy";
import {
  atualizarTrilha,
  criarAula,
  atualizarAula,
  excluirAula,
  moverAula,
  definirDatasEmLote,
  marcarRealizada,
  enviarMaterial,
  excluirMaterial,
} from "./actions";

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function fmtData(iso: string | null) {
  if (!iso) return "— sem data";
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

type Props = {
  isDiretor: boolean;
  meId: string;
  trilhas: Trilha[];
  minhaTrilha: Trilha | null;
  arena: Trilha | null;
  aulasMinhaTrilha: Aula[];
  aulasArena: Aula[];
  aulasParaMinistrar: (Aula & { trilhaNome: string })[];
  todasAulas: Aula[];
  instrutoresPorTrilha: Record<string, { id: string; nome: string }[]>;
  materiaisPorAula: Record<string, Material[]>;
};

export default function AcademyTabs(props: Props) {
  const abas = props.isDiretor
    ? (["geral", "instrutor", "trilha"] as const)
    : (["instrutor", "trilha"] as const);
  const [aba, setAba] = useState<(typeof abas)[number]>(props.isDiretor ? "geral" : "trilha");

  const LABEL: Record<string, string> = {
    geral: "Academy Geral",
    instrutor: "Aulas para Ministrar",
    trilha: "Trilha de Formação",
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Vorp Academy</h1>
        <p className="text-xs text-stone-400">Trilhas de formação, aulas e materiais — Legionário a Legado.</p>
      </div>

      <div className="flex gap-2 border-b border-imperium-line pb-3">
        {abas.map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={`rounded px-3 py-1.5 text-xs uppercase tracking-wide transition ${
              aba === a ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-300 hover:border-gold"
            }`}
          >
            {LABEL[a]}
            {a === "instrutor" && props.aulasParaMinistrar.length > 0 && (
              <span className="ml-1.5 rounded-full bg-wine px-1.5 text-[10px]">{props.aulasParaMinistrar.length}</span>
            )}
          </button>
        ))}
      </div>

      {aba === "geral" && props.isDiretor && (
        <AbaGeral trilhas={props.trilhas} todasAulas={props.todasAulas} instrutoresPorTrilha={props.instrutoresPorTrilha} />
      )}
      {aba === "instrutor" && <AbaInstrutor aulas={props.aulasParaMinistrar} materiaisPorAula={props.materiaisPorAula} />}
      {aba === "trilha" && (
        <AbaTrilha
          minhaTrilha={props.minhaTrilha}
          arena={props.arena}
          aulasMinhaTrilha={props.aulasMinhaTrilha}
          aulasArena={props.aulasArena}
          materiaisPorAula={props.materiaisPorAula}
        />
      )}
    </main>
  );
}

// ==================== ACADEMY GERAL (Diretor) ====================

function AbaGeral({
  trilhas,
  todasAulas,
  instrutoresPorTrilha,
}: {
  trilhas: Trilha[];
  todasAulas: Aula[];
  instrutoresPorTrilha: Record<string, { id: string; nome: string }[]>;
}) {
  return (
    <div className="space-y-8">
      {trilhas.map((trilha) => (
        <TrilhaGeral
          key={trilha.id}
          trilha={trilha}
          aulas={todasAulas.filter((a) => a.trilhaId === trilha.id)}
          instrutores={instrutoresPorTrilha[trilha.id] ?? []}
        />
      ))}
    </div>
  );
}

function TrilhaGeral({ trilha, aulas, instrutores }: { trilha: Trilha; aulas: Aula[]; instrutores: { id: string; nome: string }[] }) {
  const [expandido, setExpandido] = useState(false);

  return (
    <section className="card-imp">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="kicker">{trilha.nome}</h2>
          <p className="text-[11px] text-stone-600">{aulas.length} aulas cadastradas</p>
        </div>
        <form action={atualizarTrilha} className="flex flex-wrap items-center gap-2 text-xs">
          <input type="hidden" name="id" value={trilha.id} />
          <select name="dia_semana" defaultValue={trilha.diaSemana} className="input-imp px-2 py-1 text-xs">
            {DIAS_SEMANA.map((d, i) => (
              <option key={i} value={i}>{d}</option>
            ))}
          </select>
          <input type="time" name="hora_inicio" defaultValue={trilha.horaInicio} className="input-imp w-24 px-2 py-1 text-xs" />
          <span className="text-stone-500">–</span>
          <input type="time" name="hora_fim" defaultValue={trilha.horaFim} className="input-imp w-24 px-2 py-1 text-xs" />
          <button type="submit" className="btn-outline px-2 py-1 text-[10px]">Salvar horário</button>
        </form>
      </div>

      <form action={definirDatasEmLote} className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <input type="hidden" name="trilha_id" value={trilha.id} />
        <label className="text-stone-500">Preencher datas a partir de:</label>
        <input type="date" name="data_inicio" required className="input-imp px-2 py-1 text-xs" />
        <button type="submit" className="btn-outline px-2 py-1 text-[10px]">Gerar datas semanais</button>
      </form>

      <button onClick={() => setExpandido((v) => !v)} className="mb-2 text-[11px] text-gold hover:underline">
        {expandido ? "Recolher aulas ▾" : "Ver/editar aulas ▸"}
      </button>

      {expandido && (
        <div className="space-y-2">
          {aulas.map((aula) => (
            <AulaGeralRow key={aula.id} aula={aula} instrutores={instrutores} />
          ))}

          <form action={criarAula} className="flex flex-wrap items-center gap-2 border-t border-imperium-line pt-3 text-xs">
            <input type="hidden" name="trilha_id" value={trilha.id} />
            <input name="tema" placeholder="Tema da nova aula" required className="input-imp flex-1 px-2 py-1 text-xs" />
            <input name="descricao" placeholder="Referência (opcional)" className="input-imp flex-1 px-2 py-1 text-xs" />
            <button type="submit" className="btn-gold px-3 py-1 text-[10px]">+ Aula</button>
          </form>
        </div>
      )}
    </section>
  );
}

function AulaGeralRow({ aula, instrutores }: { aula: Aula; instrutores: { id: string; nome: string }[] }) {
  return (
    <div className="rounded border border-imperium-line bg-imperium-bg/40 p-3">
      <form action={atualizarAula} className="space-y-2">
        <input type="hidden" name="id" value={aula.id} />
        <div className="flex items-center gap-2 text-[10px] text-stone-500">
          <span className="font-display text-gold">#{String(aula.ordem).padStart(2, "0")}</span>
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
  );
}

// ==================== AULAS PARA MINISTRAR (Instrutor) ====================

function AbaInstrutor({
  aulas,
  materiaisPorAula,
}: {
  aulas: (Aula & { trilhaNome: string })[];
  materiaisPorAula: Record<string, Material[]>;
}) {
  if (aulas.length === 0) {
    return <p className="text-sm text-stone-500">Você ainda não foi alocado pra ministrar nenhuma aula.</p>;
  }
  return (
    <div className="space-y-4">
      {aulas.map((aula) => (
        <div key={aula.id} className="card-imp">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-stone-500">{aula.trilhaNome} · aula #{aula.ordem}</p>
              <h2 className="font-display text-lg text-gold-bright">{aula.tema}</h2>
              {aula.descricao && <p className="text-xs text-stone-500">{aula.descricao}</p>}
              <p className="mt-1 text-xs text-stone-400">{fmtData(aula.data)}</p>
            </div>
            <form action={marcarRealizada}>
              <input type="hidden" name="id" value={aula.id} />
              <input type="hidden" name="realizada" value={(!aula.realizada).toString()} />
              <button type="submit" className={aula.realizada ? "btn-outline px-3 py-1.5 text-xs" : "btn-gold px-3 py-1.5 text-xs"}>
                {aula.realizada ? "Marcada como dada ✓" : "Marcar como dada"}
              </button>
            </form>
          </div>

          <MateriaisAula aulaId={aula.id} materiais={materiaisPorAula[aula.id] ?? []} podeEnviar podeExcluirTodos />
        </div>
      ))}
    </div>
  );
}

function MateriaisAula({
  aulaId,
  materiais,
  podeEnviar,
  podeExcluirTodos = false,
}: {
  aulaId: string;
  materiais: Material[];
  podeEnviar: boolean;
  podeExcluirTodos?: boolean;
}) {
  return (
    <div className="border-t border-imperium-line pt-3">
      <p className="mb-2 text-xs uppercase tracking-wide text-stone-500">Materiais</p>
      {materiais.length > 0 ? (
        <ul className="mb-2 space-y-1">
          {materiais.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
              <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
                {m.nome}
              </a>
              <span className="flex items-center gap-2 text-stone-600">
                {m.enviadoPorNome ?? "—"}
                {podeExcluirTodos && (
                  <form action={excluirMaterial}>
                    <input type="hidden" name="id" value={m.id} />
                    <button type="submit" className="text-wine-bright hover:underline">excluir</button>
                  </form>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-xs text-stone-600">Nenhum material enviado ainda.</p>
      )}
      {podeEnviar && (
        <form action={enviarMaterial} className="flex flex-wrap items-center gap-2" encType="multipart/form-data">
          <input type="hidden" name="aula_id" value={aulaId} />
          <input name="nome" placeholder="Nome do material (opcional)" className="input-imp px-2 py-1 text-xs" />
          <input type="file" name="arquivo" required className="text-xs text-stone-300" />
          <button type="submit" className="btn-outline px-3 py-1 text-[10px]">Enviar</button>
        </form>
      )}
    </div>
  );
}

// ==================== TRILHA DE FORMAÇÃO (Aluno) ====================

function AbaTrilha({
  minhaTrilha,
  arena,
  aulasMinhaTrilha,
  aulasArena,
  materiaisPorAula,
}: {
  minhaTrilha: Trilha | null;
  arena: Trilha | null;
  aulasMinhaTrilha: Aula[];
  aulasArena: Aula[];
  materiaisPorAula: Record<string, Material[]>;
}) {
  if (!minhaTrilha) {
    return <p className="text-sm text-stone-500">Sua patente ainda não tem uma trilha cadastrada.</p>;
  }
  return (
    <div className="space-y-8">
      <TrilhaAluno trilha={minhaTrilha} aulas={aulasMinhaTrilha} materiaisPorAula={materiaisPorAula} />
      {arena && <TrilhaAluno trilha={arena} aulas={aulasArena} materiaisPorAula={materiaisPorAula} />}
    </div>
  );
}

function TrilhaAluno({
  trilha,
  aulas,
  materiaisPorAula,
}: {
  trilha: Trilha;
  aulas: Aula[];
  materiaisPorAula: Record<string, Material[]>;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  return (
    <section className="card-imp">
      <h2 className="kicker mb-1">{trilha.nome}</h2>
      <p className="mb-4 text-[11px] text-stone-600">
        {DIAS_SEMANA[trilha.diaSemana]}, {trilha.horaInicio}–{trilha.horaFim}
      </p>
      <ul className="space-y-3">
        {aulas.map((aula) => {
          const passada = aula.data ? aula.data < hoje : false;
          const materiais = materiaisPorAula[aula.id] ?? [];
          return (
            <li
              key={aula.id}
              className={`rounded border p-3 ${
                aula.marco ? "border-gold/40 bg-gold/5" : "border-imperium-line bg-imperium-bg/40"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] text-stone-500">#{String(aula.ordem).padStart(2, "0")} · {fmtData(aula.data)}</span>
                  <p className={aula.marco ? "text-gold-bright" : "text-stone-100"}>{aula.tema}</p>
                  {aula.descricao && <p className="text-xs text-stone-500">{aula.descricao}</p>}
                  <p className="text-xs text-stone-600">Instrutor: {aula.instrutorNome ?? "a definir"}</p>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  {aula.realizada && <span className="rounded-full border border-success-bright px-2 py-0.5 text-success-bright">Dada</span>}
                  {!aula.realizada && passada && <span className="rounded-full border border-imperium-line-strong px-2 py-0.5 text-stone-500">Passou</span>}
                </div>
              </div>
              {materiais.length > 0 && (
                <ul className="mt-2 space-y-0.5 border-t border-imperium-line pt-2">
                  {materiais.map((m) => (
                    <li key={m.id}>
                      <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-xs text-gold hover:underline">
                        📎 {m.nome}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
