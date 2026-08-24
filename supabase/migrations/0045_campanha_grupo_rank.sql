-- Campanha "Grupo Específico": duelo entre todo mundo de um ou mais Cargos
-- (Legionário, Centurião, Tribuno...) sem precisar marcar pessoa por
-- pessoa — os participantes são auto-populados pelo cargo na criação
-- (ver criarCampanha em src/app/(app)/campanhas/actions.ts). Precisa ser
-- sua própria migration: um valor de enum não pode ser USADO na mesma
-- transação em que foi criado (mesma regra já documentada na 0010/0039).
alter type campanha_alvo add value 'grupo_rank';

insert into schema_migrations (filename) values ('0045_campanha_grupo_rank.sql')
on conflict (filename) do nothing;
