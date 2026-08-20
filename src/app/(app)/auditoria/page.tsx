import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";

const TRANSICAO_LABEL: Record<string, string> = {
  legionario_centuriao: "Legionário → Centurião",
  centuriao_tribuno: "Centurião → Tribuno",
  tribuno_pretor: "Tribuno → Pretor",
  pretor_legado: "Pretor → Legado",
};

const STATUS_COR: Record<string, string> = {
  pendente: "text-gold",
  aprovado: "text-success-bright",
  rejeitado: "text-wine-bright",
  aberto: "text-gold",
  resolvido: "text-success-bright",
};

type EventoAuditoria = {
  id: string;
  tipo: "Promoção" | "Contestação" | "Strike";
  pessoa: string;
  descricao: string;
  status?: string;
  created_at: string;
};

export default async function AuditoriaPage() {
  const supabase = await createClient();

  const [{ data: promocoes }, { data: contestacoes }, { data: strikes }] = await Promise.all([
    supabase
      .from("promotion_requests")
      .select("id, transicao, status, created_at, profile:profiles!promotion_requests_profile_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("contestacoes")
      .select("id, motivo, status, created_at, profile:profiles!contestacoes_profile_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("strikes")
      .select(
        "id, motivo, created_at, profile:profiles!strikes_profile_id_fkey(full_name), autor:profiles!strikes_registrado_por_fkey(full_name)"
      )
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const eventos: EventoAuditoria[] = [
    ...(promocoes ?? []).map((p) => {
      const perfil = p.profile as unknown as { full_name: string } | null;
      return {
        id: `promo-${p.id}`,
        tipo: "Promoção" as const,
        pessoa: perfil?.full_name ?? "—",
        descricao: TRANSICAO_LABEL[p.transicao] ?? p.transicao,
        status: p.status,
        created_at: p.created_at,
      };
    }),
    ...(contestacoes ?? []).map((c) => {
      const perfil = c.profile as unknown as { full_name: string } | null;
      return {
        id: `contest-${c.id}`,
        tipo: "Contestação" as const,
        pessoa: perfil?.full_name ?? "—",
        descricao: c.motivo,
        status: c.status,
        created_at: c.created_at,
      };
    }),
    ...(strikes ?? []).map((s) => {
      const perfil = s.profile as unknown as { full_name: string } | null;
      const autor = s.autor as unknown as { full_name: string } | null;
      return {
        id: `strike-${s.id}`,
        tipo: "Strike" as const,
        pessoa: perfil?.full_name ?? "—",
        descricao: `${s.motivo} (registrado por ${autor?.full_name ?? "—"})`,
        created_at: s.created_at,
      };
    }),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const TIPO_ICONE: Record<EventoAuditoria["tipo"], string> = {
    Promoção: "🎖️",
    Contestação: "⚖️",
    Strike: "⚠️",
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Auditoria</h1>
        <p className="kicker mt-1">Linha do tempo de promoções, contestações e strikes</p>
      </div>

      <Card>
        {eventos.length > 0 ? (
          <ul className="space-y-3">
            {eventos.map((e) => (
              <li key={e.id} className="flex items-start gap-3 border-b border-imperium-line pb-3 text-sm last:border-0">
                <span className="text-lg leading-none">{TIPO_ICONE[e.tipo]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-stone-100">
                      <span className="text-stone-500">{e.tipo}</span> · {e.pessoa}
                    </p>
                    {e.status && (
                      <span className={`text-xs uppercase ${STATUS_COR[e.status] ?? "text-stone-400"}`}>
                        {e.status}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-stone-400">{e.descricao}</p>
                  <p className="mt-0.5 text-xs text-stone-600">
                    {new Date(e.created_at).toLocaleDateString("pt-BR")} às{" "}
                    {new Date(e.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">Nenhum evento registrado ainda.</p>
        )}
      </Card>
    </main>
  );
}
