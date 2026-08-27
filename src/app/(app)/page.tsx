import { createClient } from "@/lib/supabase/server";
import MuralForm from "./mural-form";
import { excluirPostMural } from "./mural-actions";
import { excluirCampanha } from "./campanhas/actions";
import Card from "@/components/ui/Card";
import Laurel from "@/components/ui/Laurel";
import BarraMeta from "@/components/ui/BarraMeta";
import BarraMetaToggle from "@/components/ui/BarraMetaToggle";
import ConfrontoWidget from "@/components/ui/Confronto";
import EnquetePoll, { type EnqueteData } from "@/components/ui/EnquetePoll";
import CentralNotificacoes from "@/components/CentralNotificacoes";
import TarefasMuralWidget from "@/components/TarefasMuralWidget";
import { IconSwords, IconShield, IconCoin, IconHorn, IconBallot, IconMedal, IconScroll, IconCrown } from "@/components/ui/icons";
import { buscarConfrontoExercitos, buscarConfrontoTribos, buscarTopCredito, buscarCrestsTribos } from "@/lib/guerra";
import { buscarMetaIndividual, buscarMetaExercito, buscarProducaoPagaExercito, buscarMetaTribo, buscarProducaoPagaTribo, buscarMetaFirma, buscarProducaoPagaFirma, buscarPainelFinanceiroTribo, buscarPainelFinanceiroPessoa, type PainelFinanceiro } from "@/lib/metas";
import { buscarCampanhasAtivas, type CampanhaComProgresso } from "@/lib/campanhas";
import { FUNNEL_LABELS, type FunilEtapa } from "@/lib/funil";
import { getViewerContext } from "@/lib/preview";
import { buscarComentarios, buscarReacoes, type Comentario, type ReacaoResumo } from "@/lib/social";
import ComentariosReacoes from "@/components/ui/ComentariosReacoes";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export default async function MuralPage() {
  const supabase = await createClient();

  // Preview-aware: se o Diretor tá pré-visualizando como outra pessoa, o Mural
  // (igual Forecast/Comissão/Minha Produção) mostra os dados DELA, não os
  // dele — antes essa página ignorava a pré-visualização inteira.
  const viewer = await getViewerContext(supabase);
  if (!viewer) return null;
  const meId = viewer.effectiveId;
  const meRole = viewer.effectiveRole;

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, avatar_emoji, avatar_url, role, rank, stars_total, tribo:tribos!profiles_tribo_id_fkey(id, nome, exercito:exercitos(nome))"
    )
    .eq("id", meId)
    .single();

  const { data: muralPosts } = await supabase
    .from("mural_posts")
    .select("id, tipo, titulo, corpo, midia_url, created_at, autor_id, autor:profiles!mural_posts_autor_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(8);

  // Marca que essa pessoa abriu o Mural agora — some a bolinha vermelha da
  // lateral (ver temNovidadeMural em src/lib/pendencias.ts). Melhor-esforço:
  // se falhar, só a bolinha continua acesa, nada quebra na página.
  await supabase.from("profiles").update({ mural_visto_em: new Date().toISOString() }).eq("id", meId);

  const hoje = new Date().toISOString().slice(0, 10);
  const { data: compromissoHoje } = await supabase
    .from("compromissos")
    .select("*")
    .eq("profile_id", meId)
    .eq("data", hoje)
    .maybeSingle();

  const inicioMes = hoje.slice(0, 7) + "-01";
  const { data: vendasMes } = await supabase
    .from("vendas")
    .select("valor")
    .eq("profile_id", meId)
    .gte("data", inicioMes);
  const pagosMes = (vendasMes ?? []).reduce((s, v) => s + Number(v.valor), 0);

  const { data: quotes } = await supabase
    .from("sage_quotes")
    .select("texto, fonte")
    .eq("ativo", true);

  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  const quote =
    quotes && quotes.length > 0 ? quotes[dayOfYear % quotes.length] : null;

  const [confrontoExercitos, confrontoTribos, topCredito, crestsTribos] = await Promise.all([
    buscarConfrontoExercitos(supabase),
    buscarConfrontoTribos(supabase),
    buscarTopCredito(supabase, 5),
    buscarCrestsTribos(supabase),
  ]);

  const { metaCreditoIndividual: metaIndividual } = await buscarMetaIndividual(supabase, meId);

  const campanhasAtivas = await buscarCampanhasAtivas(supabase);

  const ehExecutivo = meRole === "sdr" || meRole === "closer";

  // Central de Notificações: Diretor vê a firma inteira (sem escopo), Líder só
  // o próprio Exército, Closer só a própria Tribo, SDR só a própria produção
  // (individual — "seu time" viraria "só você" pra quem não lidera ninguém).
  // Líder não tem tribo_id (lidera o Exército inteiro, não uma Tribo) —
  // resolve via exercitos.legado_id.
  const triboAtual = profile?.tribo as unknown as { id: string; nome: string; exercito: { nome: string } | null } | null;
  let escopoCentral:
    | { tipo: "exercito"; exercitoId: string }
    | { tipo: "tribo"; triboId: string }
    | { tipo: "individual"; profileId: string }
    | null = null;
  if (meRole === "lider") {
    const { data: exercitoLiderado } = await supabase.from("exercitos").select("id").eq("legado_id", meId).maybeSingle();
    if (exercitoLiderado) escopoCentral = { tipo: "exercito", exercitoId: exercitoLiderado.id };
  } else if (meRole === "closer" && triboAtual?.id) {
    escopoCentral = { tipo: "tribo", triboId: triboAtual.id };
  } else if (meRole === "sdr") {
    escopoCentral = { tipo: "individual", profileId: meId };
  }

  // Líder ganha a mesma barra "quanto fez × quanto devia × quanto falta" que
  // SDR/Closer já tinham no Mural, só que no nível do Exército inteiro.
  let metaExercito = 0;
  let pagoExercitoMes = 0;
  if (meRole === "lider" && escopoCentral?.tipo === "exercito") {
    [metaExercito, pagoExercitoMes] = await Promise.all([
      buscarMetaExercito(supabase, escopoCentral.exercitoId),
      buscarProducaoPagaExercito(supabase, escopoCentral.exercitoId, inicioMes),
    ]);
  }

  // Closer também vê a meta do TIME (Tribo), não só a fatia pessoal — a meta
  // da Tribo é a soma da meta dos SDRs + a meta de produção individual do
  // Closer; bater a produção pessoal não quer dizer que a Tribo bateu.
  let metaTribo = 0;
  let pagoTriboMes = 0;
  if (meRole === "closer" && escopoCentral?.tipo === "tribo") {
    [metaTribo, pagoTriboMes] = await Promise.all([
      buscarMetaTribo(supabase, escopoCentral.triboId).then((r) => r.metaCreditoTribo),
      buscarProducaoPagaTribo(supabase, escopoCentral.triboId, inicioMes),
    ]);
  }

  // Diretor ganha a mesma barra "quanto fez × quanto devia × quanto falta"
  // que SDR/Closer/Líder já tinham no Mural, só que no nível da firma inteira.
  let metaFirma = 0;
  let pagoFirmaMes = 0;
  if (meRole === "diretor" || meRole === "investidor") {
    [metaFirma, pagoFirmaMes] = await Promise.all([
      buscarMetaFirma(supabase),
      buscarProducaoPagaFirma(supabase, inicioMes),
    ]);
  }

  // Painel financeiro do mês — mesma classificação que o Forecast já usa
  // (status_manual, catálogo preenchido por closer/líder/diretor): "pra
  // pagar" = Aguardando Pagamento, "em pendência" = Resolvendo Pendência.
  // Previsão de crédito soma os 3 baldes com alguma certeza de virar
  // crédito (exclui Análise Jurídico/Esfriou, que ainda não têm destino
  // definido). Diretor vê a firma, Closer a própria Tribo, SDR a própria
  // produção — Líder fica de fora por enquanto (não foi pedido).
  const agora = new Date();
  const fimMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).toISOString().slice(0, 10);
  let painelFinanceiro: PainelFinanceiro | null = null;
  if (meRole === "diretor" || meRole === "investidor") {
    const { data: opsMes } = await supabase
      .from("weekly_operacoes")
      .select("valor, status, status_manual")
      .gte("data", inicioMes)
      .lte("data", fimMes);
    let pago = 0;
    let paraPagar = 0;
    let pendencia = 0;
    for (const o of opsMes ?? []) {
      const valor = Number(o.valor);
      if (o.status === "PAGO") pago += valor;
      else if (o.status_manual === "aguardando_pagamento") paraPagar += valor;
      else if (o.status_manual === "resolvendo_pendencia") pendencia += valor;
    }
    painelFinanceiro = { paraPagar, pendencia, previsaoCredito: pago + paraPagar + pendencia, pagoMaisParaPagar: pago + paraPagar };
  } else if (meRole === "closer" && triboAtual?.id) {
    painelFinanceiro = await buscarPainelFinanceiroTribo(supabase, triboAtual.id, inicioMes, fimMes);
  } else if (meRole === "sdr") {
    painelFinanceiro = await buscarPainelFinanceiroPessoa(supabase, meId, inicioMes, fimMes);
  }

  // Enquetes: pré-computa opções + votos dos posts do tipo 'enquete' já carregados
  const enquetePostIds = (muralPosts ?? []).filter((p) => p.tipo === "enquete").map((p) => p.id);
  const enquetesPorPost = new Map<string, EnqueteData>();
  if (enquetePostIds.length > 0) {
    const { data: enquetesRows } = await supabase
      .from("enquetes")
      .select("id, mural_post_id")
      .in("mural_post_id", enquetePostIds);
    const enqueteIds = (enquetesRows ?? []).map((e) => e.id);
    const [{ data: opcoesRows }, { data: votosRows }] = await Promise.all([
      supabase.from("enquete_opcoes").select("id, enquete_id, texto, ordem").in("enquete_id", enqueteIds).order("ordem"),
      supabase.from("enquete_votos").select("enquete_id, opcao_id, profile_id").in("enquete_id", enqueteIds),
    ]);
    for (const e of enquetesRows ?? []) {
      const opcoes = (opcoesRows ?? [])
        .filter((o) => o.enquete_id === e.id)
        .map((o) => ({
          id: o.id,
          texto: o.texto,
          votos: (votosRows ?? []).filter((v) => v.opcao_id === o.id).length,
        }));
      const totalVotos = opcoes.reduce((s, o) => s + o.votos, 0);
      const meuVoto =
        (votosRows ?? []).find((v) => v.enquete_id === e.id && v.profile_id === meId)?.opcao_id ?? null;
      enquetesPorPost.set(e.mural_post_id, { enqueteId: e.id, opcoes, totalVotos, meuVoto });
    }
  }

  // Comentários/reações — compartilhado entre posts do Mural e Campanhas
  // (ver src/lib/social.ts). Lista de pessoas pra marcar @menção não
  // inclui a própria pessoa (não faz sentido marcar a si mesmo).
  const muralPostIds = (muralPosts ?? []).map((p) => p.id);
  const campanhaIds = campanhasAtivas.map((c) => c.id);
  const [comentariosPorMural, reacoesPorMural, comentariosPorCampanha, reacoesPorCampanha, { data: todasPessoas }] =
    await Promise.all([
      buscarComentarios(supabase, "mural_post", muralPostIds),
      buscarReacoes(supabase, "mural_post", muralPostIds, meId),
      buscarComentarios(supabase, "campanha", campanhaIds),
      buscarReacoes(supabase, "campanha", campanhaIds, meId),
      supabase.from("profiles").select("id, full_name").neq("id", meId).order("full_name"),
    ]);
  const pessoasParaMarcar = (todasPessoas ?? []).map((p) => ({ id: p.id, nome: p.full_name }));

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div className="flex items-center gap-4">
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt={profile.full_name}
            className="h-20 w-20 shrink-0 rounded-full border-2 border-gold/50 object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-gold/50 bg-imperium-bg font-display text-2xl text-gold">
            {(profile?.full_name ?? "?")
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((p: string) => p[0])
              .join("")
              .toUpperCase()}
          </div>
        )}
        <p className="font-display text-2xl text-gold-bright">
          Salve, {profile?.full_name?.split(" ")[0] ?? "executivo"}.
        </p>
      </div>

      {(meRole === "diretor" || meRole === "lider" || meRole === "closer" || meRole === "sdr") && (
        <TarefasMuralWidget userId={meId} />
      )}

      {(meRole === "diretor" || meRole === "lider" || meRole === "closer" || meRole === "sdr") && (
        <CentralNotificacoes escopo={escopoCentral} />
      )}

      {meRole === "sdr" && metaIndividual > 0 && (
        <Card title="Meta do mês">
          <BarraMeta realizado={pagosMes} meta={metaIndividual} />
        </Card>
      )}

      {meRole === "closer" && (metaTribo > 0 || metaIndividual > 0) && (
        <Card title="Meta do mês">
          <BarraMetaToggle
            individual={{ realizado: pagosMes, meta: metaIndividual }}
            tribo={{ realizado: pagoTriboMes, meta: metaTribo }}
            triboNome={triboAtual?.nome ?? "sua Tribo"}
          />
        </Card>
      )}

      {meRole === "lider" && metaExercito > 0 && (
        <Card title={`Meta do mês · ${escopoCentral?.tipo === "exercito" ? "Exército" : "time"}`}>
          <BarraMeta realizado={pagoExercitoMes} meta={metaExercito} />
        </Card>
      )}

      {(meRole === "diretor" || meRole === "investidor") && metaFirma > 0 && (
        <Card title="Meta do mês · Firma">
          <BarraMeta realizado={pagoFirmaMes} meta={metaFirma} />
        </Card>
      )}

      {painelFinanceiro && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card title="Pra pagar × Em pendência">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="kicker">Pra pagar</p>
                <p className="mt-1 font-display text-xl text-gold-bright">{moeda(painelFinanceiro.paraPagar)}</p>
              </div>
              <div>
                <p className="kicker">Em pendência</p>
                <p className="mt-1 font-display text-xl text-wine-bright">{moeda(painelFinanceiro.pendencia)}</p>
              </div>
            </div>
          </Card>

          <Card title="Pago + Aguardando pagamento">
            <p className="font-display text-xl text-gold-bright">{moeda(painelFinanceiro.pagoMaisParaPagar)}</p>
            <p className="mt-1 text-[11px] text-stone-600">Pago + Em pagamento (sem contar pendência)</p>
          </Card>

          <Card title="Previsão de crédito">
            <p className="font-display text-xl text-gold-bright">{moeda(painelFinanceiro.previsaoCredito)}</p>
            <p className="mt-1 text-[11px] text-stone-600">Pago + Em pagamento + Resolvendo pendência</p>
          </Card>
        </div>
      )}

      {ehExecutivo && (
        <Card title="Compromisso de hoje">
          {compromissoHoje ? (
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-stone-500">Status</p>
                <p className="font-medium text-gold">
                  {compromissoHoje.status === "cumprido"
                    ? "Cumprido"
                    : compromissoHoje.status === "nao_cumprido"
                      ? "Não cumprido"
                      : "Em andamento"}
                </p>
              </div>
              <div>
                <p className="text-stone-500">Entrevistas</p>
                <p className="text-stone-100">
                  {compromissoHoje.entrevistas_real}/{compromissoHoje.entrevistas_comp}
                </p>
              </div>
              <div>
                <p className="text-stone-500">Assinaturas</p>
                <p className="text-stone-100">
                  {compromissoHoje.assinaturas_real}/{compromissoHoje.assinaturas_comp}
                </p>
              </div>
              <div>
                <p className="text-stone-500">Pagos</p>
                <p className="text-stone-100">
                  {compromissoHoje.pagos_real}/{compromissoHoje.pagos_comp}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-stone-500">
              Você ainda não lançou o compromisso de hoje.{" "}
              <a href="/compromisso" className="text-gold hover:underline">
                Lançar agora
              </a>
            </p>
          )}
        </Card>
      )}

      {quote && (
        <div className="flex items-center gap-3 border-y border-imperium-line py-2.5 text-center">
          <Laurel className="hidden h-3 w-8 shrink-0 -scale-x-100 text-gold/30 sm:block" />
          <p className="min-w-0 flex-1 font-serif text-sm italic text-stone-300">
            &quot;{quote.texto}&quot; <span className="not-italic text-stone-600">— {quote.fonte}</span>
          </p>
          <Laurel className="hidden h-3 w-8 shrink-0 text-gold/30 sm:block" />
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-3">
        <Card title="Guerra Civil" icon={<IconSwords className="h-4 w-4 text-wine-bright" />}>
          <ConfrontoWidget
            dados={confrontoExercitos}
            crests={{ Templários: "/crests/templarios.jpg", Maximus: "/crests/maximus.jpg" }}
          />
        </Card>

        <Card title="Guerra de Tribos" icon={<IconShield className="h-4 w-4 text-gold" />}>
          <ConfrontoWidget dados={confrontoTribos} crests={crestsTribos} />
        </Card>

        <Card title="Ranking de Crédito" icon={<IconCoin className="h-4 w-4 text-gold" />}>
          <ConfrontoWidget dados={topCredito} />
        </Card>
      </div>

      {campanhasAtivas.length > 0 && (
        <CampanhasCard
          campanhas={campanhasAtivas}
          podeGerenciar={meRole === "lider" || meRole === "diretor"}
          meId={meId}
          isDiretor={meRole === "diretor"}
          comentariosPorCampanha={comentariosPorCampanha}
          reacoesPorCampanha={reacoesPorCampanha}
          pessoas={pessoasParaMarcar}
        />
      )}

      {(meRole === "closer" || meRole === "lider" || meRole === "diretor") && (
        <details className="card-imp group">
          <summary className="kicker flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-1.5">
              <IconScroll className="h-4 w-4" /> Publicar no Mural
            </span>
            <span className="text-[10px] normal-case text-stone-500 transition group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-4">
            <MuralForm podeAviso={meRole === "lider" || meRole === "diretor"} podeEnquete={meRole === "diretor"} />
            {(meRole === "lider" || meRole === "diretor") && (
              <a
                href="/campanhas"
                className="mt-3 block rounded border border-imperium-line px-3 py-2 text-center text-xs text-gold transition hover:border-gold hover:bg-gold/10"
              >
                + Gerenciar campanhas
              </a>
            )}
          </div>
        </details>
      )}

      <Card title="Avisos e Reconhecimentos">
        {muralPosts && muralPosts.length > 0 ? (
          <ul className="space-y-4">
            {muralPosts.map((post) => {
              const autor = post.autor as unknown as { full_name: string } | null;
              return (
                <li
                  key={post.id}
                  id={`post-${post.id}`}
                  className="flex gap-4 rounded border border-imperium-line bg-imperium-bg/40 p-4 scroll-mt-20"
                >
                  <span className="mt-0.5 shrink-0 text-gold">
                    {post.tipo === "aviso" ? (
                      <IconHorn className="h-6 w-6" />
                    ) : post.tipo === "enquete" ? (
                      <IconBallot className="h-6 w-6" />
                    ) : (
                      <IconMedal className="h-6 w-6" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display text-base text-gold-bright">{post.titulo}</p>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-stone-600">
                          {post.tipo === "aviso" ? "Aviso" : post.tipo === "enquete" ? "Enquete" : "Reconhecimento"}
                        </span>
                        {(post.autor_id === meId || meRole === "diretor") && (
                          <form action={excluirPostMural}>
                            <input type="hidden" name="id" value={post.id} />
                            <button type="submit" className="text-[10px] text-stone-600 hover:text-wine-bright">
                              Excluir
                            </button>
                          </form>
                        )}
                      </span>
                    </div>
                    {post.corpo && <p className="mt-1 text-sm text-stone-300">{post.corpo}</p>}
                    {post.midia_url &&
                      (/\.(mp4|webm|mov|m4v)$/i.test(post.midia_url) ? (
                        <video
                          src={post.midia_url}
                          controls
                          className="mt-3 max-h-64 rounded border border-imperium-line"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.midia_url}
                          alt=""
                          className="mt-3 max-h-64 rounded border border-imperium-line object-cover"
                        />
                      ))}
                    {post.tipo === "enquete" && enquetesPorPost.get(post.id) && (
                      <EnquetePoll dados={enquetesPorPost.get(post.id)!} />
                    )}
                    <p className="mt-2 text-xs text-stone-600">
                      {autor?.full_name ?? "Gestão"} ·{" "}
                      {new Date(post.created_at).toLocaleDateString("pt-BR")}
                    </p>
                    <ComentariosReacoes
                      alvoTipo="mural_post"
                      alvoId={post.id}
                      meId={meId}
                      isDiretor={meRole === "diretor"}
                      comentarios={comentariosPorMural.get(post.id) ?? []}
                      reacoes={reacoesPorMural.get(post.id) ?? { porEmoji: [], minhaReacao: null }}
                      pessoas={pessoasParaMarcar}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">Nenhum aviso publicado ainda.</p>
        )}
      </Card>
    </main>
  );
}

function ParticipanteBarra({
  p,
  i,
  c,
  fmt,
  max,
}: {
  p: CampanhaComProgresso["participantes"][number];
  i: number;
  c: CampanhaComProgresso;
  fmt: (v: number) => string;
  max: number;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={`flex items-center gap-1 ${i === 0 && c.alvo !== "geral" ? "text-gold-bright" : "text-stone-300"}`}>
          {i === 0 && c.alvo !== "geral" && <IconCrown className="h-3.5 w-3.5" />}
          {p.label}
        </span>
        <span className="text-stone-400">
          {fmt(p.valor)}
          {c.metaValor ? ` / ${fmt(c.metaValor)}` : ""}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-imperium-line">
        <div
          className={`h-full rounded-full ${i === 0 ? "bg-gradient-to-r from-gold to-gold-bright" : "bg-wine"}`}
          style={{ width: `${Math.min(100, (p.valor / max) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function CampanhasCard({
  campanhas,
  podeGerenciar,
  meId,
  isDiretor,
  comentariosPorCampanha,
  reacoesPorCampanha,
  pessoas,
}: {
  campanhas: CampanhaComProgresso[];
  podeGerenciar: boolean;
  meId: string;
  isDiretor: boolean;
  comentariosPorCampanha: Map<string, Comentario[]>;
  reacoesPorCampanha: Map<string, ReacaoResumo>;
  pessoas: { id: string; nome: string }[];
}) {
  return (
    <Card title="Campanhas do mês">
      <div className="grid gap-4 sm:grid-cols-2">
        {campanhas.map((c) => {
          const metricaLabel = c.metrica === "credito" ? "R$" : FUNNEL_LABELS[c.metrica as FunilEtapa] ?? c.metrica;
          const fmt = (v: number) =>
            c.metrica === "credito"
              ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
              : `${v} ${metricaLabel}`;
          const max = Math.max(...c.participantes.map((p) => p.valor), c.metaValor ?? 0, 1);

          return (
            <div key={c.id} id={`campanha-${c.id}`} className="scroll-mt-20 overflow-hidden rounded-lg border border-gold/30">
              {c.imagemUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.imagemUrl}
                  alt={c.titulo}
                  className="aspect-[4/3] w-full object-cover"
                  style={{ objectPosition: c.imagemPosicao === "top" ? "center top" : c.imagemPosicao === "bottom" ? "center bottom" : "center" }}
                />
              )}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-display text-base text-gold-bright">{c.titulo}</p>
                  {podeGerenciar && (
                    <form action={excluirCampanha}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="shrink-0 text-[10px] text-stone-600 hover:text-wine-bright">
                        Excluir
                      </button>
                    </form>
                  )}
                </div>
                {c.descricao && <p className="mt-1 text-xs text-stone-400">{c.descricao}</p>}
                {c.requisitosMinimos && (
                  <p className="mt-1.5 text-[11px] text-stone-500">
                    <span className="text-stone-600">Requisitos mínimos: </span>
                    {c.requisitosMinimos}
                  </p>
                )}
                {c.recompensa && (
                  <p className="mt-1 text-[11px] text-gold">
                    <span className="text-stone-600">Recompensa: </span>
                    {c.recompensa}
                  </p>
                )}
                <p className="mt-1 text-[10px] uppercase tracking-wide text-stone-600">
                  até {new Date(c.dataFim + "T00:00:00").toLocaleDateString("pt-BR")}
                </p>

                {/* Ranking já vem ordenado (mais perto da meta primeiro) —
                    mostra só o top 3 de cara, resto fica atrás de "Ver
                    todos" (pedido do Diretor, 2026-08-24 — evita expor
                    quem tá bem atrás pra quem só quer ver os líderes). */}
                <div className="mt-3 space-y-2">
                  {c.participantes.slice(0, 3).map((p, i) => (
                    <ParticipanteBarra key={p.refId} p={p} i={i} c={c} fmt={fmt} max={max} />
                  ))}
                </div>
                {c.participantes.length > 3 && (
                  <details className="group/rank mt-2">
                    <summary className="cursor-pointer list-none text-[10px] uppercase tracking-wide text-stone-500 hover:text-gold [&::-webkit-details-marker]:hidden">
                      Ver todos ({c.participantes.length}) <span className="transition group-open/rank:rotate-180">▾</span>
                    </summary>
                    <div className="mt-2 space-y-2">
                      {c.participantes.slice(3).map((p, i) => (
                        <ParticipanteBarra key={p.refId} p={p} i={i + 3} c={c} fmt={fmt} max={max} />
                      ))}
                    </div>
                  </details>
                )}

                <ComentariosReacoes
                  alvoTipo="campanha"
                  alvoId={c.id}
                  meId={meId}
                  isDiretor={isDiretor}
                  comentarios={comentariosPorCampanha.get(c.id) ?? []}
                  reacoes={reacoesPorCampanha.get(c.id) ?? { porEmoji: [], minhaReacao: null }}
                  pessoas={pessoas}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
