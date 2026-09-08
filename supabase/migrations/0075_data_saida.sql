-- Data de saída da empresa — pedido do Diretor, 2026-09-08: ao desativar
-- alguém, o sistema pergunta o último dia de trabalho, e a Folha da DRE
-- passa a: (a) parar de cobrar o fixo de quem já não trabalha mais desde
-- ANTES do mês em questão, e (b) pagar o fixo PROPORCIONAL aos dias
-- trabalhados no mês em que a saída aconteceu (ver buscarFolha em
-- src/lib/dre.ts).
alter table profiles add column if not exists data_saida date;

-- Backfill: Marcus Lira e Elisa já tinham sido desativados antes dessa
-- coluna existir — sem data_saida, a Folha de setembro continuaria
-- cobrando o fixo deles. Último dia informado pelo Diretor: 31/08/2026.
update profiles set data_saida = '2026-08-31'
where full_name in ('Marcus Lira', 'Elisa') and ativo = false and data_saida is null;

insert into schema_migrations (filename) values ('0075_data_saida.sql')
on conflict (filename) do nothing;
