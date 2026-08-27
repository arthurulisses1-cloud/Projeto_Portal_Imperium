-- ============================================================
-- Tarefas viram um Kanban de verdade (colunas/prioridade já existiam
-- no schema desde o início, só nunca usadas por uma UI): líder/closer
-- passam a poder ATRIBUIR tarefa pro time (não só ver), mantendo
-- `privado` como o jeito de esconder uma tarefa pessoal dos superiores.
-- ============================================================

set search_path = public;

alter table tasks add column if not exists atribuido_por uuid references profiles(id);

-- Antes só o dono (ou Diretor) inseria/atualizava — barrava o líder/closer
-- de CRIAR uma tarefa nova pra um liderado (só editava se já existisse).
-- Mesmo padrão de compromissos_update (0002_rls.sql) pro insert e update.
drop policy if exists tasks_insert on tasks;
drop policy if exists tasks_update on tasks;
drop policy if exists tasks_delete on tasks;

create policy tasks_insert on tasks for insert with check (
  profile_id = auth.uid()
  or is_closer_of_tribo(profile_tribo_id(profile_id))
  or is_lider_of_exercito(profile_exercito_id(profile_id))
  or is_director()
);
-- `privado` também vale pra update/delete de terceiro, não só pra
-- leitura — senão o líder conseguiria apagar/mudar uma tarefa que nem
-- deveria conseguir VER, só por saber que ela existe.
create policy tasks_update on tasks for update using (
  profile_id = auth.uid()
  or is_director()
  or (privado = false and (
    is_closer_of_tribo(profile_tribo_id(profile_id))
    or is_lider_of_exercito(profile_exercito_id(profile_id))
  ))
);
-- Delete segue a mesma regra do update (quem atribuiu também pode
-- cancelar) — antes só o dono ou Diretor podia excluir.
create policy tasks_delete on tasks for delete using (
  profile_id = auth.uid()
  or is_director()
  or (privado = false and (
    is_closer_of_tribo(profile_tribo_id(profile_id))
    or is_lider_of_exercito(profile_exercito_id(profile_id))
  ))
);

insert into schema_migrations (filename) values ('0051_tasks_atribuicao.sql') on conflict do nothing;
