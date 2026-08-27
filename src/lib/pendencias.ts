import type { SupabaseClient } from "@supabase/supabase-js";
import { avaliarProntidaoPromocao, type Rank } from "./carreira";

// Contagem de pendências por aba, pra sinalizar no menu lateral que tem
// algo a fazer (ex: compromisso do dia ainda não lançado). Sempre baseado
// no papel REAL do usuário, não no "ver como" do Diretor.
export async function buscarPendencias(
  supabase: SupabaseClient,
  userId: string,
  role: string,
  triboId: string | null
): Promise<Record<string, number>> {
  const pend: Record<string, number> = {};
  const hoje = new Date().toISOString().slice(0, 10);

  if (role === "sdr" || role === "closer") {
    const { data: hojeRow } = await supabase
      .from("compromissos")
      .select("lancado")
      .eq("profile_id", userId)
      .eq("data", hoje)
      .maybeSingle();
    let countCompromisso = hojeRow?.lancado ? 0 : 1;

    if (role === "closer" && triboId) {
      const { data: sdrs } = await supabase.from("profiles").select("id").eq("tribo_id", triboId).eq("role", "sdr");
      const idsSdrs = (sdrs ?? []).map((s) => s.id);
      if (idsSdrs.length > 0) {
        const { data: rows } = await supabase
          .from("compromissos")
          .select("profile_id, lancado, falta")
          .in("profile_id", idsSdrs)
          .eq("data", hoje);
        const porId = new Map((rows ?? []).map((r) => [r.profile_id, r]));
        for (const id of idsSdrs) {
          const r = porId.get(id);
          if (!r || (!r.lancado && !r.falta)) countCompromisso++;
        }
      }
    }

    if (countCompromisso > 0) pend["/compromisso"] = countCompromisso;

    // Tarefas atrasadas — vale pra SDR e Closer (antes só contava pro
    // Closer, achado 2026-08-27 ao terminar o Kanban de Tarefas).
    const { count: tarefasCount } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", userId)
      .lte("due_date", hoje)
      .neq("coluna", "concluido");
    if (tarefasCount) pend["/tarefas"] = tarefasCount;

    // Sinaliza "Plano de Carreira" quando todos os critérios do próximo rank já
    // batem e ainda não existe um pedido de promoção em aberto — evita que a
    // pessoa fique pronta pra subir sem perceber que precisa apertar o botão.
    const { data: perfilRank } = await supabase.from("profiles").select("rank, stars_total, tribo_id").eq("id", userId).single();
    if (perfilRank) {
      const resumo = await avaliarProntidaoPromocao(supabase, userId, role, perfilRank.rank as Rank, perfilRank.stars_total, perfilRank.tribo_id);
      if (resumo && resumo.ok === resumo.total) {
        const { count: pedidoPendente } = await supabase
          .from("promotion_requests")
          .select("id", { count: "exact", head: true })
          .eq("profile_id", userId)
          .eq("status", "pendente");
        if (!pedidoPendente) pend["/carreira"] = 1;
      }
    }
  }

  if (role === "lider") {
    const { data: exercito } = await supabase.from("exercitos").select("id").eq("legado_id", userId).maybeSingle();
    if (exercito) {
      const { data: tribos } = await supabase.from("tribos").select("id, closer_id").eq("exercito_id", exercito.id);
      const { data: sdrs } = tribos && tribos.length > 0
        ? await supabase.from("profiles").select("id").in("tribo_id", tribos.map((t) => t.id))
        : { data: [] };
      const idsLiderados = [
        ...(tribos ?? []).map((t) => t.closer_id).filter((id): id is string => !!id),
        ...(sdrs ?? []).map((s) => s.id),
      ];
      if (idsLiderados.length > 0) {
        const { data: pdiRows } = await supabase
          .from("pdi_registros")
          .select("profile_id, proxima_revisao, created_at")
          .in("profile_id", idsLiderados)
          .order("created_at", { ascending: false });
        const ultimoPorMembro = new Map<string, string | null>();
        for (const r of pdiRows ?? []) {
          if (!ultimoPorMembro.has(r.profile_id)) ultimoPorMembro.set(r.profile_id, r.proxima_revisao);
        }
        const pendentes = Array.from(ultimoPorMembro.values()).filter((d) => d && d <= hoje).length;
        if (pendentes > 0) pend["/exercito"] = pendentes;
      }
    }

    // Tarefas atrasadas do próprio líder (não do time — o quadro do time
    // já mostra isso dentro de /tarefas).
    const { count: tarefasCount } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", userId)
      .lte("due_date", hoje)
      .neq("coluna", "concluido");
    if (tarefasCount) pend["/tarefas"] = tarefasCount;
  }

  if (role === "diretor") {
    const [{ count: c1 }, { count: c2 }, { count: c3 }] = await Promise.all([
      supabase.from("promotion_evidence").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      supabase.from("promotion_requests").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      supabase.from("contestacoes").select("id", { count: "exact", head: true }).eq("status", "aberto"),
    ]);
    if (c1) pend["/validacao"] = c1;
    if (c2) pend["/aprovacoes"] = c2;
    if (c3) pend["/contestacoes"] = c3;
  }

  return pend;
}

// Bolinha vermelha no Mural (lateral) quando surge notícia/enquete nova —
// compara o post mais recente com a última vez que essa pessoa abriu o
// Mural (profiles.mural_visto_em, atualizado quando a página "/" carrega).
export async function temNovidadeMural(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const [{ data: ultimoPost }, { data: perfil }] = await Promise.all([
    supabase.from("mural_posts").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("profiles").select("mural_visto_em").eq("id", userId).maybeSingle(),
  ]);
  if (!ultimoPost) return false;
  if (!perfil?.mural_visto_em) return true;
  return new Date(ultimoPost.created_at) > new Date(perfil.mural_visto_em);
}

// Bolinha vermelha em "Meus Leads" quando chega entrevista nova (pedido
// do Diretor, 2026-08-27) — mesmo padrão do Mural acima, só que aqui o
// "post mais recente" é escopado por RLS: o select já vem só com os
// leads que essa pessoa pode ver (dono, líder do Exército, closer da
// Tribo ou Diretor), então não precisa reconferir escopo aqui.
export async function temNovidadeLeads(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const [{ data: ultimoLead }, { data: perfil }] = await Promise.all([
    supabase.from("entrevistas_leads").select("criado_em").order("criado_em", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("profiles").select("leads_visto_em").eq("id", userId).maybeSingle(),
  ]);
  if (!ultimoLead) return false;
  if (!perfil?.leads_visto_em) return true;
  return new Date(ultimoLead.criado_em) > new Date(perfil.leads_visto_em);
}
