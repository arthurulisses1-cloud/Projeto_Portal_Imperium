-- Match Sales: venda em dupla. O co-responsável do lead no Pipefácil divide com o responsável a comissão do fechamento.
alter table vendas add column if not exists co_closer_id uuid references profiles(id) on delete set null;

insert into schema_migrations (filename) values ('0121_vendas_co_closer.sql')
on conflict (filename) do nothing;
