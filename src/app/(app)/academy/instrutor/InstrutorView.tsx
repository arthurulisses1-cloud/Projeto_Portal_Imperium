"use client";

import type { Aula, Material, AlunoAudiencia, AulaComCobranca } from "@/lib/academy";
import { visualDaTrilha } from "@/lib/academy-visual";
import { marcarRealizada, enviarMaterial, excluirMaterial, salvarPresencas, salvarResumoAula } from "../actions";

function fmtData(iso: string | null) {
  if (!iso) return "sem data";
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", weekday: "short" });
}

export default function InstrutorView({
  aulas,
  materiaisPorAula,
  audienciaPorAula,
  presencasPorAula,
  aulasCobranca,
}: {
  aulas: (Aula & { trilhaNome: string })[];
  materiaisPorAula: Record<string, Material[]>;
  audienciaPorAula: Record<string, AlunoAudiencia[]>;
  presencasPorAula: Record<string, Record<string, boolean>>;
  aulasCobranca: AulaComCobranca[] | null;
}) {
  const dadas = aulas.filter((a) => a.realizada).length;
  const hoje = new Date().toISOString().slice(0, 10);
  const proxima = aulas.find((a) => !a.realizada && (a.data ?? "9999") >= hoje);

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      {aulasCobranca && <CobrancaProfessores aulas={aulasCobranca} />}

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
            // "Fechar aula" exige material + presença — pedido do Diretor,
            // 2026-09-21. Reabrir (aula.realizada -> false) continua livre.
            const temMaterial = (materiaisPorAula[aula.id] ?? []).length > 0;
            const temPresenca = Object.keys(presencasPorAula[aula.id] ?? {}).length > 0;
            const podeFechar = temMaterial && temPresenca;
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
                  <div className="text-right">
                    <form action={marcarRealizada}>
                      <input type="hidden" name="id" value={aula.id} />
                      <input type="hidden" name="realizada" value={(!aula.realizada).toString()} />
                      <button
                        type="submit"
                        disabled={!aula.realizada && !podeFechar}
                        className={`rounded px-3 py-1.5 text-xs font-medium ${
                          aula.realizada
                            ? "bg-white/20 hover:bg-white/30"
                            : podeFechar
                              ? "bg-white text-imperium-bg hover:brightness-95"
                              : "cursor-not-allowed bg-white/40 text-imperium-bg/60"
                        }`}
                      >
                        {aula.realizada ? "✓ Aula fechada — reabrir" : "Fechar aula"}
                      </button>
                    </form>
                    {!aula.realizada && !podeFechar && (
                      <p className="mt-1 text-[10px] opacity-90">
                        Falta {!temMaterial && "material"}
                        {!temMaterial && !temPresenca && " e "}
                        {!temPresenca && "presença"}
                      </p>
                    )}
                  </div>
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

                <ResumoAula aula={aula} />
                <ListaPresenca aula={aula} audiencia={audienciaPorAula[aula.id] ?? []} presencas={presencasPorAula[aula.id] ?? {}} />
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

// Cobrança do Diretor — pedido 2026-09-22: "me dê um lugar onde posso ver
// as aulas dos outros professores pra poder cobrar eles de fazer o
// fechamento". Só aulas já vencidas e ainda sem fechar (ver page.tsx) —
// somente leitura, quem fecha é o próprio instrutor lá embaixo.
function CobrancaProfessores({ aulas }: { aulas: AulaComCobranca[] }) {
  if (aulas.length === 0) {
    return (
      <section className="card-imp">
        <h2 className="font-display text-lg text-gold-bright">Cobrança de fechamento</h2>
        <p className="mt-1 text-xs text-success-bright">✓ Nenhuma aula vencida sem fechar — todo mundo em dia.</p>
      </section>
    );
  }

  return (
    <section className="card-imp space-y-3">
      <div>
        <h2 className="font-display text-lg text-gold-bright">Cobrança de fechamento</h2>
        <p className="text-xs text-stone-400">
          Aulas já dadas (data passada) que o professor ainda não fechou — {aulas.length} pendente{aulas.length > 1 ? "s" : ""}.
        </p>
      </div>
      <div className="space-y-1.5">
        {aulas.map((aula) => {
          const visual = visualDaTrilha(aula.trilhaNome);
          return (
            <div key={aula.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-imperium-line p-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span style={{ color: visual.cor }}>{visual.icone}</span>
                <div>
                  <p className="text-stone-100">
                    {aula.tema} <span className="text-stone-500">— {aula.trilhaNome}</span>
                  </p>
                  <p className="text-[10px] text-stone-500">
                    {aula.instrutorNome ?? "sem instrutor"} · {fmtData(aula.data)}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-wine/20 px-2 py-0.5 text-[10px] text-wine-bright">
                falta {!aula.temMaterial && "material"}
                {!aula.temMaterial && !aula.temPresenca && " e "}
                {!aula.temPresenca && "presença"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Resumo + gravação pós-aula — pedido do Diretor, 2026-09-21: alimenta a
// "Netflix" de Trilhas de Formação (o que o aluno vê ao rever a aula).
function ResumoAula({ aula }: { aula: Aula }) {
  return (
    <details className="border-t border-imperium-line bg-imperium-surface p-4">
      <summary className="cursor-pointer text-xs uppercase tracking-wide text-stone-500">
        Resumo e gravação (Trilhas de Formação)
      </summary>
      <form action={salvarResumoAula} className="mt-3 space-y-2">
        <input type="hidden" name="id" value={aula.id} />
        <div>
          <label className="mb-1 block text-[10px] uppercase text-stone-500">
            Resumo do que rolou na aula (fica visível pra quem quiser rever)
          </label>
          <textarea name="resumo" rows={3} defaultValue={aula.resumo ?? ""} className="input-imp text-xs" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] uppercase text-stone-500">Link da gravação (YouTube/Vimeo/Loom, opcional)</label>
          <input name="video_url" type="url" defaultValue={aula.videoUrl ?? ""} placeholder="https://..." className="input-imp text-xs" />
        </div>
        <button type="submit" className="btn-outline px-3 py-1 text-[10px]">
          Salvar resumo
        </button>
      </form>
    </details>
  );
}

// Lista de presença — pedido do Diretor, 2026-09-21: o instrutor marca
// quem participou; a partir daí conta pro quesito Formação do Plano de
// Carreira (bloco 4, ver avaliarCriterioAutomatico em src/lib/carreira.ts).
// `audiencia` já vem filtrada pela trilha da aula (Arena = todo SDR/
// Closer ativo; trilha normal = só quem tem o rank dela).
function ListaPresenca({
  aula,
  audiencia,
  presencas,
}: {
  aula: Aula;
  audiencia: AlunoAudiencia[];
  presencas: Record<string, boolean>;
}) {
  const totalPresentes = audiencia.filter((a) => presencas[a.id]).length;

  if (audiencia.length === 0) {
    return (
      <div className="border-t border-imperium-line bg-imperium-surface p-4">
        <p className="text-xs text-stone-600">
          Ninguém no rank/time dessa trilha ainda — sem audiência pra marcar presença.
        </p>
      </div>
    );
  }

  return (
    <details className="border-t border-imperium-line bg-imperium-surface p-4">
      <summary className="cursor-pointer text-xs uppercase tracking-wide text-stone-500">
        Lista de presença ({totalPresentes}/{audiencia.length})
      </summary>
      <form action={salvarPresencas} className="mt-3 space-y-2">
        <input type="hidden" name="aula_id" value={aula.id} />
        <div className="grid gap-1.5 sm:grid-cols-2">
          {audiencia.map((aluno) => (
            <label key={aluno.id} className="flex items-center gap-2 text-xs text-stone-300">
              <input type="hidden" name="aluno_id" value={aluno.id} />
              <input type="checkbox" name="presente" value={aluno.id} defaultChecked={!!presencas[aluno.id]} />
              {aluno.nome}
            </label>
          ))}
        </div>
        <button type="submit" className="btn-outline px-3 py-1 text-[10px]">
          Salvar presença
        </button>
      </form>
    </details>
  );
}
