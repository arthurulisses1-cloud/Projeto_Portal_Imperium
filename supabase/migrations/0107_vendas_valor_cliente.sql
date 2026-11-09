-- ============================================================
-- Vorp Finance (precatórios), correção do Diretor em 2026-11-09:
-- a comissão passa a ter duas camadas.
--   1) Comissão base: valor pago ao cliente x 6% (margem base); 25% dessa margem é
--      distribuído (com executivo 10/10/5; sem executivo, líder vendendo, 15/10).
--   2) Deságio: o que a comissão recebida (vendas.valor) exceder a margem base
--      (com executivo 20/15/15; sem executivo 20/20).
-- Para isso cada venda do Finance registra o valor pago ao cliente.
-- Vendas antigas sem o campo seguem sem deságio, com 25% sobre o valor recebido.
-- ============================================================
set search_path = public;

alter table vendas add column if not exists valor_cliente numeric check (valor_cliente is null or valor_cliente > 0);

insert into schema_migrations (filename) values ('0107_vendas_valor_cliente.sql') on conflict (filename) do nothing;
