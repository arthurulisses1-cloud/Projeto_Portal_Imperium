import { createClient } from "@/lib/supabase/server";
import LeadsView, { type Lead, type MotivoPerda, type ComplianceResultado } from "@/components/leads/LeadsView";
import ComplianceResultadosForm from "@/components/leads/ComplianceResultadosForm";
import MotivosPerdaForm from "@/components/leads/MotivosPerdaForm";
import { getViewerContext } from "@/lib/preview";
import { logErroSupabase } from "@/lib/log-erro-supabase";
import { normalizarNome } from "@/lib/sync/parse";
import { classificarBalde, type StatusManual } from "@/lib/forecast";
import { inicioMesBR, hojeBR } from "@/lib/data-br";
import { ETAPAS_ABERTAS } from "@/lib/leads-cobranca";
import { podeVerArea } from "@/lib/permissoes-analista";
import LeadsFinanceView, { type LeadFinance, type MotivoFinance } from "@/components/leads/LeadsFinanceView";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ViewerContext } from "@/lib/preview";

const COLUNAS_FINANCE =
  "id, data, lead_nome, lead_telefone, sdr_profile_id, closer_profile_id, entrevistado, origem, tipo_precatorio, fundo_destino, status_followup, sub_valor_precatorio, sub_valor_proposta, sub_comissao_prevista, sub_mesmo_fundo, sub_fundo_novo, sub_anexo_path, subido_obs, venda_valor_recebido, venda_valor_cliente, venda_data, venda_obs, venda_recusa_motivo";

/** Meus Leads do Vorp Finance (2026-11-17): Entrevista -> Subido -> Resolvendo pendência -> Venda. */
async function LeadsFinance({ supabase, viewer }: { supabase: SupabaseClient; viewer: ViewerContext }) {
  const { data: fin } = await supabase.from("negocios").select("id").eq("slug", "vorp-finance").maybeSingle();
  const { data: vinc } = fin
    ? await supabase.from("profile_negocios").select("cargo").eq("profile_id", viewer.effectiveId).eq("negocio_id", fin.id).maybeSingle()
    : { data: null };
  const diretor = viewer.effectiveRole === "diretor";
  // Analista com a área "Meus Leads" liberada vê o funil inteiro (a edição segue analista_permissoes.pode_editar).
  const analista = viewer.effectiveRole === "analista" && (await podeVerArea(supabase, viewer.effectiveId, viewer.effectiveRole, "leads"));
  if (!fin || (!vinc && !diretor && !analista)) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-xl text-gold-bright">Acesso restrito</h1>
        <p className="mt-2 text-sm text-stone-400">Meus Leads é do time do Vorp Finance.</p>
      </main>
    );
  }
  await supabase.from("profiles").update({ leads_visto_em: new Date().toISOString() }).eq("id", viewer.authUserId);

  // Executivo vê só os próprios leads (SDR ou closer); o Head e o Diretor veem o funil inteiro.
  const veTudo = diretor || analista || vinc?.cargo === "head";
  let consultaLeads = supabase.from("entrevistas_leads").select(COLUNAS_FINANCE).eq("negocio_id", fin.id);
  if (!veTudo) consultaLeads = consultaLeads.or(`sdr_profile_id.eq.${viewer.effectiveId},closer_profile_id.eq.${viewer.effectiveId}`);
  const [{ data: leadsRaw, error }, { data: motivosRaw }] = await Promise.all([
    consultaLeads.order("data", { ascending: false }).limit(1500),
    supabase.from("motivos_perda_lead").select("id, nome, etapa").eq("ativo", true).order("ordem"),
  ]);
  logErroSupabase("LeadsPage: entrevistas_leads (Finance)", error);
  const leads = (leadsRaw ?? []) as unknown as LeadFinance[];

  const ids = Array.from(new Set(leads.flatMap((l) => [l.sdr_profile_id, l.closer_profile_id]).filter((x): x is string => !!x)));
  const { data: pessoas } = ids.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] as { id: string; full_name: string }[] };
  const nomePorId = Object.fromEntries((pessoas ?? []).map((p) => [p.id, p.full_name as string]));

  // Anexos ficam em bucket privado: gera links temporários (1 h).
  const caminhos = leads.map((l) => l.sub_anexo_path).filter((p): p is string => !!p);
  const anexoUrls: Record<string, string> = {};
  if (caminhos.length > 0) {
    const { data: urls } = await supabase.storage.from("leads-anexos").createSignedUrls(caminhos, 3600);
    const porCaminho = new Map((urls ?? []).map((u) => [u.path, u.signedUrl]));
    for (const l of leads) if (l.sub_anexo_path && porCaminho.get(l.sub_anexo_path)) anexoUrls[l.id] = porCaminho.get(l.sub_anexo_path)!;
  }

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Meus Leads</h1>
        <p className="kicker mt-1">Vorp Finance — entrevistas, subidos, pendências e vendas (a venda conta depois da aprovação do Head)</p>
      </div>
      <LeadsFinanceView
        leads={leads}
        nomePorId={nomePorId}
        podeAprovar={diretor || vinc?.cargo === "head"}
        motivos={(motivosRaw ?? []) as MotivoFinance[]}
        anexoUrls={anexoUrls}
        hoje={hojeBR()}
      />
    </main>
  );
}

export default async function LeadsPage({ searchParams }: { searchParams: { visao?: string; legado?: string } }) {
  const supabase = await createClient();
  const viewer = await getViewerContext(supabase);
  if (!viewer) return null;
  // Meus Leads agora é o funil do Vorp Finance. O funil antigo (Matri) fica só para o Diretor, em ?legado=matri.
  if (!(searchParams.legado === "matri" && viewer.realRole === "diretor" && !viewer.isPreview)) {
    return <LeadsFinance supabase={supabase} viewer={viewer} />;
  }
  const meRole = viewer.effectiveRole;
  const analistaLiberado = meRole === "analista" && (await podeVerArea(supabase, viewer.effectiveId, meRole, "leads"));

  // SDR entra só pro funil de Repasse de Entrevistas (pedido do Diretor,
  // 2026-10-09: é um funil dentro de Meus Leads, não uma aba separada) — e só
  // enxerga o que está no nome dele.
  const ehSdr = meRole === "sdr";

  if (!["closer", "lider", "diretor"].includes(meRole) && !analistaLiberado && !ehSdr) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-xl text-gold-bright">Acesso restrito</h1>
        <p className="mt-2 text-sm text-stone-400">Leads é uma visão de Closers, líderes e Diretoria.</p>
      </main>
    );
  }

  // Apaga a bolinha vermelha da lateral (ver temNovidadeLeads em
  // src/lib/pendencias.ts). Melhor-esforço: não bloqueia a página se falhar.
  await supabase.from("profiles").update({ leads_visto_em: new Date().toISOString() }).eq("id", viewer.authUserId);

  // Mini-CRM de fluxo de trabalho — mês corrente MAIS qualquer lead de mês
  // anterior que ainda esteja em aberto (pedido do Diretor, 2026-10-09: o
  // lead esquecido é justamente o que o ciclo de recuperação precisa
  // resgatar; o sync só apaga o que já terminou). Lead terminado
  // (assinado/pago/perdido) de mês passado não aparece.
  const inicioMes = inicioMesBR();
  const hoje = hojeBR();

  // RLS de entrevistas_leads já filtra pro recorte certo (dono, líder do
  // Exército, closer da Tribo, Diretor) — um select liso já vem certo,
  // sem precisar montar a lógica de escopo na mão como o Forecast faz
  // (lá a RLS de weekly_operacoes é aberta de propósito, ver Forecast).
  const colunasLead =
    "id, data, lead_nome, lead_telefone, sdr_profile_id, closer_profile_id, canal, origem, entrevistado, estado_civil, decisor, dores, documentacao_ciente, valores_apresentados, status_followup, observacao, motivo_perda_id, motivo_perda_obs, motivo_perda_etapa, temperatura, valor_credito, em_reanalise, reanalise_data, status_em, subido_em, subido_obs, compliance_resultado_id, compliance_comportamento, compliance_obs, compliance_atualizado_em, pendencia_prazo, ultima_atualizacao_em, ultimo_movimento_em, rot_responsavel_id, rot_fase, rot_etapa, rot_nota, rot_desde, rot_primeiro_toque_em, rot_ciclos, recusada_em, recusa_motivo, repasse_sdr_id, repasse_etapa, repasse_desde, repasse_nota";
  const consultaLeads = ehSdr
    ? supabase
        .from("entrevistas_leads")
        .select(colunasLead)
        .eq("repasse_sdr_id", viewer.effectiveId)
        .not("repasse_etapa", "is", null)
        .order("data", { ascending: false })
        .limit(1000)
    : supabase
        .from("entrevistas_leads")
        .select(colunasLead)
        .or(`data.gte.${inicioMes},status_followup.in.(${Array.from(ETAPAS_ABERTAS).join(",")})`)
        .order("data", { ascending: false })
        .limit(3000);
  const [{ data: leadsRaw, error }, { data: motivosRaw }, { data: resultadosRaw }] = await Promise.all([
    consultaLeads,
    supabase.from("motivos_perda_lead").select("id, nome, ativo, etapa").order("ordem"),
    supabase.from("compliance_resultados").select("id, nome, comportamento, ativo").order("ordem"),
  ]);
  logErroSupabase("LeadsPage: entrevistas_leads", error);

  const leads = (leadsRaw ?? []) as Omit<Lead, "classificacao">[];
  const motivosTodos = (motivosRaw ?? []) as MotivoPerda[];
  const motivosAtivos = motivosTodos.filter((m) => m.ativo);
  const resultadosTodos = (resultadosRaw ?? []) as ComplianceResultado[];
  const resultadosAtivos = resultadosTodos.filter((r) => r.ativo);

  const idsPessoas = Array.from(
    new Set(leads.flatMap((l) => [l.sdr_profile_id, l.closer_profile_id, l.rot_responsavel_id, l.repasse_sdr_id]).filter((x): x is string => !!x))
  );
  const [{ data: pessoas }, { data: exercitosRaw }] = await Promise.all([
    idsPessoas.length > 0
      ? supabase
          .from("profiles")
          .select("id, full_name, tribo:tribos!profiles_tribo_id_fkey(exercito:exercitos(nome))")
          .in("id", idsPessoas)
      : Promise.resolve({ data: [] as { id: string; full_name: string; tribo: unknown }[] }),
    // Legado do Exército não tem tribo_id (lidera o Exército inteiro) —
    // sem esse fallback, um lead cujo Closer é líder "perde" o filtro de
    // Exército (mesma pegadinha documentada em guerra.ts/forecast.ts).
    supabase.from("exercitos").select("nome, legado_id"),
  ]);
  const nomePorId = new Map((pessoas ?? []).map((p) => [p.id, p.full_name as string]));
  const exercitoIdPorLegado = new Map((exercitosRaw ?? []).map((e) => [e.legado_id, e.nome]));
  const exercitoPorProfileId = new Map(
    (pessoas ?? []).map((p) => {
      const tribo = p.tribo as unknown as { exercito: { nome: string } | null } | null;
      return [p.id, tribo?.exercito?.nome ?? exercitoIdPorLegado.get(p.id) ?? null] as const;
    })
  );

  // Tag de classificação do Forecast nos leads Assinado/Pago (pedido do
  // Diretor, 2026-08-27: "crie uma tag pra cada classificação... o que tá
  // pago e assinado pode tirar o quente, porque já deu certo") — casa por
  // SDR+Closer+nome do cliente normalizado, mesma chave que o sync usa em
  // run.ts pra fechar o loop Assinado -> status_followup. Calculado aqui
  // (não gravado em entrevistas_leads) porque status_manual muda depois do
  // sync, direto no Forecast — ler ao vivo garante que a tag nunca fica
  // desatualizada.
  const idsAssinadosOuPagos = leads.filter((l) => l.status_followup === "assinado" || l.status_followup === "pago");
  const classificacaoPorLead = new Map<string, ReturnType<typeof classificarBalde>>();
  if (idsAssinadosOuPagos.length > 0) {
    // Tabela pequena (algumas centenas de linhas, mesmo raciocínio já usado
    // em run.ts) — ler tudo paginado é barato e evita ponto cego de filtro
    // por id que não bateria certo com sdr_profile_id/closer_profile_id ao
    // mesmo tempo.
    const porChave = new Map<string, { status: string; statusManual: StatusManual | null }>();
    let from = 0;
    const pageSize = 1000;
    for (;;) {
      const { data: pagina } = await supabase
        .from("weekly_operacoes")
        .select("cliente, sdr_profile_id, closer_profile_id, status, status_manual, data")
        .order("data", { ascending: true })
        .range(from, from + pageSize - 1);
      for (const o of pagina ?? []) {
        if (!o.cliente) continue;
        const chave = `${o.sdr_profile_id ?? ""}|${o.closer_profile_id ?? ""}|${normalizarNome(o.cliente)}`;
        porChave.set(chave, { status: o.status, statusManual: o.status_manual as StatusManual | null });
      }
      if (!pagina || pagina.length < pageSize) break;
      from += pageSize;
    }
    for (const l of idsAssinadosOuPagos) {
      const chave = `${l.sdr_profile_id ?? ""}|${l.closer_profile_id ?? ""}|${normalizarNome(l.lead_nome)}`;
      const match = porChave.get(chave);
      if (match) classificacaoPorLead.set(l.id, classificarBalde(match));
    }
  }

  const leadsComClassificacao: Lead[] = leads.map((l) => ({ ...l, classificacao: classificacaoPorLead.get(l.id) ?? null }));

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">{ehSdr ? "Repasse de Entrevistas" : "Meus Leads"}</h1>
        <p className="kicker mt-1">
          {ehSdr
            ? "Entrevistas recusadas por closers de outros Exércitos — sua missão é gerar uma nova entrevista com cada cliente"
            : "Entrevistas recebidas este mês — acompanhe, envie proposta, faça follow-up"}
        </p>
      </div>

      <LeadsView
        leads={leadsComClassificacao}
        nomePorId={nomePorId}
        motivosPerda={motivosAtivos}
        exercitoPorProfileId={exercitoPorProfileId}
        resultadosCompliance={resultadosAtivos}
        viewerId={viewer.effectiveId}
        hoje={hoje}
        modo={ehSdr ? "sdr" : "completo"}
        verRepasseSdr={ehSdr || meRole === "diretor" || analistaLiberado}
        visaoInicial={searchParams.visao}
        adminPerdas={meRole === "diretor" ? <MotivosPerdaForm motivos={motivosTodos} /> : undefined}
        adminSubidos={meRole === "diretor" ? <ComplianceResultadosForm resultados={resultadosTodos} /> : undefined}
      />

    </main>
  );
}
