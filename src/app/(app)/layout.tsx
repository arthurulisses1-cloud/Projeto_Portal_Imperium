import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import AppNav, { type NavEntry } from "@/components/ui/AppNav";
import NoticiasCompactas from "@/components/ui/NoticiasCompactas";
import CampanhasCompactas from "@/components/ui/CampanhasCompactas";
import SidebarRight from "@/components/ui/SidebarRight";
import SidebarRightGate from "@/components/ui/SidebarRightGate";
import UserMenu from "@/components/ui/UserMenu";
import MencoesBell from "@/components/ui/MencoesBell";
import MinervaWidget from "@/components/minerva/MinervaWidget";
import { limparPreview } from "./preview-actions";
import { IconLaurel, IconEye } from "@/components/ui/icons";
import { buscarPendencias, temNovidadeMural, temNovidadeLeads } from "@/lib/pendencias";
import { SDR_FORECAST_LIBERADO } from "@/lib/acessos-especiais";
import { buscarUltimaSyncOk } from "@/lib/sync/status";
import { buscarMencoesPendentes } from "@/lib/social";
import { logErroSupabase } from "@/lib/log-erro-supabase";
import { buscarPermissoesAnalista, type AreaAnalista } from "@/lib/permissoes-analista";

export const dynamic = "force-dynamic";

// `roles` por item de grupo é opcional — quando omitido, o item herda a
// visibilidade do grupo inteiro (comportamento de sempre). Usado pra caber
// papéis diferentes dentro do MESMO grupo (ex: "Pessoas" mistura item de
// todo mundo com item só do Diretor), sem duplicar o grupo uma vez por papel.
// `area` é opcional e só importa pro papel Analista — quando presente,
// pedido do Diretor 2026-09-21 ("quero poder setar o que cada um pode
// ver"): a visibilidade pra um Analista específico usa a permissão
// customizada dessa área (ver src/lib/permissoes-analista.ts) em vez do
// `roles` estático. Item sem `area` (páginas de SDR/Closer/Líder, que não
// têm esse sistema) continua só no `roles` de sempre.
type NavConfigEntry =
  | { type: "link"; href: string; label: string; roles: string[]; area?: AreaAnalista }
  | {
      type: "group";
      label: string;
      roles: string[];
      area?: AreaAnalista;
      items: { href: string; label: string; roles?: string[] }[];
    };

// Central de Notificações agora vive dentro do Mural (não é mais aba própria);
// Visão Geral da Firma saiu (a Weekly de Receita cobre o mesmo terreno);
// Campanhas virou um atalho na lateral do Mural em vez de aba fixa.
const NAV_ITEMS: NavConfigEntry[] = [
  { type: "link", href: "/", label: "Mural", roles: ["sdr", "closer", "lider", "diretor", "investidor", "analista"], area: "mural" },
  { type: "link", href: "/compromisso", label: "Compromisso", roles: ["sdr", "closer"] },
  { type: "link", href: "/tarefas", label: "Tarefas", roles: ["sdr", "closer", "lider", "diretor", "analista"], area: "tarefas" },
  { type: "link", href: "/leads", label: "Meus Leads", roles: ["closer", "lider", "diretor", "analista"], area: "leads" },
  { type: "link", href: "/producao", label: "Minha Produção", roles: ["sdr", "closer"] },
  { type: "link", href: "/tribo", label: "Minha Tribo", roles: ["closer"] },
  { type: "link", href: "/exercito", label: "Meu Exército", roles: ["lider"] },
  { type: "link", href: "/minha-producao", label: "Minha Produção", roles: ["lider"] },
  { type: "link", href: "/carreira", label: "Plano de Carreira", roles: ["sdr", "closer", "lider"] },
  { type: "link", href: "/comissao", label: "Comissão do Mês", roles: ["sdr", "closer", "lider"] },
  {
    type: "group",
    label: "Legado",
    roles: ["sdr", "closer", "lider", "diretor", "investidor", "analista"],
    area: "legado",
    items: [
      { href: "/ranking", label: "Ranking" },
      { href: "/recordes", label: "Recordes" },
    ],
  },
  { type: "link", href: "/forecast", label: "Forecast", roles: ["closer", "lider", "diretor", "investidor", "analista"], area: "forecast" },
  { type: "link", href: "/parceiros", label: "Parceiros", roles: ["closer", "lider"] },
  { type: "link", href: "/trilha", label: "Trilha de Formação", roles: ["sdr", "closer", "lider"] },
  {
    type: "group",
    label: "Imperium Academy",
    roles: ["sdr", "closer", "lider", "diretor", "analista"],
    area: "academy",
    items: [
      { href: "/academy", label: "Academy Geral" },
      { href: "/academy/instrutor", label: "Aulas para Ministrar" },
      { href: "/academy/trilha", label: "Minha Trilha" },
    ],
  },
  // Aba mãe "Dados" — pedido do Diretor, 2026-09-18: Pace/Compromissos/
  // Weekly/Visão Diária/Metas Mensais eram links soltos, viraram um grupo
  // só (mesmo espírito da reorganização de Pessoas/Resultados de
  // 2026-09-15) — cada item mantém exatamente o mesmo recorte de papel
  // que já tinha como link solto.
  {
    type: "group",
    label: "Dados",
    roles: ["sdr", "closer", "lider", "diretor", "investidor", "analista"],
    area: "dados",
    items: [
      { href: "/pace", label: "Pace", roles: ["sdr", "closer", "lider", "diretor", "analista"] },
      { href: "/compromissos", label: "Compromissos", roles: ["diretor", "analista"] },
      { href: "/weekly", label: "Weekly de Receita", roles: ["lider", "diretor", "investidor", "analista"] },
      { href: "/visao-diaria", label: "Visão Diária", roles: ["lider", "diretor", "analista"] },
      { href: "/metas", label: "Metas Mensais", roles: ["diretor", "analista"] },
    ],
  },
  {
    type: "group",
    label: "Financeiro",
    roles: ["diretor", "investidor"],
    area: "financeiro",
    items: [
      { href: "/comissao", label: "Comissão do Mês" },
      { href: "/parceiros", label: "Parceiros" },
      { href: "/dre", label: "DRE" },
      { href: "/fechamento", label: "Fechamento de Mês" },
    ],
  },
  {
    type: "group",
    label: "Pessoas",
    roles: ["sdr", "closer", "lider", "diretor", "investidor"],
    area: "pessoas",
    items: [
      { href: "/estrelas", label: "Estrelas", roles: ["sdr", "closer"] },
      { href: "/estrelas/time", label: "Estrelas do Time", roles: ["lider", "diretor"] },
      { href: "/marcos", label: "Corrida dos Marcos", roles: ["sdr", "closer", "lider", "diretor", "investidor"] },
      { href: "/legado", label: "Meu Legado", roles: ["diretor"] },
      { href: "/gestao", label: "Gestão de Pessoas", roles: ["diretor"] },
    ],
  },
  {
    type: "group",
    label: "Validações",
    roles: ["diretor"],
    area: "validacoes",
    items: [
      { href: "/auditoria", label: "Auditoria" },
      { href: "/validacao", label: "Fila de Validação" },
      { href: "/aprovacoes", label: "Aprovações de Carreira" },
      { href: "/contestacoes", label: "Fila de Contestação" },
    ],
  },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile, error: profileError } = user
    ? await supabase
        .from("profiles")
        .select("full_name, role, rank, avatar_url, tribo_id")
        .eq("id", user.id)
        .single()
    : { data: null, error: null };
  logErroSupabase(`AppLayout: profiles (id=${user?.id})`, profileError);

  const cookieStore = await cookies();

  // Pré-visualização (Diretor virar outra pessoa/papel pra revisar telas)
  // foi desativada a pedido (2026-08-22) — "só quero usar minha conta como
  // Diretor". Continua lendo preview_profile_id só de forma defensiva, pra
  // não deixar ninguém preso numa pré-visualização antiga sem UI pra sair
  // (o botão "Sair da pré-visualização" abaixo ainda cobre esse caso) — mas
  // não existe mais nenhum jeito de ATIVAR isso pela UI, e o cookie
  // "view_role" nem é mais lido, então "ver como <papel genérico>" some de
  // vez, mesmo que um cookie antigo ainda exista no navegador.
  const previewProfileId = profile?.role === "diretor" ? cookieStore.get("preview_profile_id")?.value ?? null : null;
  let previewPessoa: { id: string; nome: string; role: string; tribo_id: string | null } | null = null;
  if (profile?.role === "diretor" && previewProfileId) {
    const { data: encontrada } = await supabase
      .from("profiles")
      .select("id, full_name, role, tribo_id")
      .eq("id", previewProfileId)
      .maybeSingle();
    if (encontrada) previewPessoa = { id: encontrada.id, nome: encontrada.full_name, role: encontrada.role, tribo_id: encontrada.tribo_id };
  }

  const papelVisualizado = previewPessoa?.role ?? profile?.role;

  const papelAtual = papelVisualizado ?? profile?.role;

  // Permissão customizada por Analista (pedido do Diretor, 2026-09-21) —
  // busca a conta REAL logada (não papelAtual/previewPessoa, que hoje nem
  // tem jeito de ativar pela UI mesmo — ver comentário acima). Item com
  // `area` definida usa essa permissão pra decidir visibilidade quando
  // quem tá olhando é Analista, em vez do `roles` estático.
  const permissoesAnalista =
    user && profile?.role === "analista" ? await buscarPermissoesAnalista(supabase, user.id) : null;
  function visivelParaMim(rolesDoItem: string[], area?: AreaAnalista): boolean {
    if (!profile) return true;
    if (permissoesAnalista && area) return permissoesAnalista[area].ver;
    return rolesDoItem.includes(papelAtual ?? profile.role);
  }

  const itensVisiveis: NavEntry[] = NAV_ITEMS.filter((item) => visivelParaMim(item.roles, item.area)).map((entry) => {
    const { roles, area, ...rest } = entry;
    void roles;
    void area;
    // Item de grupo com `roles` próprio (ex: "Pessoas" mistura item de
    // todo mundo com item só do Diretor) filtra de novo aqui dentro —
    // sem `roles`, o item herda a visibilidade do grupo (comportamento
    // de sempre, ver Academy/Financeiro/Validações acima). Itens dentro
    // de um grupo não têm `area` própria — a permissão do Analista é por
    // aba mãe inteira, não por item individual dela.
    if (rest.type === "group") {
      // Analista com a área liberada vê TODOS os itens do grupo (mesmo os
      // que, por `roles`, seriam só de outro papel — ex: "Gestão de
      // Pessoas" é roles:["diretor"], mas se a área "pessoas" foi liberada
      // pro Analista, ele precisa ver o item, não só o rótulo do grupo
      // vazio por dentro). Sem a área liberada, cai no `roles` de sempre.
      const analistaComAreaLiberada = permissoesAnalista && area ? permissoesAnalista[area].ver : false;
      return {
        ...rest,
        items: rest.items
          .filter((i) => analistaComAreaLiberada || !i.roles || visivelParaMim(i.roles))
          .map(({ href, label }) => ({ href, label })),
      };
    }
    return rest;
  });

  // Exceção pontual (ver src/lib/acessos-especiais.ts): Forecast liberado
  // pra 2 SDRs específicos, sem virar um papel novo — não usa
  // previewPessoa de propósito, é sempre sobre a conta real logada.
  if (user && profile?.role === "sdr" && SDR_FORECAST_LIBERADO.has(user.id)) {
    const posProducao = itensVisiveis.findIndex((i) => i.type === "link" && i.href === "/producao");
    itensVisiveis.splice(posProducao + 1, 0, { type: "link", href: "/forecast", label: "Forecast" });
  }

  const ehExecutivo = papelVisualizado === "sdr" || papelVisualizado === "closer" || papelVisualizado === "lider";
  // Diretor também ganha a lateral (2026-08-22, a pedido) — o conteúdo já
  // degrada bem pro papel dele (Cargo/Comissão do mês reaproveitam o que
  // já existia; Estrelas/Plano de Carreira/Minha Tribo simplesmente não
  // renderizam, porque já checavam role sdr/closer/lider antes disso).
  const mostraSidebarPapel = ehExecutivo || papelVisualizado === "diretor";
  // Antes a SidebarRight sumia no Mural pra SDR/Closer (reduzir densidade),
  // mas na prática isso lia como bug — quem loga pela primeira vez cai no
  // Mural e via a lateral "sumida", só aparecendo ao navegar pra outra
  // aba (2026-08-22, a pedido, depois de confirmado como confuso). Agora
  // aparece sempre, em toda rota, pra todo mundo.
  const mostraSidebarRight = true;

  const pendencias =
    user && profile
      ? await buscarPendencias(
          supabase,
          previewPessoa?.id ?? user.id,
          previewPessoa?.role ?? profile.role,
          previewPessoa?.tribo_id ?? profile.tribo_id
        )
      : {};

  // post_mencoes é da migration 0036 — se ainda não rodou nesse banco, o
  // select simplesmente retorna erro (Supabase não lança), buscarMencoesPendentes
  // já trata como lista vazia em vez de quebrar o layout inteiro.
  const mencoesPendentes = user ? await buscarMencoesPendentes(supabase, previewPessoa?.id ?? user.id) : [];

  const destaques: Record<string, boolean> = {};
  if (user && profile) {
    const temNovidade = await temNovidadeMural(supabase, previewPessoa?.id ?? user.id);
    if (temNovidade) destaques["/"] = true;

    if (["closer", "lider", "diretor"].includes(papelVisualizado ?? profile.role)) {
      const temNovoLead = await temNovidadeLeads(supabase, previewPessoa?.id ?? user.id);
      if (temNovoLead) destaques["/leads"] = true;
    }
  }

  return (
    <div className="flex min-h-screen">
      {user && (
        <aside className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-imperium-line bg-imperium-surface">
          <div className="watermark-spqr flex items-center gap-2 border-b border-imperium-line p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/crests/senatus.webp"
              alt="Senatus"
              className="h-9 w-9 shrink-0 rounded-full border border-gold/40 object-cover"
            />
            <div className="min-w-0">
              <p className="truncate font-display text-xs tracking-wide text-gold-bright">
                SENATUS
              </p>
              <p className="truncate text-[9px] uppercase tracking-widest text-stone-500">
                Matri Bank · Imperium
              </p>
            </div>
          </div>

          <div className="overflow-y-auto p-3">
            <AppNav items={itensVisiveis} pendencias={pendencias} destaques={destaques} />
          </div>

          <NoticiasCompactas />
          <CampanhasCompactas />
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {previewPessoa && (
          <div className="flex items-center justify-between gap-3 border-b border-gold/40 bg-gold/10 px-6 py-2 text-xs text-gold-bright">
            <span className="flex items-center gap-1.5">
              <IconEye className="h-3.5 w-3.5 shrink-0" /> Pré-visualizando como <b>{previewPessoa.nome}</b> — os dados nas telas pessoais são dela(e), não seus.
            </span>
            <form action={limparPreview}>
              <button type="submit" className="rounded border border-gold/40 px-2 py-1 text-[10px] uppercase hover:bg-gold/20">
                Sair da pré-visualização
              </button>
            </form>
          </div>
        )}
        <header className="flex items-center justify-end gap-3 border-b border-imperium-line bg-imperium-surface px-6 py-3">
          {user && <MencoesBell mencoes={mencoesPendentes} />}
          {user && (
            <UserMenu
              avatarUrl={profile?.avatar_url ?? null}
              nome={profile?.full_name ?? user.email ?? "?"}
              role={profile?.role}
              ultimaSync={
                profile?.role === "diretor" || profile?.role === "lider" ? await buscarUltimaSyncOk(supabase) : null
              }
            />
          )}
        </header>

        <div className="flex flex-1">
          <div className="min-w-0 flex-1">{children}</div>
          {user && mostraSidebarPapel && mostraSidebarRight && (
            <SidebarRightGate>
              <SidebarRight userId={previewPessoa?.id ?? user.id} />
            </SidebarRightGate>
          )}
        </div>

        <footer className="flex items-center justify-center gap-3 py-6">
          <IconLaurel className="h-3 w-6 -scale-x-100 text-imperium-line-strong" />
          <p className="font-display text-[11px] tracking-[0.3em] text-imperium-line-strong">
            ESSE QUAM VIDERI
          </p>
          <IconLaurel className="h-3 w-6 text-imperium-line-strong" />
        </footer>
      </div>

      {user && <MinervaWidget role={papelVisualizado} />}
    </div>
  );
}
