"use client";

import type { Aula, Material } from "@/lib/academy";
import { visualDaTrilha } from "@/lib/academy-visual";
import { marcarRealizada, enviarMaterial, excluirMaterial } from "../actions";

function fmtData(iso: string | null) {
  if (!iso) return "sem data";
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", weekday: "short" });
}

export default function InstrutorView({
  aulas,
  materiaisPorAula,
}: {
  aulas: (Aula & { trilhaNome: string })[];
  materiaisPorAula: Record<string, Material[]>;
}) {
  const dadas = aulas.filter((a) => a.realizada).length;
  const hoje = new Date().toISOString().slice(0, 10);
  const proxima = aulas.find((a) => !a.realizada && (a.data ?? "9999") >= hoje);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Aulas para Ministrar</h1>
        <p className="text-xs text-stone-400">Suas alocações como instrutor na Imperium Academy.</p>
      </div>

      {aulas.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card-imp text-center">
            <p className="font-display text-3xl text-gold-bright">{aulas.length}</p>
            <p className="kicker mt-1">Alocadas</p>
          </div>
          <div className="card-imp text-center">
            <p className="font-display text-3xl text-success-bright">{dadas}</p>
            <p className="kicker mt-1">Já ministradas</p>
          </div>
          <div className="card-imp text-center">
            <p className="font-display text-lg text-gold-bright">{proxima ? fmtData(proxima.data) : "—"}</p>
            <p className="kicker mt-1">Próxima aula</p>
          </div>
        </div>
      )}

      {aulas.length === 0 ? (
        <p className="text-sm text-stone-500">Você ainda não foi alocado pra ministrar nenhuma aula.</p>
      ) : (
        <div className="space-y-4">
          {aulas.map((aula) => {
            const visual = visualDaTrilha(aula.trilhaNome);
            const atrasada = !aula.realizada && aula.data !== null && aula.data < hoje;
            return (
              <section key={aula.id} className="overflow-hidden rounded-lg border border-imperium-line shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-white" style={{ background: visual.gradiente }}>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide opacity-85">
                      {visual.icone} {aula.trilhaNome} · aula #{aula.ordem} · {fmtData(aula.data)}
                      {atrasada && <span className="ml-2 rounded-full bg-black/30 px-2 py-0.5">atrasada</span>}
                    </p>
                    <h2 className="font-display text-lg">{aula.marco ? "★ " : ""}{aula.tema}</h2>
                    {aula.descricao && <p className="text-xs opacity-90">{aula.descricao}</p>}
                  </div>
                  <form action={marcarRealizada}>
                    <input type="hidden" name="id" value={aula.id} />
                    <input type="hidden" name="realizada" value={(!aula.realizada).toString()} />
                    <button
                      type="submit"
                      className={`rounded px-3 py-1.5 text-xs font-medium ${
                        aula.realizada ? "bg-white/20 hover:bg-white/30" : "bg-white text-imperium-bg hover:brightness-95"
                      }`}
                    >
                      {aula.realizada ? "✓ Ministrada" : "Marcar como dada"}
                    </button>
                  </form>
                </div>

                <div className="bg-imperium-surface p-4">
                  <p className="mb-2 text-xs uppercase tracking-wide text-stone-500">Materiais</p>
                  {(materiaisPorAula[aula.id] ?? []).length > 0 ? (
                    <ul className="mb-3 space-y-1">
                      {(materiaisPorAula[aula.id] ?? []).map((m) => (
                        <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
                          <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
                            📎 {m.nome}
                          </a>
                          <form action={excluirMaterial}>
                            <input type="hidden" name="id" value={m.id} />
                            <button type="submit" className="text-wine-bright hover:underline">excluir</button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-3 text-xs text-stone-600">Nenhum material enviado ainda.</p>
                  )}
                  <form action={enviarMaterial} className="flex flex-wrap items-center gap-2" encType="multipart/form-data">
                    <input type="hidden" name="aula_id" value={aula.id} />
                    <input name="nome" placeholder="Nome do material (opcional)" className="input-imp px-2 py-1 text-xs" />
                    <input type="file" name="arquivo" required className="text-xs text-stone-300" />
                    <button type="submit" className="btn-outline px-3 py-1 text-[10px]">Enviar</button>
                  </form>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
