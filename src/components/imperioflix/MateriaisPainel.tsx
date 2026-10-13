"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { marcarAssistido, registrarMaterial, excluirMaterial, criarComplemento, excluirComplemento } from "@/app/(app)/academy/actions";

export type TipoRecurso = "arquivo" | "artigo" | "video" | "pdf" | "outro";

export type Recurso = {
  id: string;
  titulo: string;
  url: string;
  tipo: TipoRecurso;
  autorId: string | null;
  autorNome?: string | null;
  // Material antigo (arquivo único do item de módulo): só abrir, sem check nem exclusão.
  legado?: boolean;
};

const ICONE: Record<TipoRecurso, string> = { arquivo: "📎", artigo: "📰", video: "▶️", pdf: "📄", outro: "🔗" };
const ROTULO: Record<TipoRecurso, string> = { arquivo: "Arquivo", artigo: "Artigo", video: "Vídeo", pdf: "PDF", outro: "Link" };

function dominio(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function sugerirTipo(url: string): TipoRecurso {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be") || u.includes("vimeo.com")) return "video";
  if (u.split("?")[0].endsWith(".pdf")) return "pdf";
  if (u.startsWith("http")) return "artigo";
  return "outro";
}

// Lista de materiais (da aula ou complementares) com check de "visto" ao lado
// de cada um e, pra quem gerencia (Diretor / instrutor da aula), envio de
// arquivo, adição de links e exclusão — pedido do Diretor, 2026-10-13.
export default function MateriaisPainel({
  modo,
  itens,
  vistosIniciais,
  alvo,
  podeGerenciar,
  meId,
  isDiretor,
}: {
  modo: "materiais" | "complementares";
  itens: Recurso[];
  vistosIniciais: string[];
  alvo: { tipo: "aula" | "item"; id: string };
  podeGerenciar: boolean;
  meId: string;
  isDiretor: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [vistos, setVistos] = useState<Set<string>>(() => new Set(vistosIniciais));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [url, setUrl] = useState("");
  const [tipo, setTipo] = useState<TipoRecurso>("artigo");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);

  const alvoTipoProgresso = modo === "materiais" ? "academy_material" : "academy_complemento";
  const total = itens.filter((i) => !i.legado).length;
  const feitos = itens.filter((i) => !i.legado && vistos.has(i.id)).length;

  function alternarVisto(id: string) {
    const valor = !vistos.has(id);
    const anterior = vistos;
    setErro(null);
    setVistos((prev) => {
      const next = new Set(prev);
      if (valor) next.add(id);
      else next.delete(id);
      return next;
    });
    const fd = new FormData();
    fd.set("alvo_tipo", alvoTipoProgresso);
    fd.set("alvo_id", id);
    fd.set("assistido", String(valor));
    startTransition(async () => {
      try {
        await marcarAssistido(fd);
      } catch (e) {
        setVistos(anterior);
        setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
      }
    });
  }

  function excluir(r: Recurso) {
    setErro(null);
    const fd = new FormData();
    fd.set("id", r.id);
    startTransition(async () => {
      try {
        if (modo === "materiais") await excluirMaterial(fd);
        else await excluirComplemento(fd);
        router.refresh();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível excluir.");
      }
    });
  }

  async function enviarArquivoParaStorage(file: File): Promise<string> {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Não autenticado.");
    const ext = file.name.split(".").pop() || "bin";
    const path = `${user.id}/${Date.now()}-${alvo.id}.${ext}`;
    const { error } = await supabase.storage.from("academy-materiais").upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (error) throw error;
    return supabase.storage.from("academy-materiais").getPublicUrl(path).data.publicUrl;
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (modo === "materiais" && !arquivo) {
      setErro("Selecione um arquivo.");
      return;
    }
    if (modo === "complementares" && !arquivo && !url.trim()) {
      setErro("Informe um link ou envie um arquivo.");
      return;
    }
    setEnviando(true);
    try {
      let urlFinal = url.trim();
      let tipoFinal = tipo;
      if (arquivo) {
        urlFinal = await enviarArquivoParaStorage(arquivo);
        if (modo === "complementares") tipoFinal = arquivo.name.toLowerCase().endsWith(".pdf") ? "pdf" : "outro";
      }
      const nome = titulo.trim() || arquivo?.name || urlFinal;

      const fd = new FormData();
      if (modo === "materiais") {
        fd.set(alvo.tipo === "aula" ? "aula_id" : "item_id", alvo.id);
        fd.set("nome", nome);
        fd.set("url", urlFinal);
        await registrarMaterial(fd);
      } else {
        fd.set("alvo_tipo", alvo.tipo === "aula" ? "academy_aula" : "academy_modulo_item");
        fd.set("alvo_id", alvo.id);
        fd.set("titulo", nome);
        fd.set("url", urlFinal);
        fd.set("tipo", tipoFinal);
        await criarComplemento(fd);
      }
      setTitulo("");
      setUrl("");
      setArquivo(null);
      setInputKey((k) => k + 1);
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setEnviando(false);
    }
  }

  const textoVazio =
    modo === "materiais"
      ? "Esta aula ainda não tem materiais para baixar."
      : "Ainda não há materiais complementares (artigos, vídeos, PDFs) para esta aula.";

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-stone-400">
          {modo === "materiais"
            ? "Arquivos da aula. Marque o check conforme for estudando."
            : "Leituras e vídeos extras para aprofundar. Marque o check conforme for vendo."}
        </p>
        {total > 0 && (
          <span className="shrink-0 rounded-full bg-imperium-surface px-2.5 py-1 text-xs text-stone-400">
            {feitos}/{total} vistos
          </span>
        )}
      </div>

      {itens.length === 0 ? (
        <p className="rounded-xl border border-imperium-line px-5 py-8 text-center text-sm text-stone-500">{textoVazio}</p>
      ) : (
        <ul className="space-y-2">
          {itens.map((r) => {
            const visto = vistos.has(r.id);
            const dom = dominio(r.url);
            return (
              <li key={r.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${visto ? "border-success/40 bg-success/5" : "border-imperium-line bg-imperium-surface/50"}`}>
                {r.legado ? (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center text-lg">{ICONE[r.tipo]}</span>
                ) : (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={visto}
                    aria-label={visto ? "Marcar como não visto" : "Marcar como visto"}
                    onClick={() => alternarVisto(r.id)}
                    disabled={isPending}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-sm transition ${
                      visto ? "border-success bg-success text-white" : "border-imperium-line-strong text-transparent hover:border-gold"
                    }`}
                  >
                    ✓
                  </button>
                )}
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-3">
                  {!r.legado && <span className="text-xl">{ICONE[r.tipo]}</span>}
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${visto ? "text-stone-400 line-through decoration-stone-600" : "text-stone-100"}`}>{r.titulo}</span>
                    <span className="block truncate text-xs text-stone-600">
                      {ROTULO[r.tipo]}
                      {dom && modo === "complementares" ? ` · ${dom}` : ""}
                      {r.autorNome ? ` · enviado por ${r.autorNome}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-gold">Abrir ↗</span>
                </a>
                {!r.legado && (isDiretor || r.autorId === meId) && (
                  <button
                    type="button"
                    onClick={() => excluir(r)}
                    disabled={isPending}
                    aria-label="Excluir material"
                    title="Excluir"
                    className="shrink-0 rounded px-1.5 py-1 text-xs text-stone-600 transition hover:bg-wine/20 hover:text-wine-bright"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {podeGerenciar && (
        <form onSubmit={adicionar} className="space-y-3 rounded-xl border border-dashed border-imperium-line-strong p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
            {modo === "materiais" ? "Enviar material" : "Adicionar material complementar"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`titulo-${modo}`} className="mb-1 block text-xs text-stone-400">
                Título {modo === "materiais" && "(opcional)"}
              </label>
              <input id={`titulo-${modo}`} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={modo === "materiais" ? "Ex: Slides da aula" : "Ex: Artigo sobre rapport"} className="input-imp w-full text-sm" />
            </div>
            {modo === "complementares" && (
              <div>
                <label htmlFor="tipo-complemento" className="mb-1 block text-xs text-stone-400">
                  Tipo
                </label>
                <select id="tipo-complemento" value={tipo} onChange={(e) => setTipo(e.target.value as TipoRecurso)} className="input-imp w-full text-sm">
                  <option value="artigo">Artigo / página</option>
                  <option value="video">Vídeo (YouTube etc.)</option>
                  <option value="pdf">PDF</option>
                  <option value="outro">Outro</option>
                </select>
              </div>
            )}
          </div>

          {modo === "complementares" && (
            <div>
              <label htmlFor="url-complemento" className="mb-1 block text-xs text-stone-400">
                Link
              </label>
              <input
                id="url-complemento"
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (e.target.value.startsWith("http")) setTipo(sugerirTipo(e.target.value));
                }}
                placeholder="https://…"
                disabled={!!arquivo}
                className="input-imp w-full text-sm disabled:opacity-50"
              />
            </div>
          )}

          <div>
            <label htmlFor={`arquivo-${modo}`} className="mb-1 block text-xs text-stone-400">
              {modo === "materiais" ? "Arquivo" : "Ou envie um arquivo (PDF, planilha…)"}
            </label>
            <input
              key={inputKey}
              id={`arquivo-${modo}`}
              type="file"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-stone-300 file:mr-3 file:rounded file:border-0 file:bg-imperium-surface file:px-3 file:py-1.5 file:text-xs file:text-stone-200"
            />
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={enviando} className="btn-gold px-4 py-2 text-sm disabled:opacity-50">
              {enviando ? "Salvando…" : modo === "materiais" ? "Enviar" : "Adicionar"}
            </button>
          </div>
        </form>
      )}

      {erro && <p className="text-xs text-wine-bright">{erro}</p>}
    </div>
  );
}
