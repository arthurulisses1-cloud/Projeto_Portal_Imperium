import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarNome } from "@/lib/sync/parse";
import { FUNNEL_STAGES, FUNNEL_LABELS, periodoParaDatas, type FunilEtapa } from "@/lib/funil";
import { buscarMetaIndividual } from "@/lib/metas";
import { calcularGargalo } from "@/lib/gargalo";
import { RANK_LABELS, ROLE_LABELS } from "@/lib/labels";
import type { Escopo } from "./scope";
import { inicioMesBR } from "@/lib/data-br";

// REGRA DURA (pedido explícito do Diretor, 2026-08-22): NUNCA importe nada
// de src/lib/dre.ts aqui, nem crie uma tool que leia dre_configuracoes /
// dre_producao_parceiro / dre_despesas_extras / folha de pagamento — em
// nenhuma hipótese, nem pro próprio Diretor. A DRE só existe em /dre.

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

async function pessoasNoEscopo(supabase: SupabaseClient, escopo: Escopo) {
  let query = supabase.from("profiles").select("id, full_name, role, rank").in("role", ["sdr", "closer", "lider"]);
  if (escopo.idsPermitidos !== null) query = query.in("id", escopo.idsPermitidos);
  const { data } = await query;
  return data ?? [];
}

// Resolve um nome digitado em texto livre pra um profile_id, dentro do
// escopo — substring normalizada (acento/maiúscula não importam), como o
// resto do app já faz pra casar nome da planilha.
async function resolverPessoa(
  supabase: SupabaseClient,
  escopo: Escopo,
  nomeBuscado: string | undefined
): Promise<{ id: string; nome: string } | { erro: string }> {
  if (!nomeBuscado || !nomeBuscado.trim()) return { id: escopo.viewerId, nome: "" };

  const pessoas = await pessoasNoEscopo(supabase, escopo);
  const alvo = normalizarNome(nomeBuscado);
  const bateExato = pessoas.find((p) => normalizarNome(p.full_name) === alvo);
  if (bateExato) return { id: bateExato.id, nome: bateExato.full_name };

  const candidatos = pessoas.filter((p) => normalizarNome(p.full_name).includes(alvo));
  if (candidatos.length === 1) return { id: candidatos[0].id, nome: candidatos[0].full_name };
  if (candidatos.length > 1) {
    return { erro: `Mais de uma pessoa bate com "${nomeBuscado}": ${candidatos.map((c) => c.full_name).join(", ")}. Peça pra especificar.` };
  }
  return { erro: `Não encontrei ninguém chamado "${nomeBuscado}" no seu escopo de visão.` };
}

export const MINERVA_TOOLS = [
  {
    name: "listar_pessoas",
    description: "Lista as pessoas (SDR/Closer/Líder) dentro do escopo de visão de quem pergunta, com papel e cargo. Use pra descobrir nomes exatos antes de chamar outra ferramenta com um nome ambíguo.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "pessoas_zeradas",
    description: "Lista quem não teve nenhum crédito pago (venda) no período — útil pra 'quem está zerado'.",
    input_schema: {
      type: "object" as const,
      properties: {
        periodo: { type: "string", enum: ["hoje", "semana", "mes"], description: "Padrão: mes" },
      },
      required: [],
    },
  },
  {
    name: "diagnostico_funil",
    description: "Analisa o funil de vendas (tentativas → alôs → conexões → entrevistas → assinaturas → pagos) de uma pessoa no mês atual: realizado por etapa, taxa de conversão entre etapas, e qual etapa é o maior gargalo (maior desvio negativo vs a taxa esperada da meta do mês). Útil pra 'qual o gap da minha/da operação de X'.",
    input_schema: {
      type: "object" as const,
      properties: {
        pessoa: { type: "string", description: "Nome da pessoa. Omitir = quem está perguntando." },
      },
      required: [],
    },
  },
  {
    name: "producao_pessoa",
    description: "Produção de uma pessoa no mês atual: crédito pago, quantidade de vendas, ticket médio.",
    input_schema: {
      type: "object" as const,
      properties: {
        pessoa: { type: "string", description: "Nome da pessoa. Omitir = quem está perguntando." },
      },
      required: [],
    },
  },
  {
    name: "ranking_credito",
    description: "Ranking de quem mais produziu crédito pago no mês atual, dentro do escopo de quem pergunta.",
    input_schema: {
      type: "object" as const,
      properties: {
        limite: { type: "number", description: "Quantas pessoas no ranking. Padrão: 10." },
      },
      required: [],
    },
  },
  {
    name: "visao_geral_time",
    description: "Resumo agregado do time no escopo de quem pergunta: total pago no mês, quantas pessoas ativas, quantas zeradas, funil somado. Bom ponto de partida pra perguntas genéricas tipo 'como estamos indo'.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
] as const;

export type MinervaToolName = (typeof MINERVA_TOOLS)[number]["name"];

export async function executarFerramenta(
  supabase: SupabaseClient,
  escopo: Escopo,
  nome: MinervaToolName,
  input: Record<string, unknown>
): Promise<unknown> {
  const inicioMes = inicioMesBR();

  if (nome === "listar_pessoas") {
    const pessoas = await pessoasNoEscopo(supabase, escopo);
    return pessoas.map((p) => ({
      nome: p.full_name,
      papel: ROLE_LABELS[p.role] ?? p.role,
      cargo: RANK_LABELS[p.rank] ?? p.rank,
    }));
  }

  if (nome === "pessoas_zeradas") {
    const periodo = (input.periodo as "hoje" | "semana" | "mes") ?? "mes";
    const { inicio, fim } = periodoParaDatas(periodo);
    const pessoas = await pessoasNoEscopo(supabase, escopo);
    const ids = pessoas.map((p) => p.id);
    if (ids.length === 0) return { zerados: [] };

    const { data: vendas } = await supabase.from("vendas").select("profile_id").in("profile_id", ids).gte("data", inicio).lte("data", fim);
    const comVenda = new Set((vendas ?? []).map((v) => v.profile_id));
    const zerados = pessoas.filter((p) => !comVenda.has(p.id)).map((p) => ({ nome: p.full_name, papel: ROLE_LABELS[p.role] ?? p.role }));
    return { periodo, totalPessoas: pessoas.length, zerados };
  }

  if (nome === "diagnostico_funil") {
    const resolvido = await resolverPessoa(supabase, escopo, input.pessoa as string | undefined);
    if ("erro" in resolvido) return resolvido;
    const alvoId = resolvido.id || escopo.viewerId;

    const { data: linhas } = await supabase
      .from("producao_funil")
      .select("etapa, realizado")
      .eq("profile_id", alvoId)
      .gte("data", inicioMes);
    const realizado = Object.fromEntries(FUNNEL_STAGES.map((e) => [e, 0])) as Record<FunilEtapa, number>;
    for (const l of linhas ?? []) realizado[l.etapa as FunilEtapa] += l.realizado;

    const { taxas } = await buscarMetaIndividual(supabase, alvoId);
    const gargalo = calcularGargalo(realizado, taxas);

    return {
      pessoa: resolvido.nome || "quem perguntou",
      realizadoPorEtapa: Object.fromEntries(FUNNEL_STAGES.map((e) => [FUNNEL_LABELS[e], realizado[e]])),
      gargalo: gargalo
        ? {
            etapa: FUNNEL_LABELS[gargalo.etapa],
            desvioPct: Math.round(gargalo.desvioPct),
            taxaRealizadaPct: Math.round(gargalo.taxaRealizada * 100),
            taxaEsperadaPct: Math.round(gargalo.taxaEsperada * 100),
          }
        : "Nenhum gargalo claro identificado (ou meta do mês não cadastrada com taxas esperadas).",
    };
  }

  if (nome === "producao_pessoa") {
    const resolvido = await resolverPessoa(supabase, escopo, input.pessoa as string | undefined);
    if ("erro" in resolvido) return resolvido;
    const alvoId = resolvido.id || escopo.viewerId;

    const { data: vendas } = await supabase.from("vendas").select("valor").eq("profile_id", alvoId).gte("data", inicioMes);
    const total = (vendas ?? []).reduce((s, v) => s + Number(v.valor), 0);
    const qtd = vendas?.length ?? 0;
    return {
      pessoa: resolvido.nome || "quem perguntou",
      creditoPagoMes: moeda(total),
      quantidadeVendas: qtd,
      ticketMedio: qtd > 0 ? moeda(total / qtd) : null,
    };
  }

  if (nome === "ranking_credito") {
    const limite = (input.limite as number) ?? 10;
    const pessoas = await pessoasNoEscopo(supabase, escopo);
    const ids = pessoas.map((p) => p.id);
    const nomePorId = new Map(pessoas.map((p) => [p.id, p.full_name]));
    if (ids.length === 0) return [];

    const { data: vendas } = await supabase.from("vendas").select("profile_id, valor").in("profile_id", ids).gte("data", inicioMes);
    const totais = new Map<string, number>();
    for (const v of vendas ?? []) totais.set(v.profile_id, (totais.get(v.profile_id) ?? 0) + Number(v.valor));
    return Array.from(totais.entries())
      .map(([id, valor]) => ({ nome: nomePorId.get(id) ?? "—", valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, limite)
      .map((r) => ({ nome: r.nome, creditoPago: moeda(r.valor) }));
  }

  if (nome === "visao_geral_time") {
    const pessoas = await pessoasNoEscopo(supabase, escopo);
    const ids = pessoas.map((p) => p.id);
    if (ids.length === 0) return { totalPessoas: 0 };

    const [{ data: vendas }, { data: funil }] = await Promise.all([
      supabase.from("vendas").select("profile_id, valor").in("profile_id", ids).gte("data", inicioMes),
      supabase.from("producao_funil").select("profile_id, etapa, realizado").in("profile_id", ids).gte("data", inicioMes),
    ]);

    const totalPago = (vendas ?? []).reduce((s, v) => s + Number(v.valor), 0);
    const comVenda = new Set((vendas ?? []).map((v) => v.profile_id));
    const funilTotal = Object.fromEntries(FUNNEL_STAGES.map((e) => [e, 0])) as Record<FunilEtapa, number>;
    for (const f of funil ?? []) funilTotal[f.etapa as FunilEtapa] += f.realizado;

    return {
      totalPessoas: pessoas.length,
      pessoasComVendaNoMes: comVenda.size,
      pessoasZeradasNoMes: pessoas.length - comVenda.size,
      creditoPagoTotalMes: moeda(totalPago),
      funilTotalMes: Object.fromEntries(FUNNEL_STAGES.map((e) => [FUNNEL_LABELS[e], funilTotal[e]])),
    };
  }

  return { erro: `Ferramenta desconhecida: ${nome}` };
}
