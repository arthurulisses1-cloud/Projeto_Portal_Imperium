-- Bolinha vermelha na lateral quando surge notícia/enquete nova no Mural
-- (pedido do Diretor, 2026-08-24) — guarda só "a última vez que essa
-- pessoa abriu o Mural"; comparado com o post mais recente pra decidir se
-- tem novidade. Não precisa de tabela de leitura por post, o Mural é um
-- feed único visto por todo mundo.
alter table profiles add column if not exists mural_visto_em timestamptz;

insert into schema_migrations (filename) values ('0044_mural_visto_em.sql')
on conflict (filename) do nothing;
