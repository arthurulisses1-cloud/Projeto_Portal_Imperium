import { createClient } from "@/lib/supabase/server";
import { CARGO_LABEL, NEGOCIO_COR, nomeEquipe, type CargoNegocio } from "@/lib/negocios";
import { buscarComissoesNegocios, percentuais } from "@/lib/comissao-negocio";
import { buscarPaceNegocios, calcularPace } from "@/lib/pace-negocio";
import { hojeBR } from "@/lib/data-br";
import { logErroSupabase } from "@/lib/log-erro-supabase";

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function iniciais(nome: string) {
  return nome.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

type Vinculo = {
  cargo: CargoNegocio;
  principal: boolean;
  negocio: { id: string; slug: string; nome: string; equipe_nome: string | null; equipe_bandeira: string | null; status: string };
};

/** Lateral direita no modelo multinegócio: cargo no negócio, comissão do mês (com o pace) e o time. */
export default async function SidebarRight({ userId }: { userId: string }) {
  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase.from("profiles").select("role, full_name").eq("id", userId).single();
  logErroSupabase(`SidebarRight: profiles (userId=${userId})`, profileError);
  if (!profile) return null;

  const hoje = hojeBR();
  const [ano, mes] = hoje.split("-").map(Number);

  const { data: vincRaw } = await supabase
    .from("profile_negocios")
    .select("cargo, principal, negocios(id, slug, nome, equipe_nome, equipe_bandeira, status)")
    .eq("profile_id", userId);
  type L = { cargo: CargoNegocio; principal: boolean; negocios: Vinculo["negocio"] | Vinculo["negocio"][] | null };
  const vinculos: Vinculo[] = ((vincRaw ?? []) as unknown as L[])
    .map((l) => ({ cargo: l.cargo, principal: l.principal, negocio: Array.isArray(l.negocios) ? l.negocios[0] : l.negocios }))
    .filter((v): v is Vinculo => !!v.negocio && v.negocio.status === "ativo")
    .sort((a, b) => Number(b.principal) - Number(a.principal));
  const principal = vinculos[0] ?? null;

  const ehDiretor = profile.role === "diretor";
  const cargoLabel = ehDiretor ? "Diretor" : principal ? CARGO_LABEL[principal.cargo] ?? principal.cargo : "Time";
  const cor = principal ? NEGOCIO_COR[principal.negocio.slug] ?? "201 162 74" : "201 162 74";

  const { data: quotes } = await supabase.from("sage_quotes").select("texto, fonte").eq("ativo", true);
  const anoAtualStr = Number(hoje.slice(0, 4));
  const dayOfYear = Math.floor((Date.now() - new Date(Date.UTC(anoAtualStr, 0, 0)).getTime()) / 86400000);
  const quote = quotes && quotes.length > 0 ? quotes[(dayOfYear + 1) % quotes.length] : null;

  // ---------- Comissão do mês: o que a pessoa tem agora x o que teria no pace ----------
  const slugs = vinculos.map((v) => v.negocio.slug);
  let comissao: { atual: number; base: number; desagio: number; noPace: number | null; equipe: string | null } | null = null;
  try {
    const dados = ehDiretor ? await buscarComissoesNegocios(supabase, ano, mes) : slugs.length > 0 ? await buscarComissoesNegocios(supabase, ano, mes, slugs) : [];
    let atual = 0;
    let desagio = 0;
    for (const d of dados) {
      const eu = d.pessoas.find((p) => p.id === userId);
      if (!eu) continue;
      atual += eu.total;
      desagio += eu.itens.filter((i) => i.tipo === "desagio").reduce((s, i) => s + i.valor, 0);
    }
    let noPace: number | null = null;
    if (!ehDiretor && principal) {
      const [pn] = await buscarPaceNegocios(supabase, ano, mes, hoje, [principal.negocio.slug]);
      const eu = pn?.pessoas.find((p) => p.id === userId);
      if (eu && eu.meta !== null) {
        const esperadoRecebido = calcularPace({ meta: eu.meta, recebido: eu.recebido, hoje, ano, mes }).esperadoAteHoje;
        const pcts = percentuais(principal.negocio.slug, {
          id: "pace",
          valor: 100,
          canal: "outbound",
          closerId: userId,
          closerCargo: principal.cargo === "head" ? "head" : "executivo",
          indicadorId: null,
        });
        const taxa = pcts ? (principal.cargo === "head" ? pcts.closer : pcts.closer) / 100 : 0;
        noPace = taxa > 0 ? esperadoRecebido * taxa : null;
      }
    }
    comissao = { atual, base: atual - desagio, desagio, noPace, equipe: principal ? nomeEquipe(principal.negocio) : null };
  } catch (e) {
    console.error("SidebarRight: comissão do mês falhou", e);
  }

  // ---------- Meu time: quem está no mesmo negócio ----------
  type Membro = { id: string; nome: string; cargo: CargoNegocio; avatarUrl: string | null };
  let time: Membro[] = [];
  if (principal) {
    const { data: membrosRaw } = await supabase
      .from("profile_negocios")
      .select("cargo, profiles!inner(id, full_name, avatar_url, ativo)")
      .eq("negocio_id", principal.negocio.id);
    type M = { cargo: CargoNegocio; profiles: { id: string; full_name: string; avatar_url: string | null; ativo: boolean } | { id: string; full_name: string; avatar_url: string | null; ativo: boolean }[] };
    time = ((membrosRaw ?? []) as unknown as M[])
      .map((m) => ({ m, p: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles }))
      .filter((x) => x.p && x.p.ativo)
      .map((x) => ({ id: x.p.id, nome: x.p.full_name, cargo: x.m.cargo, avatarUrl: x.p.avatar_url }))
      .sort((a, b) => Number(b.cargo === "head") - Number(a.cargo === "head") || a.nome.localeCompare(b.nome, "pt-BR"));
  }

  return (
    <aside className="hidden w-72 shrink-0 space-y-6 border-l border-imperium-line bg-imperium-surface p-5 xl:block">
      <div className="text-center">
        <p className="kicker mb-3">Meu cargo</p>
        {principal?.negocio.equipe_bandeira && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={principal.negocio.equipe_bandeira} alt="" className="mx-auto mb-2 h-16 w-16 rounded-md object-cover" />
        )}
        <p className="font-display text-base text-gold-bright">{cargoLabel}</p>
        {principal && !ehDiretor && (
          <p className="mt-0.5 text-xs" style={{ color: `rgb(${cor})` }}>
            {nomeEquipe(principal.negocio)}
          </p>
        )}
      </div>

      {quote && (
        <div className="border-t border-imperium-line pt-4 text-center">
          <p className="kicker mb-2">Oráculo</p>
          <p className="font-serif text-sm italic text-stone-300">&quot;{quote.texto}&quot;</p>
          <p className="mt-1 text-[10px] text-stone-600">{quote.fonte}</p>
        </div>
      )}

      {comissao && (comissao.atual > 0 || comissao.noPace !== null) && (
        <a href="/comissao-negocio" className="block border-t border-imperium-line pt-4 transition hover:opacity-80">
          <div className="flex items-center justify-between">
            <p className="kicker">Comissão do mês</p>
            <span className="text-[10px] text-gold">ver tudo →</span>
          </div>
          <p className="mt-1.5 text-xs text-stone-300">
            Você está com <span className="text-lg font-semibold text-gold-bright">{moeda(comissao.atual)}</span>
          </p>
          {comissao.desagio > 0 && (
            <p className="text-[11px] text-stone-500">
              {moeda(comissao.base)} de comissão base + {moeda(comissao.desagio)} de deságio
            </p>
          )}
          {comissao.noPace !== null && (
            <p className="mt-1 text-xs text-stone-400">
              No seu pace deveria estar com <span className="text-stone-200">{moeda(comissao.noPace)}</span>
              {" · "}
              <span className={comissao.atual >= comissao.noPace ? "text-success-bright" : "text-wine-bright"}>
                {comissao.atual >= comissao.noPace
                  ? `${moeda(comissao.atual - comissao.noPace)} à frente`
                  : `${moeda(comissao.noPace - comissao.atual)} abaixo`}
              </span>
            </p>
          )}
          {comissao.noPace !== null && <p className="mt-1 text-[10px] text-stone-600">Estimativa pela comissão base do seu cargo sobre o recebido esperado.</p>}
        </a>
      )}

      {time.length > 0 && principal && (
        <div className="border-t border-imperium-line pt-4">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-stone-500">Meu time · {nomeEquipe(principal.negocio)}</p>
          <ul className="space-y-2">
            {time.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5">
                {m.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.avatarUrl} alt={m.nome} className="h-7 w-7 shrink-0 rounded-full border border-imperium-line-strong object-cover" />
                ) : (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-imperium-line-strong bg-imperium-bg text-[9px] text-stone-500">
                    {iniciais(m.nome)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-stone-200">{m.nome}</p>
                  <p className="text-[10px] uppercase tracking-wide text-stone-500">{CARGO_LABEL[m.cargo] ?? m.cargo}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
