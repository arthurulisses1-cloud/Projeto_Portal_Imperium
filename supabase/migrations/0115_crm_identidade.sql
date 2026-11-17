-- ============================================================
-- Energy: identificar o mesmo cliente no Pipefácil e na Sunne (2026-11-18).
-- Guarda só CÓDIGOS (HMAC) do telefone e das palavras do nome de cada lead, nunca o dado pessoal.
-- ============================================================
set search_path = public;

alter table crm_deals
  add column if not exists telefone_hash text,
  add column if not exists nome_tokens text[];

create index if not exists crm_deals_telefone_idx on crm_deals (negocio_id, telefone_hash);

insert into schema_migrations (filename) values ('0115_crm_identidade.sql') on conflict (filename) do nothing;
