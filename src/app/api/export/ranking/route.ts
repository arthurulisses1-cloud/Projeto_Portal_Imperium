import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inicioMesBR } from "@/lib/data-br";

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

  const { data: pessoas } = await supabase
    .from("profiles")
    .select("id, full_name, role, tribo:tribos!profiles_tribo_id_fkey(nome, exercito:exercitos(nome))")
    .in("role", ["sdr", "closer"]);

  const ids = (pessoas ?? []).map((p) => p.id);
  const inicioMes = inicioMesBR();

  const [{ data: funilRows }, { data: vendasRows }] = await Promise.all([
    ids.length
      ? supabase.from("producao_funil").select("profile_id, etapa, realizado").in("profile_id", ids).gte("data", inicioMes)
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabase.from("vendas").select("profile_id, valor").in("profile_id", ids).gte("data", inicioMes)
      : Promise.resolve({ data: [] }),
  ]);

  const funilPorPessoa = new Map<string, Record<string, number>>();
  for (const row of funilRows ?? []) {
    const bucket = funilPorPessoa.get(row.profile_id) ?? {};
    bucket[row.etapa] = (bucket[row.etapa] ?? 0) + row.realizado;
    funilPorPessoa.set(row.profile_id, bucket);
  }
  const pagoPorPessoa = new Map<string, number>();
  for (const row of vendasRows ?? []) {
    pagoPorPessoa.set(row.profile_id, (pagoPorPessoa.get(row.profile_id) ?? 0) + Number(row.valor));
  }

  const header = [
    "Nome",
    "Papel",
    "Exército",
    "Tribo",
    "Tentativas",
    "Conexões",
    "Entrevistas",
    "Assinaturas",
    "Pagos (qtd)",
    "Pago (R$)",
  ];
  const linhas = (pessoas ?? []).map((p) => {
    const tribo = p.tribo as unknown as { nome: string; exercito: { nome: string } | null } | null;
    const f = funilPorPessoa.get(p.id) ?? {};
    return [
      p.full_name,
      p.role,
      tribo?.exercito?.nome ?? "",
      tribo?.nome ?? "",
      f.tentativas ?? 0,
      f.conexoes ?? 0,
      f.entrevistas ?? 0,
      f.assinaturas ?? 0,
      f.pagos ?? 0,
      (pagoPorPessoa.get(p.id) ?? 0).toFixed(2),
    ];
  });

  const csv = [header, ...linhas].map((linha) => linha.map(csvEscape).join(",")).join("\n");
  const bom = "﻿"; // pra Excel abrir acentuação certa

  return new NextResponse(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ranking-${inicioMes}.csv"`,
    },
  });
}
