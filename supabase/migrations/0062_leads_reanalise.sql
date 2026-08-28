-- ============================================================
-- Segundo funil: Reanálise (pedido do Diretor, 2026-08-28) — a
-- partir de Subido/CCB Enviada/Assinado, o executivo pode "Enviar
-- pra Reanálise" quando o Jurídico devolve o caso com uma nova data
-- de retorno. O lead NÃO muda de etapa no funil principal — só ganha
-- a flag em_reanalise e some da visão principal, reaparecendo no
-- "Funil de Reanálise" (mesma tela /leads, um toggle — não é aba
-- nova) até alguém marcar como resolvida.
--
-- status_followup nunca é tocado pela reanálise de propósito: é
-- assim que "Resolvida → volta pro funil" funciona sem precisar
-- guardar/restaurar etapa nenhuma — o lead nunca saiu de onde estava.
-- ============================================================

alter table entrevistas_leads add column if not exists em_reanalise boolean not null default false;
alter table entrevistas_leads add column if not exists reanalise_data date;

insert into schema_migrations (filename) values ('0062_leads_reanalise.sql')
on conflict (filename) do nothing;
