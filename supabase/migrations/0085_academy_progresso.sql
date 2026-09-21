-- "Assistido" no Imperioflix — cada aluno marca pra si mesmo se já viu
-- uma aula oficial ou um item de módulo alternativo. Pedido do Diretor,
-- 2026-09-21, junto com o redesenho em cards grandes estilo Netflix.
create table academy_progresso (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references profiles(id),
  alvo_tipo text not null check (alvo_tipo in ('academy_aula', 'academy_modulo_item')),
  alvo_id uuid not null,
  assistido_em timestamptz not null default now(),
  unique (aluno_id, alvo_tipo, alvo_id)
);

alter table academy_progresso enable row level security;

create policy academy_progresso_select on academy_progresso for select using (true);
create policy academy_progresso_write on academy_progresso for all
  using (aluno_id = auth.uid())
  with check (aluno_id = auth.uid());

insert into schema_migrations (filename) values ('0085_academy_progresso.sql')
on conflict (filename) do nothing;
