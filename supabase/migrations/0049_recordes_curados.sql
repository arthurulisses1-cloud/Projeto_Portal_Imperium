-- ============================================================
-- Recordes curados manualmente pra aba "Anais do Império"
-- (recordes automáticos não precisam de tabela — são calculados
-- direto de weekly_operacoes/vendas em src/lib/recordes.ts).
-- Mesmo padrão de `marcos` (0008): curadoria só do Diretor.
-- ============================================================

set search_path = public;

create table recordes_curados (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  valor_texto text,
  data_referencia date,
  profile_id uuid references profiles(id),
  ordem int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table recordes_curados enable row level security;

create policy recordes_curados_select on recordes_curados for select using (true);
create policy recordes_curados_write on recordes_curados for all
  using (is_director()) with check (is_director());

insert into schema_migrations (filename) values ('0049_recordes_curados.sql') on conflict do nothing;
