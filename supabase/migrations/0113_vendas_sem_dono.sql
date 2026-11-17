-- ============================================================
-- Venda vinda do CRM cujo vendedor não tem login no portal (17/11/2026): entra sem dono, para contar
-- no recebido do negócio (sem comissão de closer). Antes, profile_id era obrigatório e a venda sumia.
-- ============================================================
alter table vendas alter column profile_id drop not null;

insert into schema_migrations (filename) values ('0113_vendas_sem_dono.sql') on conflict (filename) do nothing;
