import { createClient } from "@/lib/supabase/server";
import { getViewerContext } from "@/lib/preview";
import { calcularThreshold, buscarProducaoMesParaMarcos } from "@/lib/marcos";
import Card from "@/components/ui/Card";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function iniciais(nome: string) {
  return nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

// "Corrida dos Marcos" (pedido do Diretor, 2026-08-29) — vitrine de quem já
// ganhou o quê e quem tá mais perto do próximo, pra todo mundo acompanhar.
// Puramente leitura: quem confirma um resgate continua sendo em /legado.
export default async function MarcosPage() {
  const supabase = await createClient();
  const viewer = await getViewerContext(supabase);
  if (!viewer) return null;

  const hoje = new Date();
  const inicioMes = hoje.toISOString().slice(0, 7) + "-01";

  const [{ data: pessoasRaw }, { data: marcosRaw }, { data: resgatesRaw }, { data: exercitosRaw }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role, avatar_url, tribo:tribos!profiles_tribo_id_fkey(nome, exercito:exercitos(nome))")
      .in("role", ["sdr", "closer", "lider"])
      .eq("ativo", true)
      .order("full_name"),
    supabase.from("marcos").select("id, nome, threshold, icone, imagem_url").order("ordem"),
    supabase
      .from("marcos_resgates")
      .select("id, profile_id, marco_id, competencia, criado_em, profile:profiles!marcos_resgates_profile_id_fkey(full_name)")
      .order("criado_em", { ascending: false }),
    // Legado do Exército não tem tribo_id (lidera o time inteiro) — mesmo
    // fallback usado em toda tela que agrupa por Exército.
    supabase.from("exercitos").select("nome, legado_id"),
  ]);

  const pessoas = pessoasRaw ?? [];
  const marcos = marcosRaw ?? [];
  const resgates = resgatesRaw ?? [];
  const exercitoPorLegado = new Map((exercitosRaw ?? []).map((e) => [e.legado_id, e.nome]));

  const ids = pessoas.map((p) => p.id);
  const producaoMesPorPessoa = await buscarProducaoMesParaMarcos(supabase, ids, inicioMes);

  const marcosResgatadosPorPessoa = new Map<string, Set<string>>();
  for (const r of resgates) {
    if (!marcosResgatadosPorPessoa.has(r.profile_id)) marcosResgatadosPorPessoa.set(r.profile_id, new Set());
    marcosResgatadosPorPessoa.get(r.profile_id)!.add(r.marco_id);
  }
  const marcoPorId = new Map(marcos.map((m) => [m.id, m]));

  const corrida = pessoas
    .map((p) => {
      const tribo = p.tribo as unknown as { nome: string; exercito: { nome: string } | null } | null;
      const exercito = tribo?.exercito?.nome ?? exercitoPorLegado.get(p.id) ?? null;
      const producao = producaoMesPorPessoa.get(p.id) ?? 0;
      const jaGanhou = marcosResgatadosPorPessoa.get(p.id) ?? new Set<string>();
      const marcosDaPessoa = marcos.map((m) => ({ ...m, threshold: calcularThreshold(m.nome, m.threshold, p.role) }));
      const conquistados = marcosDaPessoa.filter((m) => jaGanhou.has(m.id));
      const proximo = marcosDaPessoa.filter((m) => !jaGanhou.has(m.id)).sort((a, b) => a.threshold - b.threshold)[0] ?? null;
      const progresso = proximo ? Math.min(100, (producao / proximo.threshold) * 100) : 100;
      return {
        id: p.id,
        nome: p.full_name,
        role: p.role,
        avatarUrl: p.avatar_url,
        exercito,
        producao,
        conquistados,
        proximo,
        falta: proximo ? Math.max(0, proximo.threshold - producao) : 0,
        progresso,
      };
    })
    // Quem já bateu tudo vai pro fim (nada de mostrar "0% de progresso" pra
    // quem esgotou os marcos) — entre os demais, mais perto do próximo primeiro.
    .sort((a, b) => {
      if (!a.proximo && !b.proximo) return b.producao - a.producao;
      if (!a.proximo) return 1;
      if (!b.proximo) return -1;
      return b.progresso - a.progresso;
    });

  const ROLE_LABEL: Record<string, string> = { sdr: "SDR", closer: "Closer", lider: "Líder" };

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Corrida dos Marcos</h1>
        <p className="kicker mt-1">Quem já ganhou o quê, e quem tá mais perto do próximo</p>
      </div>

      <Card title="Prêmios entregues até hoje">
        {resgates.length === 0 ? (
          <p className="text-sm text-stone-500">Ninguém resgatou um marco ainda.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {resgates.map((r) => {
              const marco = marcoPorId.get(r.marco_id);
              const nomePessoa = (r.profile as unknown as { full_name: string } | null)?.full_name ?? "—";
              return (
                <li key={r.id} className="flex items-center justify-between rounded border border-imperium-line bg-imperium-bg/40 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 text-stone-200">
                    <span className="text-lg">{marco?.icone ?? "🏆"}</span>
                    <span>
                      {nomePessoa} <span className="text-stone-500">— {marco?.nome ?? "marco removido"}</span>
                    </span>
                  </span>
                  <span className="text-xs text-stone-600">
                    {new Date(r.criado_em).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={`A corrida (${corrida.length} pessoas)`}>
        <div className="space-y-3">
          {corrida.map((c) => (
            <div key={c.id} className="rounded-lg border border-imperium-line bg-imperium-bg/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  {c.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.avatarUrl} alt={c.nome} className="h-9 w-9 rounded-full border border-gold/40 object-cover" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 bg-imperium-surface text-xs text-gold">
                      {iniciais(c.nome)}
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-stone-100">{c.nome}</p>
                    <p className="text-[11px] text-stone-500">
                      {ROLE_LABEL[c.role] ?? c.role}
                      {c.exercito ? ` · ${c.exercito}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {c.conquistados.length === 0 ? (
                    <span className="text-[11px] text-stone-600">ainda sem marco</span>
                  ) : (
                    c.conquistados.map((m) => (
                      <span key={m.id} title={m.nome} className="rounded-full border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-sm">
                        {m.icone}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-2.5">
                {c.proximo ? (
                  <>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-stone-400">
                        Próximo: {c.proximo.icone} {c.proximo.nome}
                      </span>
                      <span className="text-stone-400">
                        {moeda(c.producao)} / {moeda(c.proximo.threshold)}
                        <span className="ml-2 text-gold">faltam {moeda(c.falta)}</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-imperium-line">
                      <div
                        className={`h-full rounded-full ${c.progresso >= 100 ? "bg-success-bright" : "bg-gradient-to-r from-gold to-gold-bright"}`}
                        style={{ width: `${c.progresso}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-success-bright">🏆 Conquistou todos os marcos disponíveis hoje.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {viewer.effectiveRole === "diretor" && (
        <p className="text-center text-xs text-stone-600">
          Confirmar um resgate novo é em{" "}
          <a href="/legado" className="text-gold hover:underline">
            Meu Legado
          </a>
          .
        </p>
      )}
    </main>
  );
}
