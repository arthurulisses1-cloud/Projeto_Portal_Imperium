-- Imperioflix v2 — pedido do Diretor, 2026-09-21: trilha oficial vira "capa
-- de série" (pôster próprio, não só gradiente), módulos alternativos ganham
-- categoria (pra virar prateleira temática, tipo Netflix) e um destaque
-- opcional pro "Top 5". Também pré-cria as categorias mais comuns já com um
-- módulo vazio cada, pra o Diretor só preencher depois.

alter table academy_trilhas add column capa_url text;

alter table academy_modulos add column categoria text;
alter table academy_modulos add column destaque boolean not null default false;

insert into academy_modulos (titulo, descricao, categoria, ordem, ativo, ranks_liberados)
select v.titulo, v.descricao, v.categoria, v.ordem, true, null::app_rank[]
from (
  values
    ('Trilhas de Marketing', 'Estratégias, copy, tráfego e posicionamento.', 'marketing', 10),
    ('Trilhas de Vendas', 'Técnicas de venda, quebra de objeção e negociação.', 'vendas', 20),
    ('Mentalidade', 'Desenvolvimento pessoal, disciplina e alta performance.', 'mentalidade', 30),
    ('Gestão', 'Liderança, gestão de time e processos.', 'gestao', 40),
    ('Podcasts', 'Episódios e conversas gravadas do Império.', 'podcast', 50)
) as v(titulo, descricao, categoria, ordem)
where not exists (select 1 from academy_modulos m where m.titulo = v.titulo);

insert into schema_migrations (filename) values ('0086_imperioflix_capas_categorias.sql')
on conflict (filename) do nothing;
