-- Bandeiras definitivas das equipes (imagens enviadas pelo Diretor, 2026-11-05).
set search_path = public;
update negocios set equipe_bandeira = '/bandeiras/acropole.jpg'       where slug = 'vorp';
update negocios set equipe_bandeira = '/bandeiras/vorp-finance.jpg'   where slug = 'vorp-finance';
update negocios set equipe_bandeira = '/bandeiras/galacticos.jpg'     where slug = 'matchsales';
update negocios set equipe_bandeira = '/bandeiras/maximus-energy.jpg' where slug = 'vorp-energy';
insert into schema_migrations (filename) values ('0100_bandeiras_imagens.sql') on conflict (filename) do nothing;
