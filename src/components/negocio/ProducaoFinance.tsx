import type { SupabaseClient } from "@supabase/supabase-js";
import MetaExecutivo from "@/components/negocio/MetaExecutivo";
import { buscarPaceNegocios, calcularPace, limitesDoMes } from "@/lib/pace-negocio";
import { NEGOCIO_COR, nomeEquipe } from "@/lib/negocios";

const MESES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Conversões esperadas do funil individual do Finance (decisão do Diretor, 2026-11-17). */
export const CONVERSOES_FINANCE = { entrevistaParaSubido: 0.3, subidoParaPendencia: 0.6, pendenciaParaGanho: 0.3 } as const;

const ETAPAS_POS_PENDENCIA = ["resolvendo_pendencia", "venda_pendente", "venda_aprovada"];

type Lead = { id: string; data: string; status_followup: string; subido_em: string | null; venda_aprovada_em: string | null };

function corConversao(real: number | null, meta: number): string {
  if (real === null) return "text-stone-100";
  if (real >= meta) return "text-success-bright";
  if (real >= meta * 0.85) return "text-warning-bright";
  return "text-wine-bright";
}

const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Minha Produção do executivo do Vorp Finance: o mesmo funil de Meus Leads (Entrevistas, Subidos, Em pendência, Ganhos).
 *  Entrevista = a que ele subiu pelo QR Code (planilha, como SDR ou closer); Subido = o lead que ele moveu para Subido. */
export default async function ProducaoFinance({
  supabase,
  meId,
  hoje,
}: {
  supabase: SupabaseClient;
  meId: string;
  hoje: string;
}) {
  const [ano, mes] = hoje.split("-").map(Number);
  const { inicio, fim } = limitesDoMes(ano, mes);
  const fimExcl = new Date(Date.parse(fim + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);

  const { data: fin } = await supabase.from("negocios").select("id").eq("slug", "vorp-finance").maybeSingle();
  const colunas = "id, data, status_followup, subido_em, venda_aprovada_em";
  const meu = `sdr_profile_id.eq.${meId},closer_profile_id.eq.${meId}`;
  const [{ data: porData }, { data: porSubido }] = fin
    ? await Promise.all([
        supabase.from("entrevistas_leads").select(colunas).eq("negocio_id", fin.id).or(meu).gte("data", inicio).lt("data", fimExcl).limit(2000),
        // Subido = o lead que ELE moveu para Subido (quem registrou o subido), não quem fez a entrevista.
        supabase.from("entrevistas_leads").select(colunas).eq("negocio_id", fin.id).eq("subido_por", meId).gte("subido_em", inicio).lt("subido_em", fimExcl).limit(2000),
      ])
    : [{ data: [] as Lead[] }, { data: [] as Lead[] }];

  const entrevistas = (porData ?? []) as Lead[];
  const subidos = (porSubido ?? []) as Lead[];
  const pendencia = subidos.filter((l) => ETAPAS_POS_PENDENCIA.includes(l.status_followup));
  const ganhos = subidos.filter((l) => l.status_followup === "venda_aprovada");

  const etapas = [
    { label: "Entrevistas", qtd: entrevistas.length, conv: null as number | null, esperada: null as number | null, de: "" },
    { label: "Subidos", qtd: subidos.length, conv: entrevistas.length > 0 ? subidos.length / entrevistas.length : null, esperada: CONVERSOES_FINANCE.entrevistaParaSubido, de: "Entrevistas" },
    { label: "Em pendência", qtd: pendencia.length, conv: subidos.length > 0 ? pendencia.length / subidos.length : null, esperada: CONVERSOES_FINANCE.subidoParaPendencia, de: "Subidos" },
    { label: "Ganhos", qtd: ganhos.length, conv: pendencia.length > 0 ? ganhos.length / pendencia.length : null, esperada: CONVERSOES_FINANCE.pendenciaParaGanho, de: "Em pendência" },
  ];
  const topo = Math.max(1, ...etapas.map((e) => e.qtd));

  // Meta de pagos (R$): a meta do negócio rateada pelos executivos; o realizado é o que ele vendeu.
  const [pn] = await buscarPaceNegocios(supabase, ano, mes, hoje, ["vorp-finance"]);
  const eu = pn?.pessoas.find((p) => p.id === meId);
  const cor = NEGOCIO_COR["vorp-finance"] ?? "201 162 74";

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Minha produção</h1>
        <p className="mt-1 text-sm text-stone-400">
          {pn ? nomeEquipe(pn.negocio) : "Vorp Finance"} · {MESES[mes]} de {ano} · o mesmo funil do seu Meus Leads.
        </p>
      </div>

      {pn && eu && eu.meta !== null && (
        <MetaExecutivo
          pace={calcularPace({ meta: eu.meta, recebido: eu.recebido, hoje, ano, mes })}
          equipe={nomeEquipe(pn.negocio)}
          cor={cor}
          mesLabel={MESES[mes] + " de " + ano}
          mesAtual
        />
      )}

      <section className="rounded-lg border border-imperium-line bg-imperium-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-stone-500">Funil do mês</p>
        <ul className="mt-3 space-y-3">
          {etapas.map((e) => (
            <li key={e.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-stone-200">{e.label}</span>
                <span className="text-lg font-semibold text-stone-100">{e.qtd}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-imperium-raised">
                <div className="h-full rounded-full" style={{ width: `${Math.max(e.qtd > 0 ? 2 : 0, (e.qtd / topo) * 100)}%`, backgroundColor: `rgb(${cor})` }} />
              </div>
              {e.esperada !== null && (
                <p className="mt-1 text-[11px] text-stone-500">
                  {e.de} → {e.label}:{" "}
                  <span className={corConversao(e.conv, e.esperada)}>{e.conv === null ? "—" : pct(e.conv)}</span> · esperado {pct(e.esperada)}
                </p>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[11px] text-stone-600">
          Subidos, Em pendência e Ganhos são dos leads que você subiu no mês. Em pendência inclui quem já passou dela rumo à venda.
        </p>
      </section>
    </main>
  );
}
