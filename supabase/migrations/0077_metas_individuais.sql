-- Meta de crédito individual, por pessoa/mês — pedido do Diretor,
-- 2026-09-11: hoje a meta da Tribo é sempre dividida IGUALMENTE entre os
-- membros (mapaMetaCreditoPorTribo ÷ pessoas). Com essa tabela, o Diretor
-- pode sobrescrever a meta de alguém específico (maior ou menor que a
-- média); quem NÃO tem override continua dividindo igualmente o que sobra
-- da meta da Tribo depois de tirar as metas fixadas manualmente — ver
-- buscarMetaIndividual em src/lib/metas.ts.
create table metas_individuais (
  id uuid primary key default gen_random_uuid(),
  ano int not null,
  mes int not null check (mes between 1 and 12),
  profile_id uuid not null references profiles(id) on delete cascade,
  meta_credito numeric not null check (meta_credito >= 0),
  criado_por uuid references profiles(id),
  updated_at timestamptz not null default now(),
  unique (ano, mes, profile_id)
);

alter table metas_individuais enable row level security;

create policy metas_individuais_select on metas_individuais for select using (true);
create policy metas_individuais_write on metas_individuais for all
  using (is_director()) with check (is_director());

create trigger trg_metas_individuais_updated_at before update on metas_individuais
  for each row execute function set_updated_at();

insert into schema_migrations (filename) values ('0077_metas_individuais.sql')
on conflict (filename) do nothing;
