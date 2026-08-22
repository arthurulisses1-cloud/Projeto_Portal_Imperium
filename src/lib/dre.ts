import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarRemuneracaoMes } from "@/lib/remuneracao";
import { buscarProducaoPagaFirma } from "@/lib/metas";
import { calcularRemuneracao, type Tier } from "@/lib/comissao";
import { RANK_LABELS } from "@/lib/labels";
import { PAPEL_PRINCIPAL, type Rank } from "@/lib/carreira";

// ATENÇÃO: este módulo é estritamente Diretor-only (RLS na migration 0037
// já barra qualquer outro papel no banco, mas nunca importe isso fora de
// /dre — e NUNCA registre nenhuma dessas funções como tool da Minerva em
// src/lib/minerva/tools.ts, por pedido explícito do Diretor).

export type ConfigDre = {
  pctReceitaCredito: number;
  pctReceitaParceiro: number;
  pctImposto: number;
  custoAluguel: number;
  custoTrafego: number;
};

export async function buscarConfigDre(supabase: SupabaseClient): Promise<ConfigDre> {
  const { data } = await supabase.from("dre_configuracoes").select("*").eq("id", true).single();
  return {
    pctReceitaCredito: data?.pct_receita_credito ?? 0.06,
    pctReceitaParceiro: data?.pct_receita_parceiro ?? 0.01,
    pctImposto: data?.pct_imposto ?? 0.06,
    custoAluguel: data?.custo_aluguel ?? 13000,
    custoTrafego: data?.custo_trafego ?? 10000,
  };
}

export type DespesaExtra = {
  id: string;
  descricao: string;
  valor: number;
  profileId: string | null;
  profileNome: string | null;
};

export async function buscarDespesasExtras(supabase: SupabaseClient, ano: number, mes: number): Promise<DespesaExtra[]> {
  const { data } = await supabase
    .from("dre_despesas_extras")
    .select("id, descricao, valor, profile_id, profile:profiles(full_name)")
    .eq("ano", ano)
    .eq("mes", mes)
    .order("created_at", { ascending: false });
  return (data ?? []).map((d) => ({
    id: d.id,
    descricao: d.descricao,
    valor: Number(d.valor),
    profileId: d.profile_id,
    profileNome: (d.profile as unknown as { full_name: string } | null)?.full_name ?? null,
  }));
}

export async function buscarProducaoParceiro(supabase: SupabaseClient, ano: number, mes: number): Promise<number> {
  const { data } = await supabase.from("dre_producao_parceiro").select("valor").eq("ano", ano).eq("mes", mes).maybeSingle();
  return Number(data?.valor ?? 0);
}

export type ReceitaExtra = { id: string; descricao: string; valor: number };

export async function buscarReceitasExtras(supabase: SupabaseClient, ano: number, mes: number): Promise<ReceitaExtra[]> {
  const { data } = await supabase
    .from("dre_receitas_extras")
    .select("id, descricao, valor")
    .eq("ano", ano)
    .eq("mes", mes)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => ({ id: r.id, descricao: r.descricao, valor: Number(r.valor) }));
}

export type LinhaFolha = {
  profileId: string;
  nome: string;
  vendidoSdr: number;
  vendidoCloser: number;
  cargo: string;
  time: string | null;
  tribo: string | null;
  fixo: number; // salário base do rank (tier mínimo)
  bonus: number; // diferença do tier atual pro tier mínimo
  fixoMaisBonus: number;
  variavelSdr: number;
  variavelCloser: number;
  variavelGestao: number;
  campanhas: number;
  folhaTotal: number;
};

export type Folha = {
  linhas: LinhaFolha[];
  totais: {
    fixoMaisBonus: number;
    fixo: number;
    bonus: number;
    variavelSdr: number;
    variavelCloser: number;
    variavelGestao: number;
    campanhas: number;
    folhaTotal: number;
  };
};

// Reaproveita buscarRemuneracaoMes (mesma lógica de tier/comissão usada em
// /comissao e na SidebarRight) por pessoa — evita qualquer divergência de
// número entre "o que a pessoa vê ganhar" e "o que a Folha do Diretor
// mostra". Custo de N chamadas é aceitável aqui: página de uso ocasional
// (revisão mensal), não uma tela que renderiza toda hora.
export async function buscarFolha(supabase: SupabaseClient, ano: number, mes: number): Promise<Folha> {
  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;

  const { data: pessoas } = await supabase
    .from("profiles")
    .select(
      "id, full_name, role, rank, tribo:tribos!profiles_tribo_id_fkey(nome, exercito:exercitos(nome)), exercito_liderado:exercitos!exercitos_legado_id_fkey(nome)"
    )
    // Investidor é gestão pura (sem produção/comissão/salário-base real) —
    // nunca entra na Folha, pedido explícito do Diretor.
    .neq("role", "investidor")
    .order("full_name");

  const { data: vendasMes } = await supabase.from("vendas").select("profile_id, valor, papel").gte("data", inicioMes);
  const despesas = await buscarDespesasExtras(supabase, ano, mes);
  const campanhaPorPessoa = new Map<string, number>();
  for (const d of despesas) {
    if (!d.profileId) continue;
    campanhaPorPessoa.set(d.profileId, (campanhaPorPessoa.get(d.profileId) ?? 0) + d.valor);
  }

  const linhas = await Promise.all(
    (pessoas ?? []).map(async (p) => {
      const vendidoSdr = (vendasMes ?? [])
        .filter((v) => v.profile_id === p.id && (v.papel === "sdr" || v.papel === "ambos"))
        .reduce((s, v) => s + Number(v.valor), 0);
      const vendidoCloser = (vendasMes ?? [])
        .filter((v) => v.profile_id === p.id && (v.papel === "closer" || v.papel === "ambos"))
        .reduce((s, v) => s + Number(v.valor), 0);

      const { tiers, remuneracao } = await buscarRemuneracaoMes(supabase, p.id, p.role, p.rank as Rank | "diretor", inicioMes);

      const tribo = p.tribo as unknown as { nome: string; exercito: { nome: string } | null } | null;
      const exercitoLiderado = p.exercito_liderado as unknown as { nome: string }[] | null;
      const time = tribo?.exercito?.nome ?? exercitoLiderado?.[0]?.nome ?? null;

      const fixoBase = tiers.length > 0 ? tiers[0].fixo : 0;
      const fixoAtual = remuneracao?.fixo ?? 0;
      const bonus = Math.max(0, fixoAtual - fixoBase);
      const variavelSdr = remuneracao?.sdr.variavel ?? 0;
      const variavelCloser = remuneracao?.closer.variavel ?? 0;
      const variavelGestao = remuneracao?.gestao.variavel ?? 0;
      const campanhas = campanhaPorPessoa.get(p.id) ?? 0;

      const linha: LinhaFolha = {
        profileId: p.id,
        nome: p.full_name,
        vendidoSdr,
        vendidoCloser,
        cargo: RANK_LABELS[p.rank as Rank | "diretor"] ?? p.rank,
        time,
        tribo: tribo?.nome ?? null,
        fixo: fixoBase,
        bonus,
        fixoMaisBonus: fixoAtual,
        variavelSdr,
        variavelCloser,
        variavelGestao,
        campanhas,
        folhaTotal: fixoAtual + variavelSdr + variavelCloser + variavelGestao + campanhas,
      };
      return linha;
    })
  );

  // Ninguém sem produção, fixo ou custo nenhum no mês não polui a tabela —
  // mas mantém quem tem qualquer fixo cadastrado (time inteiro ativo).
  const linhasVisiveis = linhas.filter((l) => l.fixoMaisBonus > 0 || l.folhaTotal > 0);

  const totais = linhasVisiveis.reduce(
    (acc, l) => ({
      fixoMaisBonus: acc.fixoMaisBonus + l.fixoMaisBonus,
      fixo: acc.fixo + l.fixo,
      bonus: acc.bonus + l.bonus,
      variavelSdr: acc.variavelSdr + l.variavelSdr,
      variavelCloser: acc.variavelCloser + l.variavelCloser,
      variavelGestao: acc.variavelGestao + l.variavelGestao,
      campanhas: acc.campanhas + l.campanhas,
      folhaTotal: acc.folhaTotal + l.folhaTotal,
    }),
    { fixoMaisBonus: 0, fixo: 0, bonus: 0, variavelSdr: 0, variavelCloser: 0, variavelGestao: 0, campanhas: 0, folhaTotal: 0 }
  );

  return { linhas: linhasVisiveis, totais };
}

// Versão "Forecast de pagos": trata operação com status_manual =
// 'aguardando_pagamento' como se já fosse PAGO — pedido explícito porque
// isso muda mais do que a Receita: a produção extra pode empurrar gente
// pra outro tier de comissão, então a comissão de cada pessoa também
// precisa ser recalculada com essa base maior, não só multiplicada.
//
// Não reaproveita buscarRemuneracaoMes/`vendas` (que só tem PAGO) — calcula
// direto de weekly_operacoes com o filtro de status expandido, usando o
// mesmo calcularRemuneracao() puro que a versão real usa. É uma projeção,
// não o número oficial, então uma fonte de dado ligeiramente diferente da
// tela "Pago (real)" é esperado e aceitável aqui.
export async function buscarFolhaForecast(supabase: SupabaseClient, ano: number, mes: number): Promise<Folha> {
  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimMes = new Date(ano, mes, 0).toISOString().slice(0, 10);

  const [{ data: pessoas }, { data: opsRaw }, { data: tiersRaw }, despesas] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, role, rank, tribo:tribos!profiles_tribo_id_fkey(nome, exercito_id, exercito:exercitos(nome)), exercito_liderado:exercitos!exercitos_legado_id_fkey(id, nome)"
      )
      .neq("role", "investidor")
      .order("full_name"),
    supabase
      .from("weekly_operacoes")
      .select("valor, status, status_manual, sdr_profile_id, closer_profile_id")
      .gte("data", inicioMes)
      .lte("data", fimMes),
    supabase.from("commission_tiers").select("rank, producao_min, fixo, pct_sdr, pct_closer, pct_gestao, ordem").order("ordem"),
    buscarDespesasExtras(supabase, ano, mes),
  ]);

  const opsBase = (opsRaw ?? []).filter((o) => o.status === "PAGO" || o.status_manual === "aguardando_pagamento");

  const tiersPorRank = new Map<string, Tier[]>();
  for (const t of tiersRaw ?? []) {
    const arr = tiersPorRank.get(t.rank) ?? [];
    arr.push(t);
    tiersPorRank.set(t.rank, arr);
  }
  Array.from(tiersPorRank.values()).forEach((arr) => arr.sort((a, b) => a.producao_min - b.producao_min));

  const exercitoIdPorProfileId = new Map<string, string | null>();
  for (const p of pessoas ?? []) {
    const tribo = p.tribo as unknown as { exercito_id: string } | null;
    const exercitoLiderado = p.exercito_liderado as unknown as { id: string }[] | null;
    exercitoIdPorProfileId.set(p.id, tribo?.exercito_id ?? exercitoLiderado?.[0]?.id ?? null);
  }

  const campanhaPorPessoa = new Map<string, number>();
  for (const d of despesas) {
    if (!d.profileId) continue;
    campanhaPorPessoa.set(d.profileId, (campanhaPorPessoa.get(d.profileId) ?? 0) + d.valor);
  }

  const linhas: LinhaFolha[] = (pessoas ?? []).map((p) => {
    const rank = p.rank as Rank | "diretor";
    const tiers = tiersPorRank.get(p.rank) ?? [];
    const papelPrincipal = PAPEL_PRINCIPAL[rank] ?? "sdr";

    let opsDoEscopo = opsBase;
    let producaoGestao = 0;
    if (p.role === "lider" || p.role === "diretor") {
      if (p.role === "lider") {
        const meuExercitoId = exercitoIdPorProfileId.get(p.id);
        opsDoEscopo = meuExercitoId
          ? opsBase.filter((o) => {
              const timeDaOperacao =
                (o.closer_profile_id && exercitoIdPorProfileId.get(o.closer_profile_id)) ||
                (o.sdr_profile_id && exercitoIdPorProfileId.get(o.sdr_profile_id));
              return timeDaOperacao === meuExercitoId;
            })
          : [];
      }
      producaoGestao = opsDoEscopo
        .filter((o) => o.sdr_profile_id !== p.id && o.closer_profile_id !== p.id)
        .reduce((s, o) => s + Number(o.valor), 0);
    } else {
      opsDoEscopo = opsBase;
    }

    const producaoPessoalSdr = opsDoEscopo
      .filter((o) => o.sdr_profile_id === p.id && o.closer_profile_id !== p.id)
      .reduce((s, o) => s + Number(o.valor), 0);
    const producaoPessoalCloser = opsDoEscopo
      .filter((o) => o.closer_profile_id === p.id && o.sdr_profile_id !== p.id)
      .reduce((s, o) => s + Number(o.valor), 0);
    const producaoPessoalAmbos = opsDoEscopo
      .filter((o) => o.sdr_profile_id === p.id && o.closer_profile_id === p.id)
      .reduce((s, o) => s + Number(o.valor), 0);

    const producaoPrincipal =
      papelPrincipal === "gestao"
        ? producaoGestao
        : papelPrincipal === "sdr"
          ? producaoPessoalSdr + producaoPessoalAmbos
          : producaoPessoalCloser + producaoPessoalAmbos;

    const remuneracao =
      tiers.length > 0
        ? calcularRemuneracao(tiers, producaoPrincipal, {
            sdr: producaoPessoalSdr,
            closer: producaoPessoalCloser,
            ambos: producaoPessoalAmbos,
            gestao: producaoGestao,
          })
        : null;

    const tribo = p.tribo as unknown as { nome: string; exercito: { nome: string } | null } | null;
    const exercitoLiderado = p.exercito_liderado as unknown as { nome: string }[] | null;
    const time = tribo?.exercito?.nome ?? exercitoLiderado?.[0]?.nome ?? null;

    const fixoBase = tiers.length > 0 ? tiers[0].fixo : 0;
    const fixoAtual = remuneracao?.fixo ?? 0;
    const bonus = Math.max(0, fixoAtual - fixoBase);
    const variavelSdr = remuneracao?.sdr.variavel ?? 0;
    const variavelCloser = remuneracao?.closer.variavel ?? 0;
    const variavelGestao = remuneracao?.gestao.variavel ?? 0;
    const campanhas = campanhaPorPessoa.get(p.id) ?? 0;

    const linha: LinhaFolha = {
      profileId: p.id,
      nome: p.full_name,
      vendidoSdr: producaoPessoalSdr + producaoPessoalAmbos,
      vendidoCloser: producaoPessoalCloser + producaoPessoalAmbos,
      cargo: RANK_LABELS[p.rank] ?? p.rank,
      time,
      tribo: tribo?.nome ?? null,
      fixo: fixoBase,
      bonus,
      fixoMaisBonus: fixoAtual,
      variavelSdr,
      variavelCloser,
      variavelGestao,
      campanhas,
      folhaTotal: fixoAtual + variavelSdr + variavelCloser + variavelGestao + campanhas,
    };
    return linha;
  });

  const linhasVisiveis = linhas.filter((l) => l.fixoMaisBonus > 0 || l.folhaTotal > 0);

  const totais = linhasVisiveis.reduce(
    (acc, l) => ({
      fixoMaisBonus: acc.fixoMaisBonus + l.fixoMaisBonus,
      fixo: acc.fixo + l.fixo,
      bonus: acc.bonus + l.bonus,
      variavelSdr: acc.variavelSdr + l.variavelSdr,
      variavelCloser: acc.variavelCloser + l.variavelCloser,
      variavelGestao: acc.variavelGestao + l.variavelGestao,
      campanhas: acc.campanhas + l.campanhas,
      folhaTotal: acc.folhaTotal + l.folhaTotal,
    }),
    { fixoMaisBonus: 0, fixo: 0, bonus: 0, variavelSdr: 0, variavelCloser: 0, variavelGestao: 0, campanhas: 0, folhaTotal: 0 }
  );

  return { linhas: linhasVisiveis, totais };
}

export type ResumoDre = {
  creditoTotalMes: number;
  producaoParceiro: number;
  receitaPropria: number;
  receitaParceiro: number;
  outrasReceitas: number;
  receitaBruta: number;
  imposto: number;
  receitaLiquida: number;
  // Custos e Despesas Variáveis: tudo que só existe PORQUE alguém vendeu —
  // comissão (SDR/Closer/Gestão), o bônus de tier (sobe com a produção que
  // empurra o tier, mesmo sendo um degrau e não um % contínuo) e despesa
  // extra amarrada a uma pessoa (campanha/marco pago por bater meta).
  // Fonte: comissão de vendas é custo variável e entra na margem de
  // contribuição (não em "despesa operacional fixa") — ver AccountingTools/
  // Qobra/CubeSoftware nas fontes desta conversa.
  comissaoSdr: number;
  comissaoCloser: number;
  comissaoGestao: number;
  bonusTier: number;
  extrasVariaveis: number;
  custosVariaveisTotal: number;
  margemContribuicao: number;
  margemContribuicaoPct: number; // sobre a Receita Líquida
  // Despesas Fixas: existem independente de quanto foi vendido.
  folhaFixa: number; // soma só do salário-base (sem bônus/comissão)
  custoAluguel: number;
  custoTrafego: number;
  despesasFixasExtras: number; // dre_despesas_extras sem pessoa vinculada
  despesasFixasTotal: number;
  lucro: number;
  lucroPct: number; // margem líquida, sobre a Receita Bruta
};

// Estrutura de DRE gerencial (custeio variável), não a DRE fiscal
// tradicional — pra um negócio de comissão de vendas isso é o que dá
// visibilidade de verdade: Receita Bruta → (-) Impostos → Receita Líquida
// → (-) Custos/Despesas VARIÁVEIS (comissão, bônus de tier, extras por
// pessoa) → MARGEM DE CONTRIBUIÇÃO → (-) Despesas FIXAS (salário-base,
// aluguel, tráfego, extras gerais) → Lucro. Pedido explícito do Diretor
// (2026-08-22) depois de perceber que a versão anterior misturava fixo e
// variável dentro de "Folha" numa despesa operacional só, escondendo a
// margem de contribuição.
function montarResumoDre(
  config: ConfigDre,
  creditoTotalMes: number,
  producaoParceiro: number,
  folha: Folha,
  despesas: DespesaExtra[],
  receitasExtras: ReceitaExtra[]
): ResumoDre {
  const despesasFixasExtras = despesas.filter((d) => !d.profileId).reduce((s, d) => s + d.valor, 0);
  const extrasVariaveis = despesas.filter((d) => d.profileId).reduce((s, d) => s + d.valor, 0);
  const outrasReceitas = receitasExtras.reduce((s, r) => s + r.valor, 0);

  const receitaPropria = creditoTotalMes * config.pctReceitaCredito;
  const receitaParceiro = producaoParceiro * config.pctReceitaParceiro;
  const receitaBruta = receitaPropria + receitaParceiro + outrasReceitas;
  const imposto = receitaBruta * config.pctImposto;
  const receitaLiquida = receitaBruta - imposto;

  const { totais } = folha;
  const custosVariaveisTotal =
    totais.variavelSdr + totais.variavelCloser + totais.variavelGestao + totais.bonus + extrasVariaveis;
  const margemContribuicao = receitaLiquida - custosVariaveisTotal;

  const despesasFixasTotal = totais.fixo + config.custoAluguel + config.custoTrafego + despesasFixasExtras;
  const lucro = margemContribuicao - despesasFixasTotal;

  return {
    creditoTotalMes,
    producaoParceiro,
    receitaPropria,
    receitaParceiro,
    outrasReceitas,
    receitaBruta,
    imposto,
    receitaLiquida,
    comissaoSdr: totais.variavelSdr,
    comissaoCloser: totais.variavelCloser,
    comissaoGestao: totais.variavelGestao,
    bonusTier: totais.bonus,
    extrasVariaveis,
    custosVariaveisTotal,
    margemContribuicao,
    margemContribuicaoPct: receitaLiquida > 0 ? (margemContribuicao / receitaLiquida) * 100 : 0,
    folhaFixa: totais.fixo,
    custoAluguel: config.custoAluguel,
    custoTrafego: config.custoTrafego,
    despesasFixasExtras,
    despesasFixasTotal,
    lucro,
    lucroPct: receitaBruta > 0 ? (lucro / receitaBruta) * 100 : 0,
  };
}

export async function buscarResumoDre(supabase: SupabaseClient, ano: number, mes: number): Promise<ResumoDre> {
  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const config = await buscarConfigDre(supabase);

  const [creditoTotalMes, producaoParceiro, folha, despesas, receitasExtras] = await Promise.all([
    buscarProducaoPagaFirma(supabase, inicioMes),
    buscarProducaoParceiro(supabase, ano, mes),
    buscarFolha(supabase, ano, mes),
    buscarDespesasExtras(supabase, ano, mes),
    buscarReceitasExtras(supabase, ano, mes),
  ]);

  return montarResumoDre(config, creditoTotalMes, producaoParceiro, folha, despesas, receitasExtras);
}

// Mesma coisa que buscarResumoDre, mas com o crédito PAGO + AGUARDANDO
// PAGAMENTO como se já tivesse virado receita, e a Folha recalculada na
// mesma base (ver buscarFolhaForecast) — é uma projeção pra "se tudo que
// tá pra pagar realmente pagar", não o número oficial do mês.
export async function buscarResumoDreForecast(supabase: SupabaseClient, ano: number, mes: number): Promise<ResumoDre> {
  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimMes = new Date(ano, mes, 0).toISOString().slice(0, 10);
  const config = await buscarConfigDre(supabase);

  const [{ data: opsRaw }, producaoParceiro, folha, despesas, receitasExtras] = await Promise.all([
    supabase.from("weekly_operacoes").select("valor, status, status_manual").gte("data", inicioMes).lte("data", fimMes),
    buscarProducaoParceiro(supabase, ano, mes),
    buscarFolhaForecast(supabase, ano, mes),
    buscarDespesasExtras(supabase, ano, mes),
    buscarReceitasExtras(supabase, ano, mes),
  ]);
  const creditoTotalMes = (opsRaw ?? [])
    .filter((o) => o.status === "PAGO" || o.status_manual === "aguardando_pagamento")
    .reduce((s, o) => s + Number(o.valor), 0);

  return montarResumoDre(config, creditoTotalMes, producaoParceiro, folha, despesas, receitasExtras);
}
