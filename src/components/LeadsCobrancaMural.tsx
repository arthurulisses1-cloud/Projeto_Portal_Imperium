import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buscarCobrancasLeads } from "@/lib/leads-cobranca-db";
import type { Cobranca } from "@/lib/leads-cobranca";

function rotulo(c: Cobranca): string {
  if (c.tipo === "pendencia_vencida") return `pendência vencida há ${c.dias}d`;
  if (c.tipo === "recuperacao_nova") return "novo na sua carteira (recuperação)";
  return c.dias <= 1 ? "atualizar status" : `sem atualização há ${c.dias}d`;
}

// Card do Mural (pedido do Diretor, 2026-10-09): leads de subido/fechamento
// esperando atualização de status e leads novos em recuperação. Some quando
// não há nada pendente.
export default async function LeadsCobrancaMural({ userId, role }: { userId: string; role: string }) {
  const supabase = await createClient();
  const itens = await buscarCobrancasLeads(supabase, userId, role);
  if (itens.length === 0) return null;

  return (
    <div className="card-imp border-wine/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="kicker flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-wine" />
          Leads precisando de atualização ({itens.length})
        </h3>
        <Link href="/leads" className="text-xs text-gold-bright hover:underline">
          Abrir Meus Leads →
        </Link>
      </div>
      <ul className="space-y-1.5">
        {itens.slice(0, 6).map(({ lead, cobranca }) => (
          <li key={lead.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-stone-200">{lead.lead_nome}</span>
            <span className={`shrink-0 text-xs ${cobranca.tipo === "pendencia_vencida" ? "text-wine-bright" : "text-stone-500"}`}>
              {rotulo(cobranca)}
            </span>
          </li>
        ))}
      </ul>
      {itens.length > 6 && <p className="mt-2 text-[11px] text-stone-600">+ {itens.length - 6} outros em Meus Leads.</p>}
    </div>
  );
}
