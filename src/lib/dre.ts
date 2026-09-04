import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarRemuneracaoMes } from "@/lib/remuneracao";
import { calcularRemuneracao, type Tier } from "@/lib/comissao";
import { RANK_LABELS } from "@/lib/labels";
import { PAPEL_PRINCIPAL, type Rank } from "@/lib/carreira";

// ATENÇÃO: este módulo é estritamente Diretor-only (RLS na migration 0037
// já barra qualquer outro papel no banco, mas nunca importe isso fora de
// /dre ou /fechamento (mesma área privada, só separada em duas abas) —
// e NUNCA registre nenhuma dessas funções como tool da Minerva em
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

// Comissão de PARCEIRO DE VENDA (a % extra paga a quem trouxe/fechou a
// operação — cadastrada em cada weekly_operacao via /forecast, aparece na
// "Nota do mês" de /fechamento) — custo real, pago dia 15 junto com o
// resto (ver fecharMes em fechamento/actions.ts), mas nunca tinha entrado
// na DRE. Achado pelo Diretor, 2026-09-02: "não estou vendo na dre as
// comissões de parceiros". Não confundir com `producaoParceiro`/
// `receitaParceiro` acima — aquilo é RECEITA (produção que veio de um
// parceiro de canal), isto aqui é CUSTO (comissão paga a um parceiro por
// uma venda específica). Só conta pendente_aprovacao == false (mesmo
// filtro do fechamento: só "ok"/"aprovado" já é custo confirmado).
export async function buscarComissaoParceiroMes(supabase: SupabaseClient, ano: number, mes: number): Promise<number> {
  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimMes = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);

  const { data: opsDoMes } = await supabase
    .from("weekly_operacoes")
    .select("id, valor")
    .eq("status", "PAGO")
    .gte("data", inicioMes)
    .lte("data", fimMes);
  const idsDoMes = (opsDoMes ?? []).map((o) => o.id);
  if (idsDoMes.length === 0) return 0;
  const valorPorOp = new Map((opsDoMes ?? []).map((o) => [o.id, Number(o.valor)]));

  const { data: comissoes } = await supabase
    .from("comissoes_parceiro")
    .select("weekly_operacao_id, percentual")
    .in("status", ["ok", "aprovado"])
    .in("weekly_operacao_id", idsDoMes);

  return (comissoes ?? []).reduce(
    (s, c) => s + (Number(c.percentual) / 100) * (valorPorOp.get(c.weekly_operacao_id) ?? 0),
    0
  );
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

    // Gestão: o GRADE avança pela produção TOTAL do time/firma (própria
    // inclusa) — mesma regra de buscarRemuneracaoMes (src/lib/remuneracao.ts,
    // 2026-08-27). A % de Gestão continua incidindo só sobre `producaoGestao`
    // (abaixo, em `calcularRemuneracao`) pra não pagar a mesma venda 2x.
    const producaoPrincipal =
      papelPrincipal === "gestao"
        ? producaoGestao + producaoPessoalSdr + producaoPessoalCloser + producaoPessoalAmbos
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
  comissaoParceiro: number; // % extra pago a parceiro de venda por operação (não confundir com receitaParceiro acima)
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
  receitaPropria: number,
  producaoParceiro: number,
  folha: Folha,
  despesas: DespesaExtra[],
  receitasExtras: ReceitaExtra[],
  comissaoParceiro: number
): ResumoDre {
  const despesasFixasExtras = despesas.filter((d) => !d.profileId).reduce((s, d) => s + d.valor, 0);
  const extrasVariaveis = despesas.filter((d) => d.profileId).reduce((s, d) => s + d.valor, 0);
  const outrasReceitas = receitasExtras.reduce((s, r) => s + r.valor, 0);

  const receitaParceiro = producaoParceiro * config.pctReceitaParceiro;
  const receitaBruta = receitaPropria + receitaParceiro + outrasReceitas;
  const imposto = receitaBruta * config.pctImposto;
  const receitaLiquida = receitaBruta - imposto;

  const { totais } = folha;
  const custosVariaveisTotal =
    totais.variavelSdr + totais.variavelCloser + totais.variavelGestao + totais.bonus + extrasVariaveis + comissaoParceiro;
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
    comissaoParceiro,
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

// Crédito total do mês + Receita Própria já ponderada pela % de cada
// operação — a imensa maioria usa o % padrão da DRE (pct_receita_credito),
// mas uma operação com pct_receita_override preenchido usa a % combinada
// pra ela em vez do padrão (pedido do Diretor, 2026-09-02: "algumas vendas
// do mês passado vão ter uma comissão diferente dos 6%, mas não são
// todas" — cadastra em /fechamento, na tabela "Nota do mês").
async function buscarCreditoEReceitaPropriaMes(
  supabase: SupabaseClient,
  inicioMes: string,
  fimMesExclusivo: string,
  pctPadrao: number
): Promise<{ creditoTotalMes: number; receitaPropria: number }> {
  const { data } = await supabase
    .from("weekly_operacoes")
    .select("valor, pct_receita_override")
    .eq("status", "PAGO")
    .gte("data", inicioMes)
    .lt("data", fimMesExclusivo);

  let creditoTotalMes = 0;
  let receitaPropria = 0;
  for (const o of data ?? []) {
    const valor = Number(o.valor);
    creditoTotalMes += valor;
    const pct = o.pct_receita_override !== null && o.pct_receita_override !== undefined ? Number(o.pct_receita_override) : pctPadrao;
    receitaPropria += valor * pct;
  }
  return { creditoTotalMes, receitaPropria };
}

function fimMesExclusivoDe(ano: number, mes: number): string {
  return mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
}

export async function buscarResumoDre(supabase: SupabaseClient, ano: number, mes: number): Promise<ResumoDre> {
  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const config = await buscarConfigDre(supabase);

  const [{ creditoTotalMes, receitaPropria }, producaoParceiro, folha, despesas, receitasExtras, comissaoParceiro] = await Promise.all([
    buscarCreditoEReceitaPropriaMes(supabase, inicioMes, fimMesExclusivoDe(ano, mes), config.pctReceitaCredito),
    buscarProducaoParceiro(supabase, ano, mes),
    buscarFolha(supabase, ano, mes),
    buscarDespesasExtras(supabase, ano, mes),
    buscarReceitasExtras(supabase, ano, mes),
    buscarComissaoParceiroMes(supabase, ano, mes),
  ]);

  return montarResumoDre(config, creditoTotalMes, receitaPropria, producaoParceiro, folha, despesas, receitasExtras, comissaoParceiro);
}

// Mesma coisa que buscarResumoDre, mas com o crédito PAGO + AGUARDANDO
// PAGAMENTO como se já tivesse virado receita, e a Folha recalculada na
// mesma base (ver buscarFolhaForecast) — é uma projeção pra "se tudo que
// tá pra pagar realmente pagar", não o número oficial do mês.
// --- Fechamento Mensal + Comissão de Parceiro -------------------------
// Mesma restrição estrita de "nunca fora de /dre ou /fechamento" das funções acima —
// fixo/bônus/variável por pessoa e Pix de parceiro são dado de folha.

export type LinhaNota = {
  weeklyOperacaoId: string;
  data: string;
  cliente: string | null;
  clienteId: string | null;
  valor: number;
  // null = usa o % padrão da DRE (dre_configuracoes.pct_receita_credito);
  // preenchido = essa venda específica tem uma % de receita combinada
  // diferente do padrão. Fração (0.08 = 8%), mesma convenção do padrão.
  pctReceitaOverride: number | null;
  parceiro: { nomeParceiro: string; percentual: number; extra: number; status: string } | null;
};

// Mesma base de "crédito do mês" que buscarProducaoPagaFirma/buscarFolha
// usam pro resto da DRE (status PAGO, data de assinatura dentro do mês) —
// pra o total da nota bater com receitaPropria/comissão do mesmo fechamento,
// em vez de inventar um terceiro critério.
export async function buscarNotaMes(supabase: SupabaseClient, ano: number, mes: number): Promise<LinhaNota[]> {
  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimMes = new Date(ano, mes, 0).toISOString().slice(0, 10);

  const { data: ops } = await supabase
    .from("weekly_operacoes")
    .select("id, data, cliente, cliente_id, valor, pct_receita_override")
    .eq("status", "PAGO")
    .gte("data", inicioMes)
    .lte("data", fimMes)
    .order("data");
  if (!ops || ops.length === 0) return [];

  const { data: comissoes } = await supabase
    .from("comissoes_parceiro")
    .select("weekly_operacao_id, nome_parceiro, percentual, status")
    .in(
      "weekly_operacao_id",
      ops.map((o) => o.id)
    );
  const comissaoPorOp = new Map((comissoes ?? []).map((c) => [c.weekly_operacao_id, c]));

  return ops.map((o) => {
    const c = comissaoPorOp.get(o.id);
    return {
      weeklyOperacaoId: o.id,
      data: o.data,
      cliente: o.cliente,
      clienteId: o.cliente_id,
      valor: Number(o.valor),
      pctReceitaOverride: o.pct_receita_override !== null ? Number(o.pct_receita_override) : null,
      parceiro: c
        ? {
            nomeParceiro: c.nome_parceiro,
            percentual: Number(c.percentual),
            extra: (Number(c.percentual) / 100) * Number(o.valor),
            status: c.status,
          }
        : null,
    };
  });
}

export type PendenciaComissaoParceiro = {
  id: string;
  weeklyOperacaoId: string;
  nomeParceiro: string;
  percentual: number;
  chavePix: string;
  cliente: string | null;
  valorOperacao: number;
  valorComissao: number;
};

export async function buscarPendenciasAprovacao(
  supabase: SupabaseClient,
  ano: number,
  mes: number
): Promise<PendenciaComissaoParceiro[]> {
  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimMes = new Date(ano, mes, 0).toISOString().slice(0, 10);

  const { data: ops } = await supabase.from("weekly_operacoes").select("id, cliente, valor").gte("data", inicioMes).lte("data", fimMes);
  if (!ops || ops.length === 0) return [];
  const opPorId = new Map(ops.map((o) => [o.id, o]));

  const { data: pendentes } = await supabase
    .from("comissoes_parceiro")
    .select("id, weekly_operacao_id, nome_parceiro, percentual, chave_pix")
    .eq("status", "pendente_aprovacao")
    .in(
      "weekly_operacao_id",
      ops.map((o) => o.id)
    );

  return (pendentes ?? []).map((p) => {
    const op = opPorId.get(p.weekly_operacao_id);
    const valorOperacao = Number(op?.valor ?? 0);
    return {
      id: p.id,
      weeklyOperacaoId: p.weekly_operacao_id,
      nomeParceiro: p.nome_parceiro,
      percentual: Number(p.percentual),
      chavePix: p.chave_pix,
      cliente: op?.cliente ?? null,
      valorOperacao,
      valorComissao: (Number(p.percentual) / 100) * valorOperacao,
    };
  });
}

export type FechamentoStatus = {
  existe: boolean;
  status: "aberto" | "fechado";
  fechadoEm: string | null;
  pessoas: { profileId: string; nome: string; fixo: number; bonus: number; variavel: number; campanhas: number }[];
  parceiros: { nomeParceiro: string; chavePix: string; valorTotal: number; valorRepassado: number; valorRetido: number }[];
};

export async function buscarFechamento(supabase: SupabaseClient, ano: number, mes: number): Promise<FechamentoStatus> {
  const { data: fechamento } = await supabase
    .from("fechamentos_mensais")
    .select("id, status, fechado_em")
    .eq("ano", ano)
    .eq("mes", mes)
    .maybeSingle();
  if (!fechamento) return { existe: false, status: "aberto", fechadoEm: null, pessoas: [], parceiros: [] };

  const fechado = fechamento.status === "fechado";
  const [{ data: pessoas }, { data: parceiros }] = await Promise.all([
    fechado
      ? supabase.from("fechamento_pessoas").select("profile_id, nome, fixo, bonus, variavel, campanhas").eq("fechamento_id", fechamento.id).order("nome")
      : Promise.resolve({ data: [] }),
    fechado
      ? supabase
          .from("fechamento_parceiros")
          .select("nome_parceiro, chave_pix, valor_total, valor_repassado, valor_retido")
          .eq("fechamento_id", fechamento.id)
      : Promise.resolve({ data: [] }),
  ]);

  return {
    existe: true,
    status: fechamento.status as "aberto" | "fechado",
    fechadoEm: fechamento.fechado_em,
    pessoas: (pessoas ?? []).map((p) => ({
      profileId: p.profile_id,
      nome: p.nome,
      fixo: Number(p.fixo),
      bonus: Number(p.bonus),
      variavel: Number(p.variavel),
      campanhas: Number(p.campanhas ?? 0),
    })),
    parceiros: (parceiros ?? []).map((p) => ({
      nomeParceiro: p.nome_parceiro,
      chavePix: p.chave_pix,
      valorTotal: Number(p.valor_total),
      valorRepassado: Number(p.valor_repassado),
      valorRetido: Number(p.valor_retido),
    })),
  };
}

export async function buscarResumoDreForecast(supabase: SupabaseClient, ano: number, mes: number): Promise<ResumoDre> {
  const inicioMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const fimMes = new Date(ano, mes, 0).toISOString().slice(0, 10);
  const config = await buscarConfigDre(supabase);

  const [{ data: opsRaw }, producaoParceiro, folha, despesas, receitasExtras] = await Promise.all([
    supabase
      .from("weekly_operacoes")
      .select("id, valor, status, status_manual, pct_receita_override")
      .gte("data", inicioMes)
      .lte("data", fimMes),
    buscarProducaoParceiro(supabase, ano, mes),
    buscarFolhaForecast(supabase, ano, mes),
    buscarDespesasExtras(supabase, ano, mes),
    buscarReceitasExtras(supabase, ano, mes),
  ]);
  const opsForecast = (opsRaw ?? []).filter((o) => o.status === "PAGO" || o.status_manual === "aguardando_pagamento");
  const creditoTotalMes = opsForecast.reduce((s, o) => s + Number(o.valor), 0);
  const receitaPropria = opsForecast.reduce((s, o) => {
    const valor = Number(o.valor);
    const pct = o.pct_receita_override !== null && o.pct_receita_override !== undefined ? Number(o.pct_receita_override) : config.pctReceitaCredito;
    return s + valor * pct;
  }, 0);

  let comissaoParceiro = 0;
  if (opsForecast.length > 0) {
    const valorPorOp = new Map(opsForecast.map((o) => [o.id, Number(o.valor)]));
    const { data: comissoes } = await supabase
      .from("comissoes_parceiro")
      .select("weekly_operacao_id, percentual")
      .in("status", ["ok", "aprovado"])
      .in(
        "weekly_operacao_id",
        opsForecast.map((o) => o.id)
      );
    comissaoParceiro = (comissoes ?? []).reduce(
      (s, c) => s + (Number(c.percentual) / 100) * (valorPorOp.get(c.weekly_operacao_id) ?? 0),
      0
    );
  }

  return montarResumoDre(config, creditoTotalMes, receitaPropria, producaoParceiro, folha, despesas, receitasExtras, comissaoParceiro);
}
