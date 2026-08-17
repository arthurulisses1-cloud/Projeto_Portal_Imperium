import { createClient } from "@/lib/supabase/server";

type Linha = { nome: string; tribo: string; valor: number };

function Tabela({ titulo, formato, linhas }: { titulo: string; formato: "num" | "moeda" | "pct"; linhas: Linha[] }) {
  function fmt(v: number) {
    if (formato === "moeda") return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    if (formato === "pct") return `${v.toFixed(0)}%`;
    return v.toLocaleString("pt-BR");
  }
  return (
    <div className="card-imp p-4">
      <h3 className="kicker mb-3">{titulo}</h3>
      {linhas.length === 0 ? (
        <p className="text-xs text-stone-600">Sem dados ainda.</p>
      ) : (
        <ol className="space-y-1">
          {linhas.map((l, i) => (
            <li key={l.nome} className="flex justify-between text-sm">
              <span className={i === 0 ? "text-gold-bright" : "text-stone-300"}>
                {i + 1}. {l.nome} <span className="text-stone-600">· {l.tribo}</span>
              </span>
              <span className={i === 0 ? "text-gold-bright" : "text-gold"}>{fmt(l.valor)}</span>
            </li>
          ))}
        </ol>
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
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Ranking</h1>
        <p className="kicker mt-1">Mês corrente · corte geral do Império</p>
      </div>

      <section>
        <h2 className="kicker mb-3">SDR</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Tabela titulo="Tentativas" formato="num" linhas={topPorEtapa(idsPorRole.sdr, "tentativas")} />
          <Tabela titulo="Conexões" formato="num" linhas={topPorEtapa(idsPorRole.sdr, "conexoes")} />
          <Tabela titulo="Entrevistas" formato="num" linhas={topPorEtapa(idsPorRole.sdr, "entrevistas")} />
          <Tabela titulo="Subidos" formato="num" linhas={topPorEtapa(idsPorRole.sdr, "subidos")} />
          <Tabela titulo="Assinados" formato="num" linhas={topPorEtapa(idsPorRole.sdr, "assinaturas")} />
          <Tabela titulo="Pagos (R$)" formato="moeda" linhas={topPagos(idsPorRole.sdr)} />
        </div>
      </section>

      <section>
        <h2 className="kicker mb-3">Closer</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Tabela titulo="Entrevistas" formato="num" linhas={topPorEtapa(idsPorRole.closer, "entrevistas")} />
          <Tabela titulo="Subidos" formato="num" linhas={topPorEtapa(idsPorRole.closer, "subidos")} />
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
