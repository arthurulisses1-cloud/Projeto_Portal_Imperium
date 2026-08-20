import type { SupabaseClient } from "@supabase/supabase-js";
import { calcularRemuneracao, type Tier, type Remuneracao, type Papel } from "@/lib/comissao";
import { PAPEL_PRINCIPAL, type Rank } from "@/lib/carreira";

export type LinhaExtrato = {
  id: string;
  data: string;
  cliente: string | null;
  origem: string | null;
  valor: number;
  papel: "sdr" | "closer" | "ambos" | "time";
  multiplicador: number | null;
};

export type RemuneracaoMes = {
  tiers: Tier[];
  remuneracao: Remuneracao | null;
  extrato: LinhaExtrato[];
  papelPrincipal: Papel;
  producaoPrincipal: number;
  producaoTotal: number;
};

const VAZIO = (tiers: Tier[], papelPrincipal: Papel): RemuneracaoMes => ({
  tiers,
  remuneracao: null,
  extrato: [],
  papelPrincipal,
  producaoPrincipal: 0,
  producaoTotal: 0,
});

// Calcula a remuneração real do mês pra QUALQUER papel — substitui o hack de
// "cargo equivalente" (Tribuno usando a tabela de Legionário pra contar
// venda como SDR): agora cada rank tem as 3 colunas (SDR/Closer/Gestão) no
// MESMO tier, escolhido pela produção do papel PRINCIPAL do cargo. Papéis
// cruzados (SDR fechando como Closer, Closer prospectando como SDR, Líder
// fechando pessoalmente) são remunerados pela % do papel exercido NAQUELA
// venda, sobre o mesmo tier — sem fixo extra, sem tabela emprestada.
//
// Líder/Diretor: a produção de Gestão (%) é a do time/firma EXCLUINDO
// qualquer operação onde a própria pessoa foi SDR ou Closer — essa parte já
// é remunerada como produção pessoal (evita contar a mesma venda duas vezes:
// uma como "ele fechou" e outra como "o time dele fechou").
export async function buscarRemuneracaoMes(
  supabase: SupabaseClient,
  profileId: string,
  role: string,
  rank: Rank | "diretor",
  inicioMes: string
): Promise<RemuneracaoMes> {
  const papelPrincipal = PAPEL_PRINCIPAL[rank] ?? "sdr";

  const { data: tiersRaw } = await supabase
    .from("commission_tiers")
    .select("producao_min, fixo, pct_sdr, pct_closer, pct_gestao")
    .eq("rank", rank)
    .order("ordem");
  const tiers = [...(tiersRaw ?? [])].sort((a, b) => a.producao_min - b.producao_min);
  if (tiers.length === 0) return VAZIO(tiers, papelPrincipal);

  if (role === "lider" || role === "diretor") {
    const { data: opsPagas } = await supabase
      .from("weekly_operacoes")
      .select("id, data, valor, origem, cliente, sdr_profile_id, closer_profile_id")
      .eq("status", "PAGO")
      .gte("data", inicioMes);

    let opsDoEscopo = opsPagas ?? [];

    if (role === "lider") {
      const { data: exercitoLiderado } = await supabase
        .from("exercitos")
        .select("id")
        .eq("legado_id", profileId)
        .maybeSingle();
      if (!exercitoLiderado) return VAZIO(tiers, papelPrincipal);

      const idsEnvolvidos = Array.from(
        new Set(opsDoEscopo.flatMap((o) => [o.sdr_profile_id, o.closer_profile_id]).filter((x): x is string => !!x))
      );
      const [{ data: pessoas }, { data: exercitos }] = await Promise.all([
        idsEnvolvidos.length > 0
          ? supabase.from("profiles").select("id, tribo:tribos!profiles_tribo_id_fkey(exercito_id)").in("id", idsEnvolvidos)
          : Promise.resolve({ data: [] }),
        supabase.from("exercitos").select("id, legado_id"),
      ]);
      const exercitoIdPorLegadoId = new Map((exercitos ?? []).map((e) => [e.legado_id, e.id]));
      const exercitoPorProfileId = new Map(
        (pessoas ?? []).map((p) => [
          p.id,
          (p.tribo as unknown as { exercito_id: string } | null)?.exercito_id ?? exercitoIdPorLegadoId.get(p.id) ?? null,
        ])
      );

      opsDoEscopo = opsDoEscopo.filter((o) => {
        const timeDaOperacao =
          (o.closer_profile_id && exercitoPorProfileId.get(o.closer_profile_id)) ||
          (o.sdr_profile_id && exercitoPorProfileId.get(o.sdr_profile_id));
        return timeDaOperacao === exercitoLiderado.id;
      });
    }

    const producaoPessoalSdr = opsDoEscopo
      .filter((o) => o.sdr_profile_id === profileId)
      .reduce((s, o) => s + Number(o.valor), 0);
    const producaoPessoalCloser = opsDoEscopo
      .filter((o) => o.closer_profile_id === profileId)
      .reduce((s, o) => s + Number(o.valor), 0);
    const producaoGestao = opsDoEscopo
      .filter((o) => o.sdr_profile_id !== profileId && o.closer_profile_id !== profileId)
      .reduce((s, o) => s + Number(o.valor), 0);

    const remuneracao = calcularRemuneracao(tiers, producaoGestao, {
      sdr: producaoPessoalSdr,
      closer: producaoPessoalCloser,
      gestao: producaoGestao,
    });

    const extrato: LinhaExtrato[] = opsDoEscopo.map((o) => ({
      id: o.id,
      data: o.data,
      cliente: o.cliente,
      origem: o.origem,
      valor: Number(o.valor),
      papel:
        o.sdr_profile_id === profileId && o.closer_profile_id === profileId
          ? "ambos"
          : o.closer_profile_id === profileId
            ? "closer"
            : o.sdr_profile_id === profileId
              ? "sdr"
              : "time",
      multiplicador: null,
    }));

    const producaoTotal = opsDoEscopo.reduce((s, o) => s + Number(o.valor), 0);

    return { tiers, remuneracao, extrato, papelPrincipal, producaoPrincipal: producaoGestao, producaoTotal };
  }

  const { data: vendasRaw } = await supabase
    .from("vendas")
    .select("id, data, valor, origem, multiplicador, cliente, papel")
    .eq("profile_id", profileId)
    .gte("data", inicioMes)
    .order("data", { ascending: false });
  const vendasMes = vendasRaw ?? [];

  const producaoSdr = vendasMes
    .filter((v) => v.papel === "sdr" || v.papel === "ambos")
    .reduce((s, v) => s + Number(v.valor), 0);
  const producaoCloser = vendasMes
    .filter((v) => v.papel === "closer" || v.papel === "ambos")
    .reduce((s, v) => s + Number(v.valor), 0);
  const producaoPrincipal = papelPrincipal === "sdr" ? producaoSdr : producaoCloser;

  const remuneracao = calcularRemuneracao(tiers, producaoPrincipal, {
    sdr: producaoSdr,
    closer: producaoCloser,
    gestao: 0,
  });

  const extrato: LinhaExtrato[] = vendasMes.map((v) => ({
    id: v.id,
    data: v.data,
    cliente: v.cliente,
    origem: v.origem,
    valor: Number(v.valor),
    papel: (v.papel as "sdr" | "closer" | "ambos" | null) ?? "closer",
    multiplicador: v.multiplicador,
  }));

  const producaoTotal = vendasMes.reduce((s, v) => s + Number(v.valor), 0);

  return { tiers, remuneracao, extrato, papelPrincipal, producaoPrincipal, producaoTotal };
}
