-- Campo livre pra quem cria a campanha deixar claro o "mínimo pra valer" e
-- o prêmio de verdade, sem depender só do título/descrição corrido.
alter table campanhas add column if not exists requisitos_minimos text;
alter table campanhas add column if not exists recompensa text;

insert into schema_migrations (filename) values ('0034_campanha_requisitos_recompensa.sql')
on conflict (filename) do nothing;
