import { createClient } from "@/lib/supabase/server";
import { NEGOCIO_COR, nomeEquipe, rotuloCargo, type CargoNegocio } from "@/lib/negocios";
import { CARGOS_PRE_VENDAS } from "@/lib/sdr-negocio";
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

  const { data: profile, error: profileError } = await supabase.from("profiles").select("role, full_name, avatar_url").eq("id", userId).single();
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
  const cargoLabel = ehDiretor ? "Diretor Comercial" : principal ? rotuloCargo(principal.cargo) : "Time";
  const cor = principal ? NEGOCIO_COR[principal.negocio.slug] ?? "201 162 74" : "201 162 74";

  const { data: quotes } = await supabase.from("sage_quotes").select("texto, fonte").eq("ativo", true);
  const anoAtualStr = Number(hoje.slice(0, 4));
  const dayOfYear = Math.floor((Date.now() - new Date(Date.UTC(anoAtualStr, 0, 0)).getTime()) / 86400000);
  const quote = quotes && quotes.length > 0 ? quotes[(dayOfYear + 1) % quotes.length] : null;

  // ---------- Comissão do mês: o que a pessoa tem agora x o que teria no pace ----------
  let comissao: { atual: number; base: number; desagio: number; pago: number; noPace: number | null; equipe: string | null } | null = null;
  try {
    // Todos os negócios: a pessoa também recebe de vendas de outras BUs em que participou.
    const dados = await buscarComissoesNegocios(supabase, ano, mes);
    // "atual" é o que ainda vai receber: comissões já pagas (ex.: recebimento antecipado) ficam de fora e aparecem à parte.
    let atual = 0;
    let desagio = 0;
    let pago = 0;
    for (const d of dados) {
      const eu = d.pessoas.find((p) => p.id === userId);
      if (!eu) continue;
      for (const i of eu.itens) {
        if (i.pagoEm) {
          pago += i.valor;
          continue;
        }
        atual += i.valor;
        if (i.tipo === "desagio") desagio += i.valor;
      }
    }
    let noPace: number | null = null;
    // SDR (pré-vendas) não ganha % de closer: a estimativa pelo pace não vale para ele (a comissão dele é RQA + venda originada).
    if (!ehDiretor && principal && !CARGOS_PRE_VENDAS.includes(principal.cargo)) {
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
    comissao = { atual, base: atual - desagio, desagio, pago, noPace, equipe: principal ? nomeEquipe(principal.negocio) : null };
  } catch (e) {
    console.error("SidebarRight: comissão do mês falhou", e);
  }

  // ---------- Meu time: quem está no mesmo negócio (o Diretor está em todos: vê os times de todos os negócios) ----------
  type Membro = { id: string; nome: string; cargo: CargoNegocio; role: string | null; avatarUrl: string | null };
  type Grupo = { negocio: Vinculo["negocio"]; membros: Membro[] };
  let grupos: Grupo[] = [];
  let negociosDoTime: Vinculo["negocio"][] = principal ? [principal.negocio] : [];
  if (ehDiretor) {
    const { data: todos } = await supabase.from("negocios").select("id, slug, nome, equipe_nome, equipe_bandeira, status").eq("status", "ativo").order("ordem");
    negociosDoTime = (todos ?? []) as Vinculo["negocio"][];
  }
  if (negociosDoTime.length > 0) {
    const { data: membrosRaw } = await supabase
      .from("profile_negocios")
      .select("negocio_id, cargo, profiles!inner(id, full_name, avatar_url, ativo, role)")
      .in("negocio_id", negociosDoTime.map((n) => n.id));
    type P = { id: string; full_name: string; avatar_url: string | null; ativo: boolean; role: string | null };
    type M = { negocio_id: string; cargo: CargoNegocio; profiles: P | P[] };
    const todosMembros = ((membrosRaw ?? []) as unknown as M[])
      .map((m) => ({ m, p: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles }))
      .filter((x) => x.p && x.p.ativo);
    grupos = negociosDoTime
      .map((negocio) => ({
        negocio,
        membros: todosMembros
          .filter((x) => x.m.negocio_id === negocio.id)
          // O Diretor não se lista no próprio time.
          .filter((x) => !(ehDiretor && x.p.role === "diretor"))
          .map((x): Membro => ({ id: x.p.id, nome: x.p.full_name, cargo: x.m.cargo, role: x.p.role ?? null, avatarUrl: x.p.avatar_url }))
          .sort(
            (a, b) =>
              Number(b.role === "diretor") - Number(a.role === "diretor") ||
              Number(b.cargo === "head") - Number(a.cargo === "head") ||
              a.nome.localeCompare(b.nome, "pt-BR"),
          ),
      }))
      .filter((g) => g.membros.length > 0);
  }

  return (
    <aside className="hidden w-72 shrink-0 space-y-6 border-l border-imperium-line bg-imperium-surface p-5 xl:block">
      <div className="text-center">
        <p className="kicker mb-3">Meu cargo</p>
        {ehDiretor ? (
          // O Diretor aparece com a própria foto (não com a bandeira de um time).
          profile.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatar_url} alt={profile.full_name} className="mx-auto mb-2 h-20 w-20 rounded-full border-2 border-gold/50 object-cover" />
          ) : (
            <div className="mx-auto mb-2 flex h-20 w-20 items-center justify-center rounded-full border-2 border-gold/50 bg-imperium-bg font-display text-2xl text-gold">{iniciais(profile.full_name)}</div>
          )
        ) : (
          principal?.negocio.equipe_bandeira && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={principal.negocio.equipe_bandeira} alt="" className="mx-auto mb-2 h-16 w-16 rounded-md object-cover" />
          )
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

      {comissao && (comissao.atual > 0 || comissao.pago > 0 || comissao.noPace !== null) && (
        <a href="/comissao-negocio" className="block border-t border-imperium-line pt-4 transition hover:opacity-80">
          <div className="flex items-center justify-between">
            <p className="kicker">Comissão do mês</p>
            <span className="text-[10px] text-gold">ver tudo →</span>
          </div>
          <p className="mt-1.5 text-xs text-stone-300">
            Você está com <span className="text-lg font-semibold text-gold-bright">{moeda(comissao.atual)}</span>
          </p>
          {comissao.pago > 0 && <p className="text-[11px] text-stone-500">Fora da conta: {moeda(comissao.pago)} já recebidos antecipadamente.</p>}
          {comissao.desagio > 0 && (
            <p className="text-[11px] text-stone-500">
              {moeda(comissao.base)} de comissão base + {moeda(comissao.desagio)} de deságio
            </p>
          )}
          {comissao.noPace !== null && (
            <p className="mt-1 text-xs text-stone-400">
              No seu pace deveria estar com <span className="text-stone-200">{moeda(comissao.noPace)}</span>
              {" · "}
              <span className={comissao.atual + comissao.pago >= comissao.noPace ? "text-success-bright" : "text-wine-bright"}>
                {comissao.atual + comissao.pago >= comissao.noPace
                  ? `${moeda(comissao.atual + comissao.pago - comissao.noPace)} à frente`
                  : `${moeda(comissao.noPace - comissao.atual - comissao.pago)} abaixo`}
              </span>
            </p>
          )}
          {comissao.noPace !== null && <p className="mt-1 text-[10px] text-stone-600">Estimativa pela comissão base do seu cargo sobre o recebido esperado.</p>}
        </a>
      )}

      {grupos.map((g) => (
        <div key={g.negocio.id} className="border-t border-imperium-line pt-4">
          <p className="mb-2 text-[10px] uppercase tracking-wide text-stone-500">
            {ehDiretor ? "Time" : "Meu time"} · <span style={{ color: `rgb(${NEGOCIO_COR[g.negocio.slug] ?? "201 162 74"})` }}>{nomeEquipe(g.negocio)}</span>
          </p>
          <ul className="space-y-2">
            {g.membros.map((m) => (
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
                  <p className="text-[10px] uppercase tracking-wide text-stone-500">{rotuloCargo(m.cargo, m.role)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}
