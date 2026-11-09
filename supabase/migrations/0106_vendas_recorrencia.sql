-- ============================================================
-- Recorrência da Maximus Energy (Sunne), definida pelo Diretor em 2026-11-09:
-- a receita recorrente se divide em 30% executivos, 25% lideranças e 45% Vorp.
-- O percentual da recorrência varia por negociação (3% a 15% da fatura do
-- cliente), então cada recebimento é lançado com o valor efetivamente recebido
-- e, só como referência, o % negociado.
-- ============================================================
set search_path = public;

alter table vendas add column if not exists recorrencia boolean not null default false;
alter table vendas add column if not exists recorrencia_pct numeric check (recorrencia_pct is null or (recorrencia_pct > 0 and recorrencia_pct <= 100));

insert into schema_migrations (filename) values ('0106_vendas_recorrencia.sql') on conflict (filename) do nothing;
