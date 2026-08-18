import { createClient } from "@/lib/supabase/server";
import { RANK_LABELS } from "@/lib/labels";
import { STAR_PACE, type Rank } from "@/lib/carreira";
import { lookupComissao, proximoTier } from "@/lib/comissao";
import { buscarProgressoMarcos } from "@/lib/marcos";
import RankBadge from "./RankBadge";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default async function SidebarRight({ userId }: { userId: string }) {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("rank, stars_total")
    .eq("id", userId)
    .single();

  if (!profile) return null;
  const rank = profile.rank as Rank;
  const pace = STAR_PACE[rank] ?? STAR_PACE.legionario;
  const totalEstrelas = pace.estrelas || 6;

  const { data: quotes } = await supabase.from("sage_quotes").select("texto, fonte").eq("ativo", true);
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const quote = quotes && quotes.length > 0 ? quotes[(dayOfYear + 1) % quotes.length] : null;

  const { marcos } = await buscarProgressoMarcos(supabase, userId);

  const { data: tiers } = await supabase
    .from("commission_tiers")
    .select("producao_min, fixo, pct_variavel")
    .eq("rank", rank)
    .order("ordem");
  const inicioMes = new Date().toISOString().slice(0, 7) + "-01";
  const { data: vendasMes } = await supabase
    .from("vendas")
    .select("valor")
    .eq("profile_id", userId)
    .gte("data", inicioMes);
  const producaoMes = (vendasMes ?? []).reduce((s, v) => s + Number(v.valor), 0);
  const tiersOrdenados = [...(tiers ?? [])].sort((a, b) => a.producao_min - b.producao_min);
  const tierAtual = lookupComissao(tiersOrdenados, producaoMes);
  const proximo = proximoTier(tiersOrdenados, producaoMes);

  return (
    <aside className="hidden w-72 shrink-0 space-y-6 border-l border-imperium-line bg-imperium-surface p-5 xl:block">
      <div className="text-center">
        <p className="kicker mb-3">Cargo Atual</p>
        <RankBadge rank={rank} size="lg" />
        <p className="mt-2 font-display text-base text-gold-bright">{RANK_LABELS[rank]}</p>
        <p className="mt-1 text-lg tracking-widest">
          {Array.from({ length: totalEstrelas }).map((_, i) => (
            <span key={i} className={i < profile.stars_total ? "text-gold" : "text-imperium-line-strong"}>
              ★
            </span>
          ))}
        </p>
      </div>

      {quote && (
        <div className="border-t border-imperium-line pt-4 text-center">
          <p className="kicker mb-2">Conselhos do Sábio</p>
          <p className="font-serif text-sm italic text-stone-300">&quot;{quote.texto}&quot;</p>
          <p className="mt-1 text-[10px] text-stone-600">{quote.fonte}</p>
        </div>
      )}

      <div className="border-t border-imperium-line pt-4">
        <p className="kicker mb-3">Sistema de Marcos</p>
        <div className="grid grid-cols-3 gap-2">
          {marcos.map((m) => (
            <div
              key={m.id}
              className={`relative flex aspect-square items-center justify-center rounded-full border text-lg ${
                m.alcancado
                  ? "border-gold bg-gold/10"
                  : "border-imperium-line-strong bg-imperium-bg/40 opacity-50"
              }`}
              title={m.nome}
            >
              {m.icone}
              {!m.alcancado && <span className="absolute -bottom-1 -right-1 text-xs">🔒</span>}
            </div>
          ))}
        </div>
      </div>

      {tierAtual && (
        <div className="border-t border-imperium-line pt-4">
          <p className="kicker mb-3">Tabela de Remuneração</p>
          <div className="mb-2 flex items-end gap-1">
            {tiersOrdenados.map((t, i) => (
              <div
                key={t.producao_min}
                className={`flex-1 rounded-t ${i === tierAtual.tierIdx ? "bg-gold" : "bg-imperium-line"}`}
                style={{ height: `${16 + i * 6}px` }}
              />
            ))}
          </div>
          <p className="text-center text-xs text-stone-400">
            Tier {tierAtual.tierIdx + 1} de {tiersOrdenados.length}
          </p>
          {proximo ? (
            <p className="mt-1 text-center text-xs text-stone-500">
              Faltam <span className="text-gold">{moeda(proximo.faltaProducao)}</span> pro próximo
              tier.
              <br />
              Se alcançar, <span className="text-emerald-400">+{moeda(proximo.ganhoTotal)}</span> na
              comissão.
            </p>
          ) : (
            <p className="mt-1 text-center text-xs text-emerald-400">Tier máximo atingido.</p>
          )}
        </div>
      )}
    </aside>
  );
}
