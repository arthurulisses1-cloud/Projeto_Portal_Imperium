import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarRemuneracaoMes } from "@/lib/remuneracao";
import { buscarProducaoPagaFirma } from "@/lib/metas";
import { RANK_LABELS } from "@/lib/labels";
import type { Rank } from "@/lib/carreira";

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
