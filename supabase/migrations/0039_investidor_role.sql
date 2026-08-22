-- Novo papel "investidor": acesso de sócio/investidor, só visualização.
-- Precisa ser sua própria migration/Run — um novo valor de enum não pode
-- ser USADO (em RLS, comparação, etc.) na mesma transação em que foi
-- criado (mesma regra já documentada na migration 0010).
alter type app_role add value 'investidor';

insert into schema_migrations (filename) values ('0039_investidor_role.sql')
on conflict (filename) do nothing;
