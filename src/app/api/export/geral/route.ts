import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FUNNEL_STAGES, type FunilEtapa } from "@/lib/funil";

function csvEscape(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "diretor") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data: exercitos } = await supabase.from("exercitos").select("id, nome");
  const { data: tribos } = await supabase.from("tribos").select("id, nome, exercito_id");
  const { data: pessoas } = await supabase
    .from("profiles")
    .select("id, tribo:tribos!profiles_tribo_id_fkey(id, exercito_id)")
    .in("role", ["sdr", "closer"]);

  const orgPorProfile = new Map<string, { triboId: string | null; exercitoId: string | null }>();
  for (const p of pessoas ?? []) {
    const tribo = p.tribo as unknown as { id: string; exercito_id: string } | null;
    orgPorProfile.set(p.id, { triboId: tribo?.id ?? null, exercitoId: tribo?.exercito_id ?? null });
  }

  const inicioMes = new Date().toISOString().slice(0, 7) + "-01";
  const ids = Array.from(orgPorProfile.keys());
  const [{ data: funilRows }, { data: vendasRows }] = await Promise.all([
    ids.length
      ? supabase.from("producao_funil").select("profile_id, etapa, realizado").in("profile_id", ids).gte("data", inicioMes)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from("vendas").select("profile_id, valor").in("profile_id", ids).gte("data", inicioMes)
      : Promise.resolve({ data: [] }),
  ]);

  function totaisVazios() {
    return Object.fromEntries(FUNNEL_STAGES.map((e) => [e, 0])) as Record<FunilEtapa, number>;
  }
  const totalPorTribo = new Map<string, Record<FunilEtapa, number>>();
  const pagoPorTribo = new Map<string, number>();
  for (const row of funilRows ?? []) {
    const triboId = orgPorProfile.get(row.profile_id)?.triboId;
    if (!triboId) continue;
    if (!totalPorTribo.has(triboId)) totalPorTribo.set(triboId, totaisVazios());
    totalPorTribo.get(triboId)![row.etapa as FunilEtapa] += row.realizado;
  }
  for (const row of vendasRows ?? []) {
    const triboId = orgPorProfile.get(row.profile_id)?.triboId;
    if (!triboId) continue;
    pagoPorTribo.set(triboId, (pagoPorTribo.get(triboId) ?? 0) + Number(row.valor));
  }

  const exercitoNome = new Map((exercitos ?? []).map((e) => [e.id, e.nome]));

  const header = ["Exército", "Tribo", ...FUNNEL_STAGES, "Pago (R$)"];
  const linhas = (tribos ?? []).map((t) => {
    const totais = totalPorTribo.get(t.id) ?? totaisVazios();
    return [
      exercitoNome.get(t.exercito_id) ?? "",
      t.nome,
      ...FUNNEL_STAGES.map((e) => totais[e]),
      (pagoPorTribo.get(t.id) ?? 0).toFixed(2),
    ];
  });

  const csv = [header, ...linhas].map((linha) => linha.map(csvEscape).join(",")).join("\n");
  const bom = "﻿";

  return new NextResponse(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="visao-geral-${inicioMes}.csv"`,
    },
  });
}
