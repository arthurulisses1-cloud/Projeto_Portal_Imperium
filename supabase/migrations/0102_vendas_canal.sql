-- ============================================================
-- Canal da venda (Diretor, 2026-11-05): a comissão da Vorp e da MatchSales muda
-- conforme a venda veio de outbound, inbound ou indicação.
-- vendas.indicador_id (já existente) passa a significar "SDR/BDR/indicador da
-- venda": quem prospectou ou indicou entra como SDR, quem fecha como closer.
-- ============================================================
set search_path = public;

alter table vendas add column if not exists canal text check (canal in ('outbound', 'inbound', 'indicacao'));

insert into schema_migrations (filename) values ('0102_vendas_canal.sql') on conflict (filename) do nothing;
