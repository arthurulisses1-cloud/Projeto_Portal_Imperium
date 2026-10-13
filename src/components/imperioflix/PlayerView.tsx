"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { marcarAssistido } from "@/app/(app)/academy/actions";
import ComentariosReacoes from "@/components/ui/ComentariosReacoes";
import type { Comentario, ReacaoResumo } from "@/lib/social";
import { embedUrl, progressoDaSerie, urlDoEpisodio, type Episodio, type Serie } from "@/lib/imperioflix-util";
import { BarraProgresso } from "./ImperioflixUi";

export type MaterialAula = { id: string; nome: string; url: string; enviadoPorNome: string | null };
type Aba = "geral" | "materiais" | "comentarios";

function dataBr(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR");
}

export default function PlayerView({
  serie,
  episodio,
  indice,
  vistos: vistosIniciais,
  materiais,
  comentarios,
  reacoes,
  meId,
  isDiretor,
  pessoas,
}: {
  serie: Serie;
  episodio: Episodio;
  indice: number;
  vistos: string[];
  materiais: MaterialAula[];
  comentarios: Comentario[];
  reacoes: ReacaoResumo;
  meId: string;
  isDiretor: boolean;
  pessoas: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [vistos, setVistos] = useState<Set<string>>(() => new Set(vistosIniciais));
  const [aba, setAba] = useState<Aba>("geral");
  const [cinema, setCinema] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const atualRef = useRef<HTMLAnchorElement>(null);

  // Ao trocar de aula (mesma tela), o servidor manda os dados novos.
  useEffect(() => {
    setVistos(new Set(vistosIniciais));
    setAba("geral");
    setErro(null);
  }, [episodio.id, vistosIniciais]);

  useEffect(() => {
    atualRef.current?.scrollIntoView({ block: "nearest" });
  }, [episodio.id]);

  const anterior = serie.episodios[indice - 1] ?? null;
  const proxima = serie.episodios[indice + 1] ?? null;
  const concluida = vistos.has(episodio.id);
  const prog = useMemo(() => progressoDaSerie(serie, vistos), [serie, vistos]);
  const embed = episodio.videoUrl ? embedUrl(episodio.videoUrl) : null;

  function marcar(valor: boolean, depois?: () => void) {
    setErro(null);
    const anteriorSet = vistos;
    setVistos((prev) => {
      const next = new Set(prev);
      if (valor) next.add(episodio.id);
      else next.delete(episodio.id);
      return next;
    });
    const fd = new FormData();
    fd.set("alvo_tipo", episodio.tipo === "aula" ? "academy_aula" : "academy_modulo_item");
    fd.set("alvo_id", episodio.id);
    fd.set("assistido", String(valor));
    startTransition(async () => {
      try {
        await marcarAssistido(fd);
      } catch (e) {
        setVistos(anteriorSet);
        setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
        return;
      }
      depois?.();
    });
  }

  function concluirEContinuar() {
    const ir = () => {
      if (proxima) router.push(urlDoEpisodio(serie.id, proxima.id));
      else router.push(`/academy/imperioflix/${serie.id}`);
    };
    if (concluida) ir();
    else marcar(true, ir);
  }

  const abas: { id: Aba; label: string; contagem?: number }[] = [
    { id: "geral", label: "Visão geral" },
    { id: "materiais", label: "Materiais", contagem: materiais.length },
    { id: "comentarios", label: "Comentários", contagem: comentarios.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-stone-500" aria-label="Navegação">
          <Link href="/academy/imperioflix" className="hover:text-gold">
            Imperioflix
          </Link>
          <span>›</span>
          <Link href={`/academy/imperioflix/${serie.id}`} className="max-w-[16rem] truncate hover:text-gold">
            {serie.titulo}
          </Link>
        </nav>
        <button
          type="button"
          onClick={() => setCinema((v) => !v)}
          className="hidden rounded-md border border-imperium-line px-3 py-1.5 text-xs text-stone-300 transition hover:border-gold/50 lg:inline-block"
        >
          {cinema ? "Mostrar lista de aulas" : "Modo cinema"}
        </button>
      </div>

      <div className={`grid gap-6 ${cinema ? "" : "lg:grid-cols-[minmax(0,1fr)_23rem]"}`}>
        <div className="min-w-0 space-y-5">
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-2xl ring-1 ring-white/10">
            {embed ? (
              <iframe
                key={episodio.id}
                src={embed}
                title={episodio.titulo}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: serie.gradiente }}>
                <span className="text-6xl">{episodio.videoUrl || episodio.arquivoUrl ? "🎬" : serie.icone}</span>
                {episodio.videoUrl ? (
                  <a href={episodio.videoUrl} target="_blank" rel="noopener noreferrer" className="rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-black">
                    Abrir vídeo em nova aba
                  </a>
                ) : episodio.arquivoUrl ? (
                  <a href={episodio.arquivoUrl} target="_blank" rel="noopener noreferrer" className="rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-black">
                    Abrir material
                  </a>
                ) : (
                  <p className="max-w-sm text-sm text-white/85">A gravação desta aula ainda não foi publicada. Veja o resumo e os materiais abaixo.</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
              Aula {indice + 1} de {serie.episodios.length}
              {episodio.marco && " · Marco"}
            </p>
            <h1 className="font-display text-2xl font-bold leading-tight text-stone-50 sm:text-3xl">{episodio.titulo}</h1>

            <div className="flex flex-wrap items-center gap-2.5">
              {anterior ? (
                <Link
                  href={urlDoEpisodio(serie.id, anterior.id)}
                  className="rounded-md border border-imperium-line px-4 py-2 text-sm text-stone-300 transition hover:border-gold/50"
                >
                  ← Anterior
                </Link>
              ) : (
                <span className="rounded-md border border-imperium-line/50 px-4 py-2 text-sm text-stone-600">← Anterior</span>
              )}

              <button
                type="button"
                disabled={isPending}
                onClick={() => marcar(!concluida)}
                className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                  concluida ? "bg-success/20 text-success-bright" : "border border-imperium-line text-stone-300 hover:border-gold/50"
                }`}
              >
                {concluida ? "✓ Concluída" : "Marcar como concluída"}
              </button>

              <button
                type="button"
                disabled={isPending}
                onClick={concluirEContinuar}
                className="rounded-md bg-gold px-5 py-2 text-sm font-semibold text-imperium-bg transition hover:bg-gold-bright disabled:opacity-60"
              >
                {proxima ? (concluida ? "Próxima aula →" : "Concluir e ir para a próxima →") : concluida ? "Voltar ao curso" : "Concluir e finalizar"}
              </button>
            </div>
            {erro && <p className="text-xs text-wine-bright">{erro}</p>}
          </div>

          <div className="border-b border-imperium-line">
            <div className="flex gap-1" role="tablist">
              {abas.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  aria-selected={aba === a.id}
                  onClick={() => setAba(a.id)}
                  className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition ${
                    aba === a.id ? "border-gold text-gold-bright" : "border-transparent text-stone-400 hover:text-stone-200"
                  }`}
                >
                  {a.label}
                  {a.contagem !== undefined && a.contagem > 0 && (
                    <span className="ml-1.5 rounded-full bg-imperium-surface px-1.5 py-0.5 text-[10px] text-stone-400">{a.contagem}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="pb-8">
            {aba === "geral" && (
              <div className="max-w-3xl space-y-5">
                {episodio.resumo ? (
                  <p className="whitespace-pre-line text-[15px] leading-relaxed text-stone-300">{episodio.resumo}</p>
                ) : (
                  <p className="text-sm text-stone-500">Essa aula ainda não tem resumo.</p>
                )}
                {(episodio.instrutorNome || episodio.data) && (
                  <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                    {episodio.instrutorNome && (
                      <div>
                        <dt className="text-[11px] uppercase tracking-wide text-stone-500">Instrutor</dt>
                        <dd className="text-stone-200">{episodio.instrutorNome}</dd>
                      </div>
                    )}
                    {episodio.data && (
                      <div>
                        <dt className="text-[11px] uppercase tracking-wide text-stone-500">Data da aula</dt>
                        <dd className="text-stone-200">{dataBr(episodio.data)}</dd>
                      </div>
                    )}
                  </dl>
                )}
                {serie.descricao && (
                  <div className="rounded-xl border border-imperium-line bg-imperium-surface/50 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-stone-500">Sobre o curso</p>
                    <p className="mt-1 text-sm text-stone-300">{serie.descricao}</p>
                  </div>
                )}
              </div>
            )}

            {aba === "materiais" && (
              <div className="max-w-3xl space-y-2.5">
                {materiais.length === 0 ? (
                  <p className="rounded-xl border border-imperium-line px-5 py-8 text-center text-sm text-stone-500">
                    Esta aula não tem materiais para baixar.
                  </p>
                ) : (
                  materiais.map((m) => (
                    <a
                      key={m.id}
                      href={m.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 rounded-xl border border-imperium-line bg-imperium-surface/50 px-4 py-3 transition hover:border-gold/50"
                    >
                      <span className="text-2xl">📎</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-stone-100">{m.nome}</span>
                        {m.enviadoPorNome && <span className="text-xs text-stone-500">enviado por {m.enviadoPorNome}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-gold">Abrir ↗</span>
                    </a>
                  ))
                )}
              </div>
            )}

            {aba === "comentarios" && (
              <div className="max-w-3xl">
                <ComentariosReacoes
                  alvoTipo={episodio.tipo === "aula" ? "academy_aula" : "academy_modulo_item"}
                  alvoId={episodio.id}
                  meId={meId}
                  isDiretor={isDiretor}
                  comentarios={comentarios}
                  reacoes={reacoes}
                  pessoas={pessoas}
                />
              </div>
            )}
          </div>
        </div>

        {!cinema && (
          <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            <div className="overflow-hidden rounded-xl border border-imperium-line bg-imperium-surface/60">
              <div className="space-y-2 border-b border-imperium-line p-4">
                <h2 className="font-display text-base text-stone-100">Conteúdo do curso</h2>
                <BarraProgresso pct={prog.pct} />
                <p className="text-xs text-stone-500">
                  {prog.feitos} de {prog.total} concluídas · {prog.pct}%
                </p>
              </div>
              <ol className="max-h-[32rem] divide-y divide-imperium-line/60 overflow-y-auto">
                {serie.episodios.map((ep, i) => {
                  const atual = ep.id === episodio.id;
                  const feito = vistos.has(ep.id);
                  return (
                    <li key={ep.id}>
                      <Link
                        ref={atual ? atualRef : undefined}
                        href={urlDoEpisodio(serie.id, ep.id)}
                        aria-current={atual ? "page" : undefined}
                        className={`flex items-start gap-3 px-4 py-3 transition hover:bg-imperium-bg/60 ${
                          atual ? "border-l-2 border-gold bg-gold/10" : "border-l-2 border-transparent"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                            feito ? "border-success bg-success/20 text-success-bright" : atual ? "border-gold text-gold" : "border-imperium-line text-stone-500"
                          }`}
                        >
                          {feito ? "✓" : atual ? "▶" : i + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm leading-snug ${atual ? "font-medium text-stone-50" : "text-stone-300"}`}>{ep.titulo}</span>
                          <span className="text-[11px] text-stone-600">{ep.videoUrl ? "Vídeo" : ep.arquivoUrl ? "Material" : "Aula"}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
