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

      const { count: tarefasCount } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", userId)
        .lte("due_date", hoje)
        .neq("coluna", "concluido");
      if (tarefasCount) pend["/tarefas"] = tarefasCount;
    }

    if (countCompromisso > 0) pend["/compromisso"] = countCompromisso;

    // Sinaliza "Plano de Carreira" quando todos os critérios do próximo rank já
    // batem e ainda não existe um pedido de promoção em aberto — evita que a
    // pessoa fique pronta pra subir sem perceber que precisa apertar o botão.
    const { data: perfilRank } = await supabase.from("profiles").select("rank, stars_total").eq("id", userId).single();
    if (perfilRank) {
      const resumo = await avaliarProntidaoPromocao(supabase, userId, role, perfilRank.rank as Rank, perfilRank.stars_total);
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
