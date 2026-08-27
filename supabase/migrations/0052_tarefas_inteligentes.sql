-- ============================================================
-- "Tarefa inteligente": checklist, comentários, tags, dependência,
-- horário de prazo e time tracking — pedido do Diretor (2026-08-27)
-- depois de ler um roadmap tipo Trello+Notion+Asana. Sem gamificação
-- de tarefa (o Império já tem Rank/Estrelas ligado a venda de verdade,
-- não duplicar), sem Gantt/automações/templates/workspaces.
-- ============================================================

set search_path = public;

-- ---------- tasks: campos novos ----------

-- 'media' → 'normal' pra abrir espaço pro nível 'critica' acima de 'alta'
-- (Crítica > Alta > Normal > Baixa, 4 níveis em vez de 3).
alter type task_prioridade rename value 'media' to 'normal';
alter type task_prioridade add value if not exists 'critica';

alter table tasks add column if not exists descricao text;
alter table tasks add column if not exists due_time time;
alter table tasks add column if not exists tags text[] not null default '{}';
alter table tasks add column if not exists tempo_estimado_min int;
alter table tasks add column if not exists tempo_gasto_seg int not null default 0;
alter table tasks add column if not exists cronometro_iniciado_em timestamptz;

-- ---------- checklist (subtarefas) ----------

create table task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  titulo text not null,
  feito boolean not null default false,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);
create index task_checklist_items_task_id_idx on task_checklist_items(task_id);

-- ---------- comentários ----------

create table task_comentarios (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  autor_id uuid not null references profiles(id),
  texto text not null,
  created_at timestamptz not null default now()
);
create index task_comentarios_task_id_idx on task_comentarios(task_id);

-- ---------- dependência (só um "aguardando", sem grafo complexo) ----------
-- Uma tarefa pode depender de outra — vira um aviso visual "aguardando: X"
-- enquanto a tarefa-base não estiver concluída. Não bloqueia de verdade no
-- banco (a coluna continua livre pra mudar), é só sinalização — travar de
-- verdade adicionaria complexidade sem ganho real pro uso que o time faz.

create table task_dependencias (
  task_id uuid not null references tasks(id) on delete cascade,
  depende_de_id uuid not null references tasks(id) on delete cascade,
  primary key (task_id, depende_de_id),
  check (task_id <> depende_de_id)
);

-- ---------- RLS: sempre atrelada à visibilidade da tarefa-pai ----------
-- Mesma regra de tasks_select (dono, Diretor, ou time quando não `privado`)
-- — reaproveitada via join em vez de duplicar a lógica de is_closer_of_tribo
-- /is_lider_of_exercito pra cada tabela nova.

alter table task_checklist_items enable row level security;
create policy task_checklist_items_all on task_checklist_items for all using (
  exists (
    select 1 from tasks t
    where t.id = task_checklist_items.task_id
    and (
      t.profile_id = auth.uid()
      or is_director()
      or (t.privado = false and (
        is_closer_of_tribo(profile_tribo_id(t.profile_id))
        or is_lider_of_exercito(profile_exercito_id(t.profile_id))
      ))
    )
  )
) with check (
  exists (
    select 1 from tasks t
    where t.id = task_checklist_items.task_id
    and (
      t.profile_id = auth.uid()
      or is_director()
      or (t.privado = false and (
        is_closer_of_tribo(profile_tribo_id(t.profile_id))
        or is_lider_of_exercito(profile_exercito_id(t.profile_id))
      ))
    )
  )
);

alter table task_comentarios enable row level security;
create policy task_comentarios_select on task_comentarios for select using (
  exists (
    select 1 from tasks t
    where t.id = task_comentarios.task_id
    and (
      t.profile_id = auth.uid()
      or is_director()
      or (t.privado = false and (
        is_closer_of_tribo(profile_tribo_id(t.profile_id))
        or is_lider_of_exercito(profile_exercito_id(t.profile_id))
      ))
    )
  )
);
create policy task_comentarios_insert on task_comentarios for insert with check (
  autor_id = auth.uid()
  and exists (
    select 1 from tasks t
    where t.id = task_comentarios.task_id
    and (
      t.profile_id = auth.uid()
      or is_director()
      or (t.privado = false and (
        is_closer_of_tribo(profile_tribo_id(t.profile_id))
        or is_lider_of_exercito(profile_exercito_id(t.profile_id))
      ))
    )
  )
);
create policy task_comentarios_delete on task_comentarios for delete using (
  autor_id = auth.uid() or is_director()
);

alter table task_dependencias enable row level security;
create policy task_dependencias_all on task_dependencias for all using (
  exists (
    select 1 from tasks t
    where t.id = task_dependencias.task_id
    and (
      t.profile_id = auth.uid()
      or is_director()
      or (t.privado = false and (
        is_closer_of_tribo(profile_tribo_id(t.profile_id))
        or is_lider_of_exercito(profile_exercito_id(t.profile_id))
      ))
    )
  )
) with check (
  exists (
    select 1 from tasks t
    where t.id = task_dependencias.task_id
    and (
      t.profile_id = auth.uid()
      or is_director()
      or (t.privado = false and (
        is_closer_of_tribo(profile_tribo_id(t.profile_id))
        or is_lider_of_exercito(profile_exercito_id(t.profile_id))
      ))
    )
  )
);

insert into schema_migrations (filename) values ('0052_tarefas_inteligentes.sql') on conflict do nothing;
