-- ============================================================
-- Maximus Energy (Sunne): meta mensal de kWh (nov/2026 = 120.000 kWh).
-- Cada venda do Energy passa a registrar os kWh vendidos, para medir a meta.
-- ============================================================
set search_path = public;

alter table vendas add column if not exists kwh numeric check (kwh is null or kwh >= 0);

insert into schema_migrations (filename) values ('0108_vendas_kwh.sql') on conflict (filename) do nothing;
