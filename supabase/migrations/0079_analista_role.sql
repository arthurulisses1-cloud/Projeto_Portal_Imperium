-- Novo papel "analista": mesma VISÃO do Diretor, exceto Financeiro,
-- Validações e Pessoas — só leitura, nunca escreve nada (pedido do
-- Diretor, 2026-09-18). Precisa ser sua própria migration/Run — um novo
-- valor de enum não pode ser USADO (em RLS, comparação, etc.) na mesma
-- transação em que foi criado (mesma regra documentada na migration 0010,
-- já seguida pra 'investidor' na 0039).
alter type app_role add value 'analista';

insert into schema_migrations (filename) values ('0079_analista_role.sql')
on conflict (filename) do nothing;
