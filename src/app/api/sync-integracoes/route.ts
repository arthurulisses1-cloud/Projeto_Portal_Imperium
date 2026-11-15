import { NextResponse } from "next/server";
import { runSyncIntegracoes } from "@/lib/integracoes/run";

export const maxDuration = 60;

// Realizado automático do Dashboard do Negócio (3C Plus + Pipefácil). Mesma proteção do /api/sync.
// Parâmetros opcionais: desde3c=YYYY-MM-DD (recalcula o 3C desde essa data), vendas=0 (não mexe
// em vendas), simular=1 (só calcula, não grava).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const authHeader = request.headers.get("authorization");
  const secret = url.searchParams.get("secret") ?? request.headers.get("x-sync-secret") ?? authHeader?.replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const desde3c = url.searchParams.get("desde3c");
  const resultado = await runSyncIntegracoes({
    desde3c: desde3c && /^\d{4}-\d{2}-\d{2}$/.test(desde3c) ? desde3c : undefined,
    criarVendas: url.searchParams.get("vendas") !== "0",
    simular: url.searchParams.get("simular") === "1",
  });
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 207 });
}
