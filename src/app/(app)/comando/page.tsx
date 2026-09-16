import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { FUNNEL_STAGES, FUNNEL_LABELS } from "@/lib/funil";
import {
  buscarComprometimentoHoje,
  buscarPagosMes,
  buscarFunilColetivo,
  STATUS_COR,
  STATUS_LABEL,
} from "@/lib/time";
import MembroCard from "@/components/MembroCard";
import Card from "@/components/ui/Card";
import { calcularFunilMeta, mapaMetaCreditoPorTribo } from "@/lib/metas";
import { logErroSupabase } from "@/lib/log-erro-supabase";
import { Table, Th, Td, Tr } from "@/components/ui/Table";
import { hojeBR, paraDataUTC } from "@/lib/data-br";
import { IconAlert } from "@/components/ui/icons";
import { Badge } from "@/components/ui/Badge";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

// Mesma lente de "Meu Exército" (comparativo de times em risco, quem
// precisa de atenção, PDIs pendentes, funil coletivo), só que pra firma
// inteira — pedido do Diretor, 2026-09-15: "libere uma visão dessas pra
// mim, só que sobre todo mundo pois sou o diretor". "Minha Produção" já
// tem equivalente pro Diretor (Weekly de Receita, que já cobre todos os
// Exércitos) — essa página é a peça que faltava.
export default async function ComandoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: meuPerfil } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (meuPerfil?.role !== "diretor") redirect("/");

  const { data: exercitos } = await supabase
    .from("exercitos")
    .select("id, nome, legado:profiles!exercitos_legado_id_fkey(id, full_name)")
    .order("nome");

  const { data: tribos } = await supabase
    .from("tribos")
    .select("id, nome, exercito_id, closer:profiles!tribos_closer_id_fkey(id, full_name)")
    .order("nome");

  const triboIds = (tribos ?? []).map((t) => t.id);
  // Só role="sdr" — mesmo motivo do painel de Exército: o Closer da Tribo
  // também tem tribo_id apontando pra ela mesma, então sem esse filtro ele
  // apareceria duplicado (uma vez como Closer, outra como "SDR").
  const { data: sdrs, error: sdrsError } = triboIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, tribo_id")
        .in("tribo_id", triboIds)
        .eq("role", "sdr")
        .eq("ativo", true)
    : { data: [], error: null };
  logErroSupabase("ComandoPage: profiles sdrs", sdrsError);

  const closerIds = (tribos ?? [])
    .map((t) => (t.closer as unknown as { id: string; full_name: string } | null)?.id)
    .filter((id): id is string => !!id);
  const liderIds = (exercitos ?? [])
    .map((e) => (e.legado as unknown as { id: string; full_name: string } | null)?.id)
    .filter((id): id is string => !!id);

  // "todosIds" = closer+SDR, mesmo recorte usado pro comparativo de
  // produção por Tribo/Exército (líder não tem Tribo própria pra entrar
  // nessa conta). Pra "quem precisa de atenção"/PDI, o Diretor acompanha
  // os líderes também — escopo maior só ali.
  const todosIds = [...closerIds, ...(sdrs ?? []).map((s) => s.id)];
  const idsComLideres = [...todosIds, ...liderIds];

  const [compromissoMap, pagosMap, funilColetivo] = await Promise.all([
    buscarComprometimentoHoje(supabase, idsComLideres),
    buscarPagosMes(supabase, idsComLideres),
    buscarFunilColetivo(supabase, todosIds),
  ]);

  // ---------- Meta esperada por Tribo/Exército/Firma (pra pace/risco) ----------
  const agora = paraDataUTC(hojeBR());
  const { data: metaMes } = await supabase
    .from("metas_mensais")
    .select("id, meta_credito_total, meta_ticket_medio")
    .eq("ano", agora.getUTCFullYear())
    .eq("mes", agora.getUTCMonth() + 1)
    .maybeSingle();
  const mapaMetaTribo = await mapaMetaCreditoPorTribo(supabase, metaMes?.meta_credito_total ?? 0);
  const metaCreditoFirma = Array.from(mapaMetaTribo.values()).reduce((s, v) => s + v, 0);

  const { data: conversoes } = metaMes
    ? await supabase.from("metas_conversao").select("etapa_de, etapa_para, taxa_esperada").eq("meta_mensal_id", metaMes.id)
    : { data: [] };
  const taxasFirma = new Map((conversoes ?? []).map((c) => [`${c.etapa_de}_${c.etapa_para}`, c.taxa_esperada]));
  const metaFunilFirma = calcularFunilMeta(metaCreditoFirma, metaMes?.meta_ticket_medio ?? 0, taxasFirma);

  const diaDoMes = agora.getUTCDate();
  const diasNoMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 0)).getUTCDate();
  const paceEsperado = diasNoMes > 0 ? diaDoMes / diasNoMes : 1;

  // Pago por Tribo (individual, pra comparação lado a lado)
  const pagoPorTribo = new Map<string, number>();
  for (const t of tribos ?? []) {
    const closer = t.closer as unknown as { id: string } | null;
    const membrosTribo = [
      ...(closer ? [closer.id] : []),
      ...(sdrs ?? []).filter((s) => s.tribo_id === t.id).map((s) => s.id),
    ];
    pagoPorTribo.set(t.id, membrosTribo.reduce((s, id) => s + (pagosMap.get(id) ?? 0), 0));
  }

  // Agrega Tribo -> Exército, pra comparativo no topo da página.
  const pagoPorExercito = new Map<string, number>();
  const metaPorExercito = new Map<string, number>();
  for (const t of tribos ?? []) {
    pagoPorExercito.set(t.exercito_id, (pagoPorExercito.get(t.exercito_id) ?? 0) + (pagoPorTribo.get(t.id) ?? 0));
    metaPorExercito.set(t.exercito_id, (metaPorExercito.get(t.exercito_id) ?? 0) + (mapaMetaTribo.get(t.id) ?? 0));
  }

  // "Quem precisa de atenção" — menor produção no mês, firma inteira
  const nomePorId = new Map<string, string>();
  for (const t of tribos ?? []) {
    const closer = t.closer as unknown as { id: string; full_name: string } | null;
    if (closer) nomePorId.set(closer.id, closer.full_name);
  }
  for (const s of sdrs ?? []) nomePorId.set(s.id, s.full_name);
  for (const e of exercitos ?? []) {
    const lider = e.legado as unknown as { id: string; full_name: string } | null;
    if (lider) nomePorId.set(lider.id, lider.full_name);
  }

  const atencao = idsComLideres
    .map((id) => ({ id, nome: nomePorId.get(id) ?? "—", pago: pagosMap.get(id) ?? 0 }))
    .filter((p) => p.nome !== "—")
    .sort((a, b) => a.pago - b.pago)
    .slice(0, 6);

  // PDI pendentes — firma inteira, líder incluso (Diretor também acompanha
  // a revisão dos próprios líderes de Exército).
  const { data: pdiRows } = idsComLideres.length
    ? await supabase
        .from("pdi_registros")
        .select("profile_id, observacao, proxima_revisao, created_at, membro:profiles!pdi_registros_profile_id_fkey(full_name)")
        .in("profile_id", idsComLideres)
        .order("created_at", { ascending: false })
    : { data: [] };

  const hoje = hojeBR();
  type PdiRow = NonNullable<typeof pdiRows>[number];
  const ultimoPdiPorMembro = new Map<string, PdiRow>();
  for (const row of pdiRows ?? []) {
    if (!ultimoPdiPorMembro.has(row.profile_id)) ultimoPdiPorMembro.set(row.profile_id, row);
  }
  const pdiPendentes = Array.from(ultimoPdiPorMembro.values()).filter(
    (r) => r.proxima_revisao && r.proxima_revisao <= hoje
  );

  // Conversão entre etapas — mesma leitura "onde está o gargalo" que
  // Weekly de Receita/Minha Produção já mostram pro líder/investidor, só
  // que direto aqui no Comando Geral (pedido do Diretor, 2026-09-16: "quero
  // que coloque aqui... igual tem [o painel de] minha produção... só que
  // adaptado a minha realidade onde posso ver tudo"). Mesmos 4 pares —
  // Tentativas→Alô fica de fora de propósito, igual no painel Weekly.
  const CONVERSOES: { label: string; de: (typeof FUNNEL_STAGES)[number]; para: (typeof FUNNEL_STAGES)[number] }[] = [
    { label: "Alô → Conexão", de: "alos", para: "conexoes" },
    { label: "Conexão → Entrevista", de: "conexoes", para: "entrevistas" },
    { label: "Entrevista → Assinatura", de: "entrevistas", para: "assinaturas" },
    { label: "Assinatura → Pago", de: "assinaturas", para: "pagos" },
  ];
  const conversaoFirma = CONVERSOES.map((c) => {
    const denom = funilColetivo[c.de].realizado;
    const numer = funilColetivo[c.para].realizado;
    const realizada = denom > 0 ? numer / denom : null;
    const meta = taxasFirma.get(`${c.de}_${c.para}`) ?? null;
    const dif = realizada !== null && meta !== null ? realizada - meta : null;
    return { ...c, realizada, meta, dif };
  });

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Comando Geral</h1>
        <p className="kicker mt-1">Mesma leitura do painel de Exército — só que sobre a firma inteira</p>
      </div>

      {exercitos && exercitos.length > 0 && (
        <Card title="Comparativo dos Exércitos">
          <div className="grid gap-3 sm:grid-cols-2">
            {exercitos.map((e) => {
              const lider = e.legado as unknown as { id: string; full_name: string } | null;
              const pago = pagoPorExercito.get(e.id) ?? 0;
              const meta = metaPorExercito.get(e.id) ?? 0;
              const esperado = meta * paceEsperado;
              const emRisco = meta > 0 && pago < esperado * 0.8;
              const pct = meta > 0 ? (pago / meta) * 100 : null;
              return (
                <div
                  key={e.id}
                  className={`rounded border p-3 ${emRisco ? "border-wine/50 bg-wine/10" : "border-imperium-line"}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-stone-100">{e.nome}</p>
                      <p className="text-xs text-stone-500">Legado: {lider?.full_name ?? "—"}</p>
                    </div>
                    {emRisco && (
                      <Badge tone="wine" variant="tag">
                        <IconAlert className="h-3 w-3" /> Em risco
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-gold">{moeda(pago)}</p>
                  {pct !== null && <p className="text-xs text-stone-500">{pct.toFixed(0)}% da meta do mês</p>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {atencao.length > 0 && (
        <Card title="Quem precisa de atenção" right={<span className="text-xs text-stone-500">menor produção do mês</span>}>
          <ol className="space-y-1.5">
            {atencao.map((p, i) => (
              <li key={p.id} className="flex justify-between text-sm">
                <span className="text-stone-300">
                  {i + 1}. {p.nome}
                </span>
                <span className="text-wine-bright">{moeda(p.pago)}</span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {pdiPendentes.length > 0 && (
        <Card title="Revisões de PDI pendentes">
          <ul className="space-y-2">
            {pdiPendentes.map((r) => {
              const membro = r.membro as unknown as { full_name: string } | null;
              return (
                <li key={r.profile_id} className="border-b border-imperium-line pb-2 text-sm last:border-0">
                  <div className="flex justify-between">
                    <span className="text-stone-100">{membro?.full_name ?? "—"}</span>
                    <span className="text-gold">
                      revisão prevista {new Date(r.proxima_revisao + "T00:00:00").toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">{r.observacao}</p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Volume por etapa — firma inteira">
          <Table>
            <thead>
              <tr>
                <Th>Etapa</Th>
                <Th align="right">Realizado</Th>
                <Th align="right">Meta</Th>
              </tr>
            </thead>
            <tbody>
              {FUNNEL_STAGES.map((etapa) => (
                <Tr key={etapa}>
                  <Td className="text-stone-300">{FUNNEL_LABELS[etapa]}</Td>
                  <Td align="right" className="text-stone-100">
                    {funilColetivo[etapa].realizado}
                  </Td>
                  <Td align="right" className="text-stone-500">
                    {metaFunilFirma[etapa] !== null ? Math.round(metaFunilFirma[etapa]!) : "—"}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card title="Conversão entre etapas — onde está o gargalo">
          <Table>
            <thead>
              <tr>
                <Th>Etapa</Th>
                <Th align="right">Realizada</Th>
                <Th align="right">Meta</Th>
                <Th align="right">Dif.</Th>
              </tr>
            </thead>
            <tbody>
              {conversaoFirma.map((c) => (
                <Tr key={c.label}>
                  <Td className="text-stone-300">{c.label}</Td>
                  <Td align="right" className="text-stone-100">
                    {c.realizada !== null ? `${(c.realizada * 100).toFixed(0)}%` : "—"}
                  </Td>
                  <Td align="right" className="text-stone-500">
                    {c.meta !== null ? `${(c.meta * 100).toFixed(0)}%` : "—"}
                  </Td>
                  <Td align="right">
                    {c.dif !== null ? (
                      <span className={Math.abs(c.dif) < 0.03 ? "text-stone-500" : c.dif > 0 ? "text-success-bright" : "text-wine-bright"}>
                        {c.dif > 0 ? "+" : ""}
                        {(c.dif * 100).toFixed(0)}%
                      </span>
                    ) : (
                      "—"
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      {/* Detalhe por Exército — colapsado por padrão, senão a página fica
          gigante com todo mundo da firma aberto de uma vez. */}
      {(exercitos ?? []).map((e) => {
        const tribosDoExercito = (tribos ?? []).filter((t) => t.exercito_id === e.id);
        if (tribosDoExercito.length === 0) return null;
        return (
          <details key={e.id} className="card-imp group">
            <summary className="kicker flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
              <span>{e.nome} — detalhe por Tribo</span>
              <span className="text-[10px] normal-case text-stone-500 transition group-open:rotate-180">▾</span>
            </summary>
            <div className="mt-4 space-y-4">
              {tribosDoExercito.map((tribo) => {
                const closer = tribo.closer as unknown as { id: string; full_name: string } | null;
                const sdrsDaTribo = (sdrs ?? []).filter((s) => s.tribo_id === tribo.id && s.id !== closer?.id);
                return (
                  <div key={tribo.id}>
                    <p className="mb-2 text-xs uppercase tracking-wide text-stone-500">{tribo.nome}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {closer && (
                        <MembroCard
                          id={closer.id}
                          nome={closer.full_name}
                          cargo="Closer"
                          compromissoStatus={STATUS_LABEL[compromissoMap.get(closer.id)?.status ?? "não lançado"]}
                          compromissoCor={STATUS_COR[compromissoMap.get(closer.id)?.status ?? "não lançado"]}
                          pagosMes={pagosMap.get(closer.id) ?? 0}
                          falta={compromissoMap.get(closer.id)?.falta ?? false}
                        />
                      )}
                      {sdrsDaTribo.map((sdr) => (
                        <MembroCard
                          key={sdr.id}
                          id={sdr.id}
                          nome={sdr.full_name}
                          cargo="SDR"
                          compromissoStatus={STATUS_LABEL[compromissoMap.get(sdr.id)?.status ?? "não lançado"]}
                          compromissoCor={STATUS_COR[compromissoMap.get(sdr.id)?.status ?? "não lançado"]}
                          pagosMes={pagosMap.get(sdr.id) ?? 0}
                          falta={compromissoMap.get(sdr.id)?.falta ?? false}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
    </main>
  );
}
