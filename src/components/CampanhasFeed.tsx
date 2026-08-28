"use client";

import { useMemo, useState } from "react";
import { excluirCampanha } from "@/app/(app)/campanhas/actions";
import { FUNNEL_LABELS, type FunilEtapa } from "@/lib/funil";
import { type CampanhaComProgresso } from "@/lib/campanhas";
import { IconSwords, IconCrown } from "@/components/ui/icons";
import ComentariosReacoes from "@/components/ui/ComentariosReacoes";
import type { Comentario, ReacaoResumo } from "@/lib/social";

type Filtro = "principal" | "geral" | "envolvido" | "duelos_pessoas" | "duelos_times";

const FILTROS: { valor: Filtro; label: string }[] = [
  { valor: "principal", label: "Principal" },
  { valor: "geral", label: "Campanhas Gerais" },
  { valor: "envolvido", label: "Apenas as que estou envolvido" },
  { valor: "duelos_pessoas", label: "Duelos de pessoas" },
  { valor: "duelos_times", label: "Duelos de Exércitos e/ou Tribos" },
];

function iniciais(nome: string) {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function ParticipanteBarra({
  p,
  i,
  c,
  fmt,
  max,
}: {
  p: CampanhaComProgresso["participantes"][number];
  i: number;
  c: CampanhaComProgresso;
  fmt: (v: number) => string;
  max: number;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={`flex items-center gap-1 ${i === 0 && c.alvo !== "geral" ? "text-gold-bright" : "text-stone-300"}`}>
          {i === 0 && c.alvo !== "geral" && <IconCrown className="h-3.5 w-3.5" />}
          {p.label}
        </span>
        <span className="text-stone-400">
          {fmt(p.valor)}
          {c.metaValor ? ` / ${fmt(c.metaValor)}` : ""}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-imperium-line">
        <div
          className={`h-full rounded-full ${i === 0 ? "bg-gradient-to-r from-gold to-gold-bright" : "bg-wine"}`}
          style={{ width: `${Math.min(100, (p.valor / max) * 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function CampanhasFeed({
  campanhas,
  podeGerenciar,
  meId,
  meTriboId,
  meExercitoId,
  isDiretor,
  comentariosPorCampanha,
  reacoesPorCampanha,
  pessoas,
}: {
  campanhas: CampanhaComProgresso[];
  podeGerenciar: boolean;
  meId: string;
  meTriboId: string | null;
  meExercitoId: string | null;
  isDiretor: boolean;
  comentariosPorCampanha: Map<string, Comentario[]>;
  reacoesPorCampanha: Map<string, ReacaoResumo>;
  pessoas: { id: string; nome: string }[];
}) {
  const [filtro, setFiltro] = useState<Filtro>("principal");

  // Pedido do Diretor (2026-08-27): 5 filtros pra separar o feed de
  // Campanhas — "Principal" (tudo), "Campanhas Gerais" (meta da empresa
  // toda), "Apenas as que estou envolvido" (sou participante direto —
  // pessoa, minha Tribo ou meu Exército), e os dois tipos de duelo
  // separados (pessoa vs. Tribo/Exército).
  function envolvido(c: CampanhaComProgresso): boolean {
    if (c.alvo === "individual" || c.alvo === "grupo_rank") return c.participantes.some((p) => p.refId === meId);
    if (c.alvo === "tribo") return !!meTriboId && c.participantes.some((p) => p.refId === meTriboId);
    if (c.alvo === "exercito") return !!meExercitoId && c.participantes.some((p) => p.refId === meExercitoId);
    return false; // "geral" é da empresa toda, não é "estar envolvido" especificamente
  }

  const campanhasFiltradas = useMemo(() => {
    return campanhas.filter((c) => {
      if (filtro === "geral") return c.alvo === "geral";
      if (filtro === "envolvido") return envolvido(c);
      if (filtro === "duelos_pessoas") return c.alvo === "individual";
      if (filtro === "duelos_times") return c.alvo === "tribo" || c.alvo === "exercito";
      return true; // "principal" = tudo
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campanhas, filtro, meId, meTriboId, meExercitoId]);

  return (
    // Card inteiro virou colapsável (pedido do Diretor, 2026-08-27: "a
    // parte de campanhas no mural tá bem grande... como otimizar o layout
    // pra não ficar um feed enorme") — mesmo padrão já usado em "Publicar
    // no Mural" logo abaixo. Aberto por padrão (é conteúdo que interessa),
    // mas dá pra fechar quando não tiver nada novo pra conferir.
    <details open className="card-imp group">
      <summary className="kicker flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
        <span>Campanhas do mês ({campanhas.length})</span>
        <span className="text-[10px] normal-case text-stone-500 transition group-open:rotate-180">▾</span>
      </summary>

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            type="button"
            onClick={() => setFiltro(f.valor)}
            className={`rounded-full px-3 py-1 text-[11px] transition ${
              filtro === f.valor ? "bg-gold text-imperium-bg" : "border border-imperium-line text-stone-400 hover:border-gold/40"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {campanhasFiltradas.length === 0 && (
          <p className="text-sm text-stone-500 sm:col-span-2">Nenhuma campanha nesse filtro agora.</p>
        )}
        {campanhasFiltradas.map((c) => {
          const metricaLabel = c.metrica === "credito" ? "R$" : c.metrica === "pontuacao" ? "pts" : FUNNEL_LABELS[c.metrica as FunilEtapa] ?? c.metrica;
          const fmt = (v: number) =>
            c.metrica === "credito"
              ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
              : c.metrica === "pontuacao"
                ? `${Number(v.toFixed(1))} ${metricaLabel}`
                : `${v} ${metricaLabel}`;
          // "Entrevistas valerá uma pontuação e assinaturas outra" (pedido
          // do Diretor, 2026-08-28) — mostra a régua de pesos no card, pra
          // quem tá duelando saber quanto vale cada etapa.
          const pesosLabel =
            c.metrica === "pontuacao" && c.pesos
              ? Object.entries(c.pesos)
                  .map(([etapa, peso]) => `${FUNNEL_LABELS[etapa as FunilEtapa] ?? etapa} = ${peso} pts`)
                  .join(" · ")
              : null;
          const max = Math.max(...c.participantes.map((p) => p.valor), c.metaValor ?? 0, 1);
          const comentarios = comentariosPorCampanha.get(c.id) ?? [];

          // Duelo 1x1 (alvo="individual" com exatamente 2 participantes) —
          // pedido do Diretor (2026-08-27): "ao invés de eu colocar fotos
          // nos duelos, coloca a foto de quem tá duelando, um na esquerda e
          // um na direita" — em vez da imagem genérica da campanha (que
          // ainda existe pros outros tipos de campanha).
          const duelo = c.alvo === "individual" && c.participantes.length === 2 ? c.participantes : null;

          return (
            <div key={c.id} id={`campanha-${c.id}`} className="scroll-mt-20 overflow-hidden rounded-lg border border-gold/30">
              {duelo ? (
                <div className="relative flex items-center bg-imperium-bg/60">
                  {duelo.map((p, i) => (
                    <div key={p.refId} className={`flex flex-1 flex-col items-center gap-1.5 py-3 ${i === 0 ? "border-r border-gold/20" : ""}`}>
                      {p.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatarUrl} alt={p.label} className="h-14 w-14 rounded-full border border-gold/40 object-cover" />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-gold/40 bg-imperium-surface text-sm text-gold">
                          {iniciais(p.label)}
                        </div>
                      )}
                      <span className="max-w-[90%] truncate text-[11px] text-stone-300">{p.label}</span>
                    </div>
                  ))}
                  <div className="absolute left-1/2 top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-gold/50 bg-imperium-surface">
                    <IconSwords className="h-3 w-3 text-gold" />
                  </div>
                </div>
              ) : (
                c.imagemUrl && (
                  // Mantém a imagem grande (proporção 4:3) — pedido explícito
                  // do Diretor (2026-08-27) ao pedir os filtros: "mantém as
                  // imagens das campanhas grandes, sem problemas".
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.imagemUrl}
                    alt={c.titulo}
                    className="aspect-[4/3] w-full object-cover"
                    style={{ objectPosition: c.imagemPosicao === "top" ? "center top" : c.imagemPosicao === "bottom" ? "center bottom" : "center" }}
                  />
                )
              )}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-base text-gold-bright">{c.titulo}</p>
                  {podeGerenciar && (
                    <form action={excluirCampanha}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="shrink-0 text-[10px] text-stone-600 hover:text-wine-bright">
                        Excluir
                      </button>
                    </form>
                  )}
                </div>
                {c.descricao && <p className="mt-1 text-xs text-stone-400">{c.descricao}</p>}
                {pesosLabel && <p className="mt-1 text-[11px] text-gold">{pesosLabel}</p>}
                {c.requisitosMinimos && (
                  <p className="mt-1.5 text-[11px] text-stone-500">
                    <span className="text-stone-600">Requisitos mínimos: </span>
                    {c.requisitosMinimos}
                  </p>
                )}
                {c.recompensa && (
                  <p className="mt-1 text-[11px] text-gold">
                    <span className="text-stone-600">Recompensa: </span>
                    {c.recompensa}
                  </p>
                )}
                <p className="mt-1 text-[10px] uppercase tracking-wide text-stone-600">
                  até {new Date(c.dataFim + "T00:00:00").toLocaleDateString("pt-BR")}
                </p>

                {/* Ranking já vem ordenado (mais perto da meta primeiro) —
                    mostra só o top 3 de cara, resto fica atrás de "Ver
                    todos" (pedido do Diretor, 2026-08-24 — evita expor
                    quem tá bem atrás pra quem só quer ver os líderes). */}
                <div className="mt-3 space-y-2">
                  {c.participantes.slice(0, 3).map((p, i) => (
                    <ParticipanteBarra key={p.refId} p={p} i={i} c={c} fmt={fmt} max={max} />
                  ))}
                </div>
                {c.participantes.length > 3 && (
                  <details className="group/rank mt-2">
                    <summary className="cursor-pointer list-none text-[10px] uppercase tracking-wide text-stone-500 hover:text-gold [&::-webkit-details-marker]:hidden">
                      Ver todos ({c.participantes.length}) <span className="transition group-open/rank:rotate-180">▾</span>
                    </summary>
                    <div className="mt-2 space-y-2">
                      {c.participantes.slice(3).map((p, i) => (
                        <ParticipanteBarra key={p.refId} p={p} i={i + 3} c={c} fmt={fmt} max={max} />
                      ))}
                    </div>
                  </details>
                )}

                {/* Comentários/reações colapsados por padrão — junto com o
                    resto (imagem menor, card inteiro colapsável), é o que
                    mais engordava o feed (thread sem limite, sempre aberta). */}
                <details className="group/coment mt-3">
                  <summary className="cursor-pointer list-none text-[10px] uppercase tracking-wide text-stone-500 hover:text-gold [&::-webkit-details-marker]:hidden">
                    💬 Comentários e reações{comentarios.length > 0 ? ` (${comentarios.length})` : ""}{" "}
                    <span className="transition group-open/coment:rotate-180">▾</span>
                  </summary>
                  <div className="mt-2">
                    <ComentariosReacoes
                      alvoTipo="campanha"
                      alvoId={c.id}
                      meId={meId}
                      isDiretor={isDiretor}
                      comentarios={comentarios}
                      reacoes={reacoesPorCampanha.get(c.id) ?? { porEmoji: [], minhaReacao: null }}
                      pessoas={pessoas}
                    />
                  </div>
                </details>
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}
