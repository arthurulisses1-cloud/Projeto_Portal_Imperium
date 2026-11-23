-- ============================================================
-- Canal Eventos (23/11/2026): os leads do [Vorp] Listas Eventos ganham funil próprio no Dashboard e somam
-- no Pace, nos rankings, na Auditoria e na RQA. Sem isto o banco recusa o canal nas duas tabelas.
-- ============================================================
alter table funil_realizado drop constraint if exists funil_realizado_canal_check;
alter table funil_realizado add constraint funil_realizado_canal_check check (canal in ('outbound', 'inbound', 'indicacao', 'eventos'));
alter table vendas drop constraint if exists vendas_canal_check;
alter table vendas add constraint vendas_canal_check check (canal in ('outbound', 'inbound', 'indicacao', 'alternativo', 'eventos'));

insert into schema_migrations (filename) values ('0123_canal_eventos.sql') on conflict (filename) do nothing;
