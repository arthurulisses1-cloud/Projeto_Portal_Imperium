-- Plano de comissão do Analista de Growth (hoje só o Igor Lobato) —
-- pedido do Diretor, 2026-09-24: ele ganha sobre a receita PAGA do canal
-- Inbound no mês (weekly_operacoes.origem = 'INBOUND'), não sobre
-- produção pessoal — por isso não usa commission_tiers (que é sempre por
-- rank e produção pessoal/de time). Mesmo formato de tier de sempre
-- (patamar mínimo + % sobre o que passar dele), só que a métrica de
-- entrada é o canal, não uma pessoa/time.
create table growth_tiers (
  id uuid primary key default gen_random_uuid(),
  canal_min numeric not null,
  fixo numeric not null,
  pct_variavel numeric not null,
  ordem int not null
);

insert into growth_tiers (canal_min, fixo, pct_variavel, ordem) values
  (500000, 2800, 0.10, 1),
  (1000000, 3000, 0.10, 2),
  (1250000, 3200, 0.15, 3),
  (1500000, 3500, 0.15, 4),
  (1750000, 3500, 0.20, 5),
  (2000000, 4000, 0.20, 6),
  (2500000, 4500, 0.20, 7),
  (3000000, 6000, 0.20, 8);

alter table growth_tiers enable row level security;

create policy growth_tiers_select on growth_tiers for select using (is_director());
create policy growth_tiers_write on growth_tiers for all using (is_director()) with check (is_director());

insert into schema_migrations (filename) values ('0088_growth_tiers.sql')
on conflict (filename) do nothing;
