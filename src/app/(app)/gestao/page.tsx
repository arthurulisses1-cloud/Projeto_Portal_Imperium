import { Fragment } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { RANK_LABELS, ROLE_LABELS } from "@/lib/labels";
import { RANK_ORDER } from "@/lib/carreira";
import { listarNomesPlanilha } from "@/lib/sync/nomes";
import { buscarUltimaSyncOk } from "@/lib/sync/status";
import { atualizarCargo, atualizarTribo, atualizarLegado, salvarPermissoesAnalista } from "./actions";
import { AREAS_ANALISTA, buscarPermissoesAnalistaEmLote } from "@/lib/permissoes-analista";
import Card from "@/components/ui/Card";
import SincronizarPlanilha from "@/components/ui/SincronizarPlanilha";
import SeletorNomesPlanilha from "@/components/ui/SeletorNomesPlanilha";
import EnviarAcessoForm from "@/components/ui/EnviarAcessoForm";
import GerarSenhaButton from "@/components/ui/GerarSenhaButton";
import CriarUsuarioForm from "@/components/ui/CriarUsuarioForm";
import ExcluirUsuarioButton from "@/components/ui/ExcluirUsuarioButton";

const ROLES = ["sdr", "closer", "lider", "diretor", "investidor", "analista"] as const;
const RANKS = [...RANK_ORDER, "diretor"] as const;

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

  const { data: pessoas } = await supabase
    .from("profiles")
    .select("id, full_name, role, rank, tribo_id, nomes_planilha")
    .order("full_name");

  const { data: tribos } = await supabase
    .from("tribos")
    .select("id, nome, exercito:exercitos(nome)")
    .order("nome");

  const { data: exercitos } = await supabase
    .from("exercitos")
    .select("id, nome, legado_id")
    .order("nome");

  const lideres = (pessoas ?? []).filter((p) => p.role === "lider");
  const nomesPlanilha = await listarNomesPlanilha();
  const ultimaSync = await buscarUltimaSyncOk(supabase);

  // Permissão customizada por Analista (pedido do Diretor, 2026-09-21) —
  // busca de todo mundo de uma vez, só quem é Analista precisa disso.
  const idsAnalistas = (pessoas ?? []).filter((p) => p.role === "analista").map((p) => p.id);
  const permissoesPorAnalista = await buscarPermissoesAnalistaEmLote(supabase, idsAnalistas);

  // Email mora só em auth.users (profiles não tem essa coluna) — só o
  // service role enxerga essa tabela, daí o client admin. listUsers pagina
  // de 50 em 50; a equipe toda cabe numa página só (revisar se crescer).
  const admin = createAdminClient();
  const { data: usersData } = await admin.auth.admin.listUsers({ perPage: 200 });
  const emailPorId = new Map((usersData?.users ?? []).map((u) => [u.id, u.email ?? null]));

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Gestão de Pessoas</h1>
        <p className="kicker mt-1">Cargo, Tribo e Exército de cada membro — acesso total do Diretor</p>
      </div>

      <Card title="Cadastrar novo usuário">
        <CriarUsuarioForm
          tribos={(tribos ?? []).map((t) => ({
            id: t.id,
            nome: t.nome,
            exercitoNome: (t.exercito as unknown as { nome: string } | null)?.nome ?? null,
          }))}
        />
      </Card>

      <Card title="Sincronização com a Planilha">
        <SincronizarPlanilha ultimaSyncInicial={ultimaSync} />
      </Card>

      <Card title="Exércitos e seus Legados">
        <div className="grid gap-3 sm:grid-cols-2">
          {(exercitos ?? []).map((e) => (
            <form key={e.id} action={atualizarLegado} className="flex items-end gap-2 rounded border border-imperium-line p-3">
              <input type="hidden" name="exercito_id" value={e.id} />
              <div className="flex-1">
                <p className="mb-1 text-sm text-stone-200">{e.nome}</p>
                <select name="legado_id" defaultValue={e.legado_id ?? ""} className="input-imp text-sm">
                  <option value="">— sem Legado —</option>
                  {lideres.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="btn-outline px-3 py-2 text-xs">
                Salvar
              </button>
            </form>
          ))}
        </div>
      </Card>

      <Card title="Todos os membros">
        <div className="space-y-3">
          {(pessoas ?? [])
            .filter((p) => p.role !== "diretor")
            .map((p) => {
              const tribo = (tribos ?? []).find((t) => t.id === p.tribo_id);
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
                      <div>
                        <label className="mb-1 block text-[10px] uppercase text-stone-500">Cargo</label>
                        <select name="rank" defaultValue={p.rank} className="input-imp text-xs">
                          {RANKS.map((r) => (
                            <option key={r} value={r}>
                              {RANK_LABELS[r] ?? r}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button type="submit" className="btn-outline px-3 py-1.5 text-xs">
                        Salvar
                      </button>
                    </form>

                    <form action={atualizarTribo} className="flex items-end gap-2">
                      <input type="hidden" name="profile_id" value={p.id} />
                      <div>
                        <label className="mb-1 block text-[10px] uppercase text-stone-500">Tribo</label>
                        <select name="tribo_id" defaultValue={p.tribo_id ?? ""} className="input-imp text-xs">
                          <option value="">— sem Tribo —</option>
                          {(tribos ?? []).map((t) => {
                            const ex = t.exercito as unknown as { nome: string } | null;
                            return (
                              <option key={t.id} value={t.id}>
                                {ex?.nome ? `${ex.nome} · ` : ""}
                                {t.nome}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <button type="submit" className="btn-outline px-3 py-1.5 text-xs">
                        Salvar
                      </button>
                    </form>

                    {tribo && (
                      <span className="text-xs text-stone-500">
                        atual: {(tribo.exercito as unknown as { nome: string } | null)?.nome} · {tribo.nome}
                      </span>
                    )}
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
