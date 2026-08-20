-- vendas e weekly_operacoes nascem da MESMA linha da planilha "Assinado"
-- (ver src/lib/sync/assinado.ts e src/lib/sync/weekly.ts) mas eram casadas
-- na hora de EXIBIR por data+valor+cliente — frágil (acento/espaço
-- diferente, arredondamento, cliente homônimo em datas próximas já
-- quebrava o match). Agora o sync grava o vínculo direto por ID.
alter table vendas add column if not exists weekly_operacao_id uuid references weekly_operacoes(id) on delete set null;
create index if not exists idx_vendas_weekly_operacao_id on vendas (weekly_operacao_id);

-- Backfill das linhas que já existiam antes desse vínculo existir — mesmo
-- critério (data + valor + cliente normalizado) que o código usava antes,
-- só que rodado uma vez só aqui. Sync futuro já grava certo desde a origem.
update vendas v
set weekly_operacao_id = w.id
from weekly_operacoes w
where v.weekly_operacao_id is null
  and v.data = w.data
  and v.valor = w.valor
  and lower(trim(coalesce(v.cliente, ''))) = lower(trim(coalesce(w.cliente, '')));

insert into schema_migrations (filename) values ('0032_vendas_weekly_operacao_id.sql')
on conflict (filename) do nothing;
