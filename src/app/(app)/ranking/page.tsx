import { createClient } from "@/lib/supabase/server";

type Linha = { nome: string; tribo: string; valor: number };

const PODIO_ESTILO: Record<1 | 2 | 3, { alt: string; borda: string; texto: string; medalha: string; nomeCls: string; av: string }> = {
  1: { alt: "h-16", borda: "border-gold", texto: "text-gold-bright", medalha: "🥇", nomeCls: "text-sm", av: "h-14 w-14 text-base" },
  2: { alt: "h-11", borda: "border-stone-400", texto: "text-stone-200", medalha: "🥈", nomeCls: "text-xs", av: "h-11 w-11 text-sm" },
  3: { alt: "h-7", borda: "border-amber-700", texto: "text-amber-500", medalha: "🥉", nomeCls: "text-xs", av: "h-11 w-11 text-sm" },
};

function iniciais(nome: string) {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function PodioCard({ linha, posicao, fmt }: { linha: Linha; posicao: 1 | 2 | 3; fmt: (v: number) => string }) {
  const e = PODIO_ESTILO[posicao];
  return (
    <div className="flex w-24 flex-col items-center gap-1">
      <span className="text-base leading-none">{e.medalha}</span>
      <div
        className={`flex items-center justify-center rounded-full border-2 bg-imperium-bg font-display ${e.borda} ${e.texto} ${e.av}`}
      >
        {iniciais(linha.nome)}
      </div>
      <p
        className={`line-clamp-2 h-8 w-full text-center font-display leading-tight ${e.nomeCls} ${e.texto}`}
        title={linha.nome}
      >
        {linha.nome}
      </p>
      <p className="w-full truncate text-center text-[10px] text-stone-600" title={linha.tribo}>
        {linha.tribo}
      </p>
      <p className={`text-[11px] ${e.texto}`}>{fmt(linha.valor)}</p>
      <div className={`w-16 rounded-t border-x border-t bg-gradient-to-b from-gold/15 to-transparent ${e.borda} ${e.alt}`} />
    </div>
  );
}

function Tabela({ titulo, formato, linhas }: { titulo: string; formato: "num" | "moeda" | "pct"; linhas: Linha[] }) {
  function fmt(v: number) {
    if (formato === "moeda") return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
    if (formato === "pct") return `${v.toFixed(0)}%`;
    return v.toLocaleString("pt-BR");
  }
  const top3 = linhas.slice(0, 3);
  const resto = linhas.slice(3);

  return (
    <div className="watermark-spqr card-imp p-4">
      <h3 className="kicker mb-3">{titulo}</h3>
      {linhas.length === 0 ? (
        <p className="text-xs text-stone-600">Sem dados ainda.</p>
      ) : (
        <>
          <div className="mb-3 flex items-end justify-center gap-4 border-b border-imperium-line pb-3">
            {top3[1] && <PodioCard linha={top3[1]} posicao={2} fmt={fmt} />}
            {top3[0] && <PodioCard linha={top3[0]} posicao={1} fmt={fmt} />}
            {top3[2] && <PodioCard linha={top3[2]} posicao={3} fmt={fmt} />}
          </div>
          {resto.length > 0 && (
            <ol className="space-y-1">
              {resto.map((l, i) => (
                <li key={l.nome} className="flex justify-between text-sm">
                  <span className="text-stone-400">
                    {i + 4}. {l.nome} <span className="text-stone-600">· {l.tribo}</span>
                  </span>
                  <span className="text-stone-300">{fmt(l.valor)}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}

export default async function RankingPage() {
  const supabase = await createClient();

  const { data: pessoas } = await supabase
    .from("profiles")
    .select("id, full_name, role, tribo:tribos!profiles_tribo_id_fkey(nome, exercito:exercitos(nome))")
    .in("role", ["sdr", "closer"]);

  const idsPorRole = {
    sdr: (pessoas ?? []).filter((p) => p.role === "sdr").map((p) => p.id),
    closer: (pessoas ?? []).filter((p) => p.role === "closer").map((p) => p.id),
  };
  const todosIds = (pessoas ?? []).map((p) => p.id);

  const inicioMes = new Date().toISOString().slice(0, 7) + "-01";

  const { data: funilRows } =
    todosIds.length > 0
      ? await supabase
          .from("producao_funil")
          .select("profile_id, etapa, realizado")
          .in("profile_id", todosIds)
          .gte("data", inicioMes)
      : { data: [] };

  const { data: vendasRows } =
    todosIds.length > 0
      ? await supabase.from("vendas").select("profile_id, valor").in("profile_id", todosIds).gte("data", inicioMes)
      : { data: [] };

  const funilPorPessoa = new Map<string, Record<string, number>>();
  for (const row of funilRows ?? []) {
    if (!funilPorPessoa.has(row.profile_id)) funilPorPessoa.set(row.profile_id, {});
    const bucket = funilPorPessoa.get(row.profile_id)!;
    bucket[row.etapa] = (bucket[row.etapa] ?? 0) + row.realizado;
  }

  const vendasPorPessoa = new Map<string, { total: number; qtd: number }>();
  for (const row of vendasRows ?? []) {
    const acc = vendasPorPessoa.get(row.profile_id) ?? { total: 0, qtd: 0 };
    acc.total += Number(row.valor);
    acc.qtd += 1;
    vendasPorPessoa.set(row.profile_id, acc);
  }

  function nomeETribo(id: string) {
    const p = pessoas!.find((x) => x.id === id)!;
    const tribo = p.tribo as unknown as { nome: string; exercito: { nome: string } | null } | null;
    return { nome: p.full_name, tribo: tribo?.exercito?.nome ?? tribo?.nome ?? "—" };
  }

  function topPorEtapa(ids: string[], etapa: string, n = 10): Linha[] {
    return ids
      .map((id) => ({ id, valor: funilPorPessoa.get(id)?.[etapa] ?? 0 }))
      .filter((x) => x.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, n)
      .map((x) => ({ ...nomeETribo(x.id), valor: x.valor }));
  }

  function topPagos(ids: string[], n = 10): Linha[] {
    return ids
      .map((id) => ({ id, valor: vendasPorPessoa.get(id)?.total ?? 0 }))
      .filter((x) => x.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, n)
      .map((x) => ({ ...nomeETribo(x.id), valor: x.valor }));
  }

  function topTicketMedio(ids: string[], n = 10): Linha[] {
    return ids
      .map((id) => {
        const v = vendasPorPessoa.get(id);
        return { id, valor: v && v.qtd > 0 ? v.total / v.qtd : 0 };
      })
      .filter((x) => x.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, n)
      .map((x) => ({ ...nomeETribo(x.id), valor: x.valor }));
  }

  function topConversao(ids: string[], n = 10): Linha[] {
    return ids
      .map((id) => {
        const f = funilPorPessoa.get(id) ?? {};
        const entrevistas = f["entrevistas"] ?? 0;
        const assinaturas = f["assinaturas"] ?? 0;
        return { id, valor: entrevistas > 0 ? (assinaturas / entrevistas) * 100 : 0 };
      })
      .filter((x) => x.valor > 0)
      .sort((a, b) => b.valor - a.valor)
      .slice(0, n)
      .map((x) => ({ ...nomeETribo(x.id), valor: x.valor }));
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-gold-bright">Ranking</h1>
          <p className="kicker mt-1">Mês corrente · corte geral do Império</p>
        </div>
        <a href="/api/export/ranking" className="btn-outline text-xs">
          Exportar CSV
        </a>
      </div>

      <section>
        <h2 className="kicker mb-3">SDR</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Tabela titulo="Entrevistas" formato="num" linhas={topPorEtapa(idsPorRole.sdr, "entrevistas")} />
          <Tabela titulo="Assinados" formato="num" linhas={topPorEtapa(idsPorRole.sdr, "assinaturas")} />
          <Tabela titulo="Pagos (R$)" formato="moeda" linhas={topPagos(idsPorRole.sdr)} />
        </div>
      </section>

      <section>
        <h2 className="kicker mb-3">Closer</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Tabela titulo="Entrevistas" formato="num" linhas={topPorEtapa(idsPorRole.closer, "entrevistas")} />
          <Tabela titulo="Assinados" formato="num" linhas={topPorEtapa(idsPorRole.closer, "assinaturas")} />
          <Tabela titulo="Ticket Médio" formato="moeda" linhas={topTicketMedio(idsPorRole.closer)} />
          <Tabela
            titulo="Conversão Entrevista → Assinado"
            formato="pct"
            linhas={topConversao(idsPorRole.closer)}
          />
          <Tabela titulo="Pagos (R$)" formato="moeda" linhas={topPagos(idsPorRole.closer)} />
        </div>
      </section>
    </main>
  );
}
