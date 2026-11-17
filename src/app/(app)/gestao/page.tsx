import { Fragment } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_LABELS } from "@/lib/labels";
import { CARGO_LABEL, NEGOCIO_COR, nomeEquipe, type CargoNegocio } from "@/lib/negocios";
import { listarNomesPlanilha } from "@/lib/sync/nomes";
import { buscarUltimaSyncOk } from "@/lib/sync/status";
import { atualizarCargo, removerVinculoNegocio, salvarPermissoesAnalista, salvarVinculoNegocio } from "./actions";
import { AREAS_ANALISTA, buscarPermissoesAnalistaEmLote } from "@/lib/permissoes-analista";
import Card from "@/components/ui/Card";
import SincronizarPlanilha from "@/components/ui/SincronizarPlanilha";
import SeletorNomesPlanilha from "@/components/ui/SeletorNomesPlanilha";
import EnviarAcessoForm from "@/components/ui/EnviarAcessoForm";
import GerarSenhaButton from "@/components/ui/GerarSenhaButton";
import CriarUsuarioForm from "@/components/ui/CriarUsuarioForm";
import ExcluirUsuarioButton from "@/components/ui/ExcluirUsuarioButton";

const ROLES = ["sdr", "closer", "lider", "diretor", "investidor", "analista"] as const;
const CARGOS = Object.keys(CARGO_LABEL) as CargoNegocio[];

type Negocio = { id: string; slug: string; nome: string; equipe_nome: string | null };
type Vinculo = { profile_id: string; negocio_id: string; cargo: CargoNegocio; principal: boolean };

export default async function GestaoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // A página não tinha NENHUMA checagem de papel — só o menu escondia o link
  // pra quem não é Diretor, mas navegar direto pra /gestao mostrava o e-mail
  // real de todo mundo (listUsers via client admin) pra qualquer conta
  // logada. Achado numa auditoria de segurança, 2026-09-02.
  const { data: meuPerfil } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (meuPerfil?.role !== "diretor") redirect("/");

  // Email mora só em auth.users (profiles não tem essa coluna) — só o
  // service role enxerga essa tabela, daí o client admin. listUsers pagina
  // de 50 em 50; a equipe toda cabe numa página só (revisar se crescer).
  const admin = createAdminClient();

  // Tudo isso é independente — rodar em paralelo em vez de um `await` atrás
  // do outro. `listarNomesPlanilha()` faz um fetch EXTERNO pro Google
  // Sheets (sem cache), sozinho já custa 1-3s; encadeado depois de 3
  // queries a página demorava tanto que parecia travada, e o Diretor
  // clicava várias vezes achando que o clique não tinha registrado (achado
  // 2026-09-29).
  const [{ data: pessoas }, { data: negociosRaw }, { data: vinculosRaw }, nomesPlanilha, ultimaSync, { data: usersData }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, ativo, nomes_planilha").order("full_name"),
    supabase.from("negocios").select("id, slug, nome, equipe_nome").eq("status", "ativo").order("ordem"),
    supabase.from("profile_negocios").select("profile_id, negocio_id, cargo, principal"),
    listarNomesPlanilha(),
    buscarUltimaSyncOk(supabase),
    admin.auth.admin.listUsers({ perPage: 200 }),
  ]);

  const negocios = (negociosRaw ?? []) as Negocio[];
  const negocioPorId = new Map(negocios.map((n) => [n.id, n]));
  const vinculosPorPessoa = new Map<string, Vinculo[]>();
  for (const v of (vinculosRaw ?? []) as Vinculo[]) {
    if (!negocioPorId.has(v.negocio_id)) continue; // só negócios ativos
    vinculosPorPessoa.set(v.profile_id, [...(vinculosPorPessoa.get(v.profile_id) ?? []), v]);
  }
  const emailPorId = new Map((usersData?.users ?? []).map((u) => [u.id, u.email ?? null]));

  // Permissão customizada por Analista (pedido do Diretor, 2026-09-21) —
  // busca de todo mundo de uma vez, só quem é Analista precisa disso.
  // Depende de `pessoas` acima, então continua sequencial (é uma query
  // rápida no próprio banco, não o gargalo).
  const idsAnalistas = (pessoas ?? []).filter((p) => p.role === "analista").map((p) => p.id);
  const permissoesPorAnalista = await buscarPermissoesAnalistaEmLote(supabase, idsAnalistas);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Gestão de Pessoas</h1>
        <p className="kicker mt-1">Papel, negócios e cargos de cada membro — acesso total do Diretor</p>
      </div>

      <Card title="Cadastrar novo usuário">
        <CriarUsuarioForm negocios={negocios.map((n) => ({ id: n.id, nome: nomeEquipe(n) }))} />
      </Card>

      <Card title="Sincronização com a Planilha">
        <SincronizarPlanilha ultimaSyncInicial={ultimaSync} />
      </Card>

      <Card title="Todos os membros">
        <div className="space-y-3">
          {(pessoas ?? [])
            .filter((p) => p.role !== "diretor" && p.ativo !== false)
            .map((p) => {
              const vinculos = vinculosPorPessoa.get(p.id) ?? [];
              const livres = negocios.filter((n) => !vinculos.some((v) => v.negocio_id === n.id));
              return (
                <div key={p.id} className="rounded border border-imperium-line bg-imperium-bg/40 p-3">
                  <p className="mb-2 text-sm text-stone-100">{p.full_name}</p>
                  <div className="flex flex-wrap items-end gap-3">
                    <form action={atualizarCargo} className="flex items-end gap-2">
                      <input type="hidden" name="profile_id" value={p.id} />
                      <div>
                        <label className="mb-1 block text-[10px] uppercase text-stone-500">Papel</label>
                        <select name="role" defaultValue={p.role} className="input-imp text-xs">
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r] ?? r}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button type="submit" className="btn-outline px-3 py-1.5 text-xs">
                        Salvar
                      </button>
                    </form>
                  </div>

                  <div className="mt-3">
                    <p className="mb-1.5 text-[10px] uppercase tracking-wide text-stone-500">Negócios e cargo em cada um</p>
                    <div className="space-y-1.5">
                      {vinculos.length === 0 && <p className="text-xs text-stone-600">Sem negócio vinculado.</p>}
                      {vinculos.map((v) => {
                        const n = negocioPorId.get(v.negocio_id)!;
                        const cor = NEGOCIO_COR[n.slug] ?? "201 162 74";
                        return (
                          <div key={v.negocio_id} className="flex flex-wrap items-center gap-2">
                            <form action={salvarVinculoNegocio} className="flex flex-wrap items-center gap-2">
                              <input type="hidden" name="profile_id" value={p.id} />
                              <input type="hidden" name="negocio_id" value={v.negocio_id} />
                              <span className="w-36 truncate text-xs" style={{ color: `rgb(${cor})` }}>
                                {nomeEquipe(n)}
                              </span>
                              <select name="cargo" defaultValue={v.cargo} className="input-imp text-xs">
                                {CARGOS.map((c) => (
                                  <option key={c} value={c}>
                                    {CARGO_LABEL[c]}
                                  </option>
                                ))}
                              </select>
                              <label className="flex items-center gap-1 text-[11px] text-stone-400">
                                <input type="checkbox" name="principal" defaultChecked={v.principal} /> Principal
                              </label>
                              <button type="submit" className="btn-outline px-2 py-1 text-xs">
                                Salvar
                              </button>
                            </form>
                            <form action={removerVinculoNegocio}>
                              <input type="hidden" name="profile_id" value={p.id} />
                              <input type="hidden" name="negocio_id" value={v.negocio_id} />
                              <button type="submit" className="px-2 py-1 text-xs text-wine-bright hover:underline">
                                Tirar do negócio
                              </button>
                            </form>
                          </div>
                        );
                      })}
                      {livres.length > 0 && (
                        <form action={salvarVinculoNegocio} className="flex flex-wrap items-center gap-2 pt-1">
                          <input type="hidden" name="profile_id" value={p.id} />
                          <select name="negocio_id" defaultValue="" required className="input-imp text-xs">
                            <option value="" disabled>
                              + Adicionar a um negócio…
                            </option>
                            {livres.map((n) => (
                              <option key={n.id} value={n.id}>
                                {nomeEquipe(n)}
                              </option>
                            ))}
                          </select>
                          <select name="cargo" defaultValue="executivo" className="input-imp text-xs">
                            {CARGOS.map((c) => (
                              <option key={c} value={c}>
                                {CARGO_LABEL[c]}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-1 text-[11px] text-stone-400">
                            <input type="checkbox" name="principal" defaultChecked={vinculos.length === 0} /> Principal
                          </label>
                          <button type="submit" className="btn-outline px-2 py-1 text-xs">
                            Adicionar
                          </button>
                        </form>
                      )}
                    </div>
                  </div>

                  <div className="mt-3">
                    <p className="mb-1.5 text-[10px] uppercase tracking-wide text-stone-500">
                      Acesso (email real + link de redefinir senha)
                    </p>
                    <EnviarAcessoForm profileId={p.id} emailAtual={emailPorId.get(p.id) ?? null} />
                  </div>

                  <div className="mt-3">
                    <p className="mb-1.5 text-[10px] uppercase tracking-wide text-stone-500">
                      Sem email funcionando? Gere uma senha e mande direto
                    </p>
                    <GerarSenhaButton profileId={p.id} />
                  </div>

                  {p.role === "analista" && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-stone-500">
                        Permissões de acesso (Analista)
                      </summary>
                      <p className="mb-2 mt-2 text-[10px] text-stone-600">
                        Sem marcar nada, um Analista já vê o mesmo que o Diretor, exceto Financeiro/
                        Validações/Pessoas — marque &ldquo;Ver&rdquo; pra liberar uma dessas áreas só
                        pra essa pessoa, ou desmarque uma área liberada por padrão pra tirar o acesso
                        dela. &ldquo;Editar&rdquo; ainda não libera nenhuma ação de escrita — só fica
                        salvo pra quando essa parte for implementada.
                      </p>
                      <form action={salvarPermissoesAnalista} className="space-y-1.5">
                        <input type="hidden" name="profile_id" value={p.id} />
                        <div className="grid grid-cols-[1fr,auto,auto] items-center gap-x-3 gap-y-1 text-xs">
                          <span className="text-[10px] uppercase text-stone-600">Área</span>
                          <span className="text-[10px] uppercase text-stone-600">Ver</span>
                          <span className="text-[10px] uppercase text-stone-600">Editar</span>
                          {AREAS_ANALISTA.map((a) => {
                            const atual = permissoesPorAnalista.get(p.id)?.[a.key];
                            return (
                              <Fragment key={a.key}>
                                <span className="text-stone-300">{a.label}</span>
                                <input
                                  type="checkbox"
                                  name={`ver_${a.key}`}
                                  defaultChecked={atual?.ver ?? a.verPadrao}
                                  className="justify-self-center"
                                />
                                <input
                                  type="checkbox"
                                  name={`editar_${a.key}`}
                                  defaultChecked={atual?.editar ?? false}
                                  className="justify-self-center"
                                />
                              </Fragment>
                            );
                          })}
                        </div>
                        <button type="submit" className="btn-outline mt-2 px-3 py-1.5 text-xs">
                          Salvar permissões
                        </button>
                      </form>
                    </details>
                  )}

                  <details className="mt-3">
                    <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-stone-500">
                      Nomes na planilha ({(p.nomes_planilha ?? []).length})
                    </summary>
                    <p className="mb-2 mt-2 text-[10px] text-stone-600">
                      Marque toda grafia que aparece na planilha do Google Sheets referente a essa
                      pessoa (ex.: variações de maiúscula/minúscula) — a sync passa a casar qualquer
                      uma delas com esse perfil.
                    </p>
                    <SeletorNomesPlanilha
                      profileId={p.id}
                      opcoes={nomesPlanilha}
                      selecionados={p.nomes_planilha ?? []}
                    />
                  </details>

                  <div className="mt-3 border-t border-imperium-line pt-3">
                    <ExcluirUsuarioButton profileId={p.id} nome={p.full_name} />
                  </div>
                </div>
              );
            })}
        </div>
      </Card>
    </main>
  );
}
