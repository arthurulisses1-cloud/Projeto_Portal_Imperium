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
  sdrNome: string | null;
  closerNome: string | null;
};

// vendas e weekly_operacoes nascem da MESMA linha da planilha "Assinado"
// (ver src/lib/sync/assinado.ts) — vendas credita cada pessoa num registro
// separado (sem guardar o par SDR+Closer), weekly_operacoes guarda os dois
// profile_id juntos. Casando por data+valor+cliente (mesma origem, mesmos
// valores) dá pra recuperar "quem fez o outro papel" pro extrato pessoal.
function chaveOperacao(data: string, valor: number, cliente: string | null): string {
  return `${data}|${valor.toFixed(2)}|${(cliente ?? "").trim().toLowerCase()}`;
}

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

    // Operação solo (mesma pessoa como SDR e Closer) não pode entrar nas duas
    // somas ao mesmo tempo — vira uma categoria "ambos" à parte, resolvida
    // pela % maior dentro de calcularRemuneracao.
    const producaoPessoalSdr = opsDoEscopo
      .filter((o) => o.sdr_profile_id === profileId && o.closer_profile_id !== profileId)
      .reduce((s, o) => s + Number(o.valor), 0);
    const producaoPessoalCloser = opsDoEscopo
      .filter((o) => o.closer_profile_id === profileId && o.sdr_profile_id !== profileId)
      .reduce((s, o) => s + Number(o.valor), 0);
    const producaoPessoalAmbos = opsDoEscopo
      .filter((o) => o.sdr_profile_id === profileId && o.closer_profile_id === profileId)
      .reduce((s, o) => s + Number(o.valor), 0);
    const producaoGestao = opsDoEscopo
      .filter((o) => o.sdr_profile_id !== profileId && o.closer_profile_id !== profileId)
      .reduce((s, o) => s + Number(o.valor), 0);

    const remuneracao = calcularRemuneracao(tiers, producaoGestao, {
      sdr: producaoPessoalSdr,
      closer: producaoPessoalCloser,
      ambos: producaoPessoalAmbos,
      gestao: producaoGestao,
    });

    const idsParaNome = Array.from(
      new Set(opsDoEscopo.flatMap((o) => [o.sdr_profile_id, o.closer_profile_id]).filter((x): x is string => !!x))
    );
    const { data: pessoasNome } =
      idsParaNome.length > 0
        ? await supabase.from("profiles").select("id, full_name").in("id", idsParaNome)
        : { data: [] };
    const nomePorId = new Map((pessoasNome ?? []).map((p) => [p.id, p.full_name as string]));

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
      sdrNome: o.sdr_profile_id ? (nomePorId.get(o.sdr_profile_id) ?? null) : null,
      closerNome: o.closer_profile_id ? (nomePorId.get(o.closer_profile_id) ?? null) : null,
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

  const { data: opsParaCasar } = await supabase
    .from("weekly_operacoes")
    .select("data, valor, cliente, sdr_profile_id, closer_profile_id")
    .eq("status", "PAGO")
    .gte("data", inicioMes);
  const opPorChave = new Map(
    (opsParaCasar ?? []).map((o) => [chaveOperacao(o.data, Number(o.valor), o.cliente), o])
  );
  const idsContraparte = Array.from(
    new Set(
      vendasMes
        .map((v) => opPorChave.get(chaveOperacao(v.data, Number(v.valor), v.cliente)))
        .flatMap((o) => (o ? [o.sdr_profile_id, o.closer_profile_id] : []))
        .filter((x): x is string => !!x)
    )
  );
  const { data: pessoasContraparte } =
    idsContraparte.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", idsContraparte)
      : { data: [] };
  const nomePorIdContraparte = new Map((pessoasContraparte ?? []).map((p) => [p.id, p.full_name as string]));

  const producaoSdrPura = vendasMes
    .filter((v) => v.papel === "sdr")
    .reduce((s, v) => s + Number(v.valor), 0);
  const producaoCloserPura = vendasMes
    .filter((v) => v.papel === "closer")
    .reduce((s, v) => s + Number(v.valor), 0);
  const producaoAmbos = vendasMes
    .filter((v) => v.papel === "ambos")
    .reduce((s, v) => s + Number(v.valor), 0);
  const producaoPrincipal =
    papelPrincipal === "sdr" ? producaoSdrPura + producaoAmbos : producaoCloserPura + producaoAmbos;

  const remuneracao = calcularRemuneracao(tiers, producaoPrincipal, {
    sdr: producaoSdrPura,
    closer: producaoCloserPura,
    ambos: producaoAmbos,
    gestao: 0,
  });

  const extrato: LinhaExtrato[] = vendasMes.map((v) => {
    const op = opPorChave.get(chaveOperacao(v.data, Number(v.valor), v.cliente));
    const papel = (v.papel as "sdr" | "closer" | "ambos" | null) ?? "closer";
    // Sem match em weekly_operacoes (venda antiga, ou fora do que o sync
    // dessa tabela cobre): pelo menos a própria pessoa aparece no seu papel.
    const sdrNome = op
      ? op.sdr_profile_id
        ? (nomePorIdContraparte.get(op.sdr_profile_id) ?? null)
        : null
      : papel === "sdr" || papel === "ambos"
        ? "Você"
        : null;
    const closerNome = op
      ? op.closer_profile_id
        ? (nomePorIdContraparte.get(op.closer_profile_id) ?? null)
        : null
      : papel === "closer" || papel === "ambos"
        ? "Você"
        : null;
    return {
      id: v.id,
      data: v.data,
      cliente: v.cliente,
      origem: v.origem,
      valor: Number(v.valor),
      papel,
      multiplicador: v.multiplicador,
      sdrNome,
      closerNome,
    };
  });

  const producaoTotal = vendasMes.reduce((s, v) => s + Number(v.valor), 0);

  return { tiers, remuneracao, extrato, papelPrincipal, producaoPrincipal, producaoTotal };
}
