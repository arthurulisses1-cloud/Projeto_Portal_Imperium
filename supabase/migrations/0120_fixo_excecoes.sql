-- Fixo diferente num mês específico (ex.: proporcional no mês de entrada). Formato: {"2026-11": 2000}.
-- O valor do mês substitui `fixo` só naquele mês; os demais meses seguem o fixo mensal.
alter table profile_negocios add column if not exists fixo_excecoes jsonb;

insert into schema_migrations (filename) values ('0120_fixo_excecoes.sql')
on conflict (filename) do nothing;
