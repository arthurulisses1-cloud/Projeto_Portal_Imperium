import { createClient } from "@/lib/supabase/server";
import ForecastView from "@/components/forecast/ForecastView";
import { podeEditarOperacao, type ForecastOp } from "@/lib/forecast";

export default async function ForecastPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: meProfile } = await supabase.from("profiles").select("id, role").eq("id", user.id).single();
  if (!meProfile || !["closer", "lider", "diretor"].includes(meProfile.role)) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-xl text-gold-bright">Acesso restrito</h1>
        <p className="mt-2 text-sm text-stone-400">
          O Forecast é uma visão de Closers, líderes e Diretoria.
        </p>
      </main>
    );
  }

  // Se for líder, descobre qual Exército ele lidera.
  let exercitoLideradoId: string | null = null;
  let exercitoLideradoNome: string | null = null;
  if (meProfile.role === "lider") {
    const { data: ex } = await supabase
      .from("exercitos")
      .select("id, nome")
      .eq("legado_id", user.id)
      .maybeSingle();
    exercitoLideradoId = ex?.id ?? null;
    exercitoLideradoNome = ex?.nome ?? null;
  }

  const hoje = new Date();
  const inicioMes = hoje.toISOString().slice(0, 7) + "-01";
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [{ data: opRows }, { data: exercitos }] = await Promise.all([
    supabase
      .from("weekly_operacoes")
      .select("id, data, cliente, sdr_profile_id, closer_profile_id, valor, status, status_manual, observacao")
      .gte("data", inicioMes)
      .lte("data", fimMes)
      .order("data", { ascending: false }),
    supabase.from("exercitos").select("id, nome"),
  ]);

  const nomeExercitoPorId = new Map((exercitos ?? []).map((e) => [e.id, e.nome]));

  const idsEnvolvidos = Array.from(
    new Set((opRows ?? []).flatMap((o) => [o.sdr_profile_id, o.closer_profile_id]).filter((x): x is string => !!x))
  );

  const { data: pessoas } =
    idsEnvolvidos.length > 0
      ? await supabase
          .from("profiles")
          .select("id, full_name, tribo_id, tribo:tribos!profiles_tribo_id_fkey(nome, exercito_id)")
          .in("id", idsEnvolvidos)
      : { data: [] };

  const pessoaPorId = new Map(
    (pessoas ?? []).map((p) => {
      const tribo = p.tribo as unknown as { nome: string; exercito_id: string } | null;
      const exercitoNome = tribo?.exercito_id ? nomeExercitoPorId.get(tribo.exercito_id) ?? null : null;
      return [
        p.id,
        {
          nome: p.full_name,
          triboNome: tribo?.nome ?? null,
          exercitoId: tribo?.exercito_id ?? null,
          // "chave" namespada por Exército — evita colidir tribos com o mesmo
          // nome em Exércitos diferentes (ex.: "Inbound" existe nos dois).
          triboChave: tribo?.nome ? `${exercitoNome ?? "?"}|${tribo.nome}` : null,
        },
      ];
    })
  );

  const todasOps: ForecastOp[] = (opRows ?? []).map((o) => {
    const sdr = o.sdr_profile_id ? pessoaPorId.get(o.sdr_profile_id) : undefined;
    const closer = o.closer_profile_id ? pessoaPorId.get(o.closer_profile_id) : undefined;
    return {
      id: o.id,
      data: o.data,
      cliente: o.cliente,
      sdrNome: sdr?.nome ?? o.sdr_profile_id ?? null,
      sdrTribo: sdr?.triboChave ?? null,
      closerNome: closer?.nome ?? o.closer_profile_id ?? null,
      closerId: o.closer_profile_id,
      closerTribo: closer?.triboChave ?? null,
      valor: Number(o.valor),
      status: o.status,
      statusManual: o.status_manual,
      observacao: o.observacao,
      podeEditar: podeEditarOperacao(
        { id: user.id, role: meProfile.role, exercitoLideradoId },
        {
          closerProfileId: o.closer_profile_id,
          sdrExercitoId: sdr?.exercitoId ?? null,
          closerExercitoId: closer?.exercitoId ?? null,
        }
      ),
    };
  });

  // Escopo por papel: closer só vê os próprios (como closer); líder só vê o
  // próprio Exército (como SDR ou Closer); Diretor vê tudo.
  let ops: ForecastOp[];
  if (meProfile.role === "closer") {
    ops = todasOps.filter((o) => o.closerId === user.id);
  } else if (meProfile.role === "lider" && exercitoLideradoId) {
    ops = (opRows ?? [])
      .map((o, i) => ({ raw: o, computed: todasOps[i] }))
      .filter(({ raw }) => {
        const sdrEx = raw.sdr_profile_id ? pessoaPorId.get(raw.sdr_profile_id)?.exercitoId : null;
        const closerEx = raw.closer_profile_id ? pessoaPorId.get(raw.closer_profile_id)?.exercitoId : null;
        return sdrEx === exercitoLideradoId || closerEx === exercitoLideradoId;
      })
      .map(({ computed }) => computed);
  } else {
    ops = todasOps;
  }

  // Opções de filtro por tribo — namespadas com o mesmo formato "Exército|Tribo"
  // usado em sdrTribo/closerTribo, com um rótulo amigável separado.
  const chavesTribos = new Set<string>();
  for (const op of ops) {
    if (op.sdrTribo) chavesTribos.add(op.sdrTribo);
    if (op.closerTribo) chavesTribos.add(op.closerTribo);
  }
  const tribosFiltro = Array.from(chavesTribos)
    .sort()
    .map((chave) => {
      const [exercitoNome, triboNome] = chave.split("|");
      return { chave, label: meProfile.role === "diretor" ? `${exercitoNome} · ${triboNome}` : triboNome };
    });

  return (
    <ForecastView
      ops={ops}
      escopoLabel={
        meProfile.role === "closer"
          ? "Seus assinados do mês"
          : meProfile.role === "lider"
            ? `${exercitoLideradoNome ?? "Seu Exército"} · todas as tribos`
            : "Império inteiro"
      }
      tribos={meProfile.role === "closer" ? [] : tribosFiltro}
    />
  );
}
