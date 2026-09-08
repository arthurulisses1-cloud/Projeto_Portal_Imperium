-- Liga o calendário da Imperium Academy ao Kanban de Tarefas — pedido do
-- Diretor, 2026-09-07: "quando chegue o dia a pessoa lembre que tem aquela
-- aula". Cada aula com data marcada gera uma tarefa automática (due_date =
-- data da aula) pro instrutor ("Ministrar: ...") e pra cada pessoa do rank
-- daquela trilha ("Aula da Imperium Academy: ..."); Arena (tipo='arena',
-- sem rank fixo) mira todo mundo ativo em sdr/closer.
--
-- `on delete cascade` cobre o caso de excluir a aula (as tarefas geradas
-- somem junto); reagendar/trocar instrutor apaga e recria via
-- sincronizarTasksDaAula (src/app/(app)/academy/actions.ts) — mais simples
-- que fazer diff, o volume por aula é sempre pequeno.
alter table tasks add column if not exists origem_academy_aula_id uuid references academy_aulas(id) on delete cascade;
create index if not exists tasks_origem_academy_aula_id_idx on tasks(origem_academy_aula_id);

insert into schema_migrations (filename) values ('0071_academy_tasks_link.sql')
on conflict (filename) do nothing;
