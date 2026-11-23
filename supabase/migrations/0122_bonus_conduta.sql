-- Bônus de conduta: parte do salário fechado que o Diretor libera no fim do mês, depois de analisar conduta, horários e faltas
-- (2026-11-23). O fixo cadastrado passa a ser o valor base (sem o bônus); o bônus fica em profile_negocios.bonus_conduta e a
-- decisão de cada mês (aplicar ou não) em bonus_conduta_mes. Estritamente do Diretor.
alter table profile_negocios add column if not exists bonus_conduta numeric;

create table if not exists bonus_conduta_mes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  negocio_id uuid not null references negocios(id) on delete cascade,
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  aplicado boolean not null,
  valor numeric not null,
  decidido_por uuid references profiles(id),
  decidido_em timestamptz not null default now(),
  unique (profile_id, negocio_id, ano, mes)
);

alter table bonus_conduta_mes enable row level security;

drop policy if exists bonus_conduta_mes_diretor on bonus_conduta_mes;
create policy bonus_conduta_mes_diretor on bonus_conduta_mes for all using (is_director()) with check (is_director());
-- O investidor só lê (a DRE e o Financeiro por Negócio mostram o custo).
drop policy if exists bonus_conduta_mes_investidor on bonus_conduta_mes;
create policy bonus_conduta_mes_investidor on bonus_conduta_mes for select using (is_investidor());

insert into schema_migrations (filename) values ('0122_bonus_conduta.sql')
on conflict (filename) do nothing;
