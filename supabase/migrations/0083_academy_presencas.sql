-- Lista de presença da Imperium Academy — pedido do Diretor, 2026-09-21:
-- "quero que você coloque a lista de presença, pra que ele [o instrutor]
-- cadastre quem participou da aula. A partir do momento que a pessoa
-- recebe a presença, isso contabiliza no plano de carreira no quesito
-- formação". Uma linha por (aula, aluno) — presente=true/false em vez de
-- só inserir quando presente, pra dar pra "desmarcar" alguém que foi
-- marcado por engano sem apagar linha.
create table academy_presencas (
  id uuid primary key default gen_random_uuid(),
  aula_id uuid not null references academy_aulas(id) on delete cascade,
  aluno_id uuid not null references profiles(id) on delete cascade,
  presente boolean not null default true,
  marcado_por uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (aula_id, aluno_id)
);

alter table academy_presencas enable row level security;

-- Leitura: o próprio aluno (pro Plano de Carreira contar certinho pra
-- ele), o instrutor daquela aula, ou o Diretor.
create policy academy_presencas_select on academy_presencas for select using (
  aluno_id = auth.uid()
  or is_director()
  or exists (select 1 from academy_aulas a where a.id = academy_presencas.aula_id and a.instrutor_id = auth.uid())
);

-- Escrita: só quem dá a aula (ou o Diretor) marca presença — mesmo corte
-- de permissão que academy_aulas_update_instrutor já usa pra "marcar
-- realizada".
create policy academy_presencas_insert on academy_presencas for insert with check (
  is_director()
  or exists (select 1 from academy_aulas a where a.id = academy_presencas.aula_id and a.instrutor_id = auth.uid())
);
create policy academy_presencas_update on academy_presencas for update using (
  is_director()
  or exists (select 1 from academy_aulas a where a.id = academy_presencas.aula_id and a.instrutor_id = auth.uid())
);

insert into schema_migrations (filename) values ('0083_academy_presencas.sql')
on conflict (filename) do nothing;
