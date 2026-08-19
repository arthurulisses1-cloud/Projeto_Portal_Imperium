import { NextResponse } from "next/server";
import { runSync } from "@/lib/sync/run";

export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const authHeader = request.headers.get("authorization"); // Vercel Cron manda "Bearer <CRON_SECRET>" automaticamente
  const secret =
    url.searchParams.get("secret") ??
    request.headers.get("x-sync-secret") ??
    authHeader?.replace(/^Bearer\s+/i, "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const resultado = await runSync();
  return NextResponse.json({ ok: true, ...resultado });
}
