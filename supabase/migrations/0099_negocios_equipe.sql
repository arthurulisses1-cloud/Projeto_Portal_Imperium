-- ============================================================
-- Nome e bandeira de cada equipe (Diretor, 2026-11-05).
-- Maximus e Templários acabaram; cada negócio agora é uma equipe com nome e
-- bandeira próprios. O nome do negócio (Grupo Vorp, MatchSales...) continua
-- existindo como nome comercial; a equipe é a identidade interna do Senatus.
-- ============================================================
set search_path = public;

alter table negocios add column if not exists equipe_nome text;
alter table negocios add column if not exists equipe_bandeira text; -- caminho em /public

update negocios set equipe_nome = 'Acrópole',        equipe_bandeira = '/bandeiras/acropole.jpg'        where slug = 'vorp';
update negocios set equipe_nome = 'Vorp Finance',    equipe_bandeira = '/bandeiras/vorp-finance.jpg'    where slug = 'vorp-finance';
update negocios set equipe_nome = 'Galácticos',      equipe_bandeira = '/bandeiras/galacticos.jpg'      where slug = 'matchsales';
update negocios set equipe_nome = 'Maximus Energy',  equipe_bandeira = '/bandeiras/maximus-energy.jpg'  where slug = 'vorp-energy';

insert into schema_migrations (filename) values ('0099_negocios_equipe.sql') on conflict (filename) do nothing;
