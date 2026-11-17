-- ============================================================
-- Vendas de canais alternativos (17/11/2026): os funis com taxas são só Outbound, Inbound (Tráfego Pago)
-- e Referidos (indicação pega na call). Venda de qualquer outro canal (Social Selling, Google, Parceiros,
-- Indicação de cliente/investidor, Network, Eventos…) entra como "alternativo", com o canal do CRM em
-- canal_origem, e soma no recebido.
-- ============================================================
alter table vendas drop constraint if exists vendas_canal_check;
alter table vendas add constraint vendas_canal_check check (canal in ('outbound', 'inbound', 'indicacao', 'alternativo'));
alter table vendas add column if not exists canal_origem text;

insert into schema_migrations (filename) values ('0115_vendas_canal_alternativo.sql') on conflict (filename) do nothing;
