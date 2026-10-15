set search_path = public;

-- Bônus mensais de estrela (pedido do Diretor, 2026-10-15), apurados
-- automaticamente pelo Senatus no começo do mês seguinte:
--   meta_individual → bateu a meta individual do mês   = +1 (estrela cheia extra)
--   melhor_sdr      → melhor SDR do mês (crédito pago)  = +1
--   melhor_closer   → melhor Closer do mês              = +1
-- A tabela é o registro (e a trava de idempotência: 1 por pessoa/mês/tipo);
-- quem soma em profiles.stars_total é o job (src/lib/estrelas-bonus.ts).

create table if not exists estrelas_bonus (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  competencia date not null, -- 1º dia do mês apurado
  tipo text not null check (tipo in ('meta_individual', 'melhor_sdr', 'melhor_closer')),
  valor numeric not null default 1,
  detalhe text,
  criado_em timestamptz not null default now(),
  unique (profile_id, competencia, tipo)
);
create index if not exists idx_estrelas_bonus_profile on estrelas_bonus (profile_id, competencia);

alter table estrelas_bonus enable row level security;

-- Todo mundo logado vê (é reconhecimento público, igual ao ranking); só o
-- service role (job) e o Diretor escrevem.
drop policy if exists "estrelas_bonus_select" on estrelas_bonus;
create policy "estrelas_bonus_select" on estrelas_bonus
  for select to authenticated using (true);

drop policy if exists "estrelas_bonus_diretor_all" on estrelas_bonus;
create policy "estrelas_bonus_diretor_all" on estrelas_bonus
  for all to authenticated using (is_director()) with check (is_director());

insert into schema_migrations (filename) values ('0095_estrelas_bonus.sql')
on conflict (filename) do nothing;
