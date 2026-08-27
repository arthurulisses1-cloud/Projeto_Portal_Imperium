import { createClient } from "@/lib/supabase/server";
import TarefasApp, { type Tarefa, type ChecklistItem, type Comentario, type Dependencia } from "./TarefasApp";
import ForcarTemaClaro from "./ForcarTemaClaro";

export default async function TarefasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role, tribo_id").eq("id", user.id).single();
  if (!profile) return null;

  // Liderados: quem essa pessoa pode ver/atribuir tarefa, além de si mesma
  // — mesmo recorte de time já usado em falta/strike/PDI (MembroCard) e no
  // Forecast por Exército.
  let liderados: { id: string; full_name: string }[] = [];
  if (profile.role === "closer" && profile.tribo_id) {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("tribo_id", profile.tribo_id)
      .eq("role", "sdr")
      .order("full_name");
    liderados = data ?? [];
  } else if (profile.role === "lider") {
    const { data: exercito } = await supabase.from("exercitos").select("id").eq("legado_id", user.id).maybeSingle();
    if (exercito) {
      const { data: tribos } = await supabase.from("tribos").select("id, closer_id").eq("exercito_id", exercito.id);
      const idsTribos = (tribos ?? []).map((t) => t.id);
      const closerIds = (tribos ?? []).map((t) => t.closer_id).filter((x): x is string => !!x);
      const [{ data: sdrs }, { data: closers }] = await Promise.all([
        idsTribos.length > 0
          ? supabase.from("profiles").select("id, full_name").in("tribo_id", idsTribos).eq("role", "sdr")
          : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
        closerIds.length > 0
          ? supabase.from("profiles").select("id, full_name").in("id", closerIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      ]);
      liderados = [...(closers ?? []), ...(sdrs ?? [])].sort((a, b) => a.full_name.localeCompare(b.full_name));
    }
  } else if (profile.role === "diretor") {
    const { data } = await supabase.from("profiles").select("id, full_name").in("role", ["sdr", "closer", "lider"]).order("full_name");
    liderados = data ?? [];
  }

  const idsVisiveis = Array.from(new Set([user.id, ...liderados.map((l) => l.id)]));
  const { data: tarefasRaw } = await supabase
    .from("tasks")
    .select(
      "id, titulo, descricao, due_date, due_time, coluna, prioridade, privado, profile_id, atribuido_por, tags, tempo_estimado_min, tempo_gasto_seg, cronometro_iniciado_em, updated_at"
    )
    .in("profile_id", idsVisiveis)
    .order("due_date", { ascending: true, nullsFirst: false });

  const tarefas = (tarefasRaw ?? []) as Tarefa[];
  const idsTarefas = tarefas.map((t) => t.id);

  const [{ data: checklistRaw }, { data: comentariosRaw }, { data: dependenciasRaw }] = await Promise.all([
    idsTarefas.length > 0
      ? supabase.from("task_checklist_items").select("id, task_id, titulo, feito, ordem").in("task_id", idsTarefas).order("ordem")
      : Promise.resolve({ data: [] as ChecklistItem[] }),
    idsTarefas.length > 0
      ? supabase
          .from("task_comentarios")
          .select("id, task_id, autor_id, texto, created_at")
          .in("task_id", idsTarefas)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as Comentario[] }),
    idsTarefas.length > 0
      ? supabase.from("task_dependencias").select("task_id, depende_de_id").in("task_id", idsTarefas)
      : Promise.resolve({ data: [] as Dependencia[] }),
  ]);

  const checklist = (checklistRaw ?? []) as ChecklistItem[];
  const comentarios = (comentariosRaw ?? []) as Comentario[];
  const dependencias = (dependenciasRaw ?? []) as Dependencia[];

  // Autor de comentário pode não estar em `liderados` (ex.: Diretor comentou
  // numa tarefa de um SDR que não lidera ninguém) — busca o que faltar.
  const idsConhecidos = new Set([user.id, ...liderados.map((l) => l.id)]);
  const idsAutoresFaltando = Array.from(new Set(comentarios.map((c) => c.autor_id))).filter((id) => !idsConhecidos.has(id));
  const { data: autoresExtra } =
    idsAutoresFaltando.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", idsAutoresFaltando)
      : { data: [] as { id: string; full_name: string }[] };

  const nomePorId = new Map<string, string>([
    [user.id, "Você"],
    ...liderados.map((l) => [l.id, l.full_name] as const),
    ...(autoresExtra ?? []).map((p) => [p.id, p.full_name] as const),
  ]);

  return (
    <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-8">
      <ForcarTemaClaro />
      <div>
        <h1 className="font-display text-2xl text-gold-bright">Tarefas</h1>
        <p className="kicker mt-1">Rotina, lembretes e demandas do time</p>
      </div>

      <TarefasApp
        tarefasIniciais={tarefas}
        checklistInicial={checklist}
        comentariosIniciais={comentarios}
        dependenciasIniciais={dependencias}
        liderados={liderados}
        userId={user.id}
        nomePorId={nomePorId}
      />
    </main>
  );
}
