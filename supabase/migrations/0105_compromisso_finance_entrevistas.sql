-- ============================================================
-- Vorp Finance: Compromisso do dia e dashboard com Entrevistas e Subidos
-- (como era no Matri) — Diretor, 2026-11-05.
-- ============================================================
set search_path = public;

insert into kpi_definicoes (negocio_id, cargos, chave, label, ordem, ativo)
select n.id, array['head','executivo','closer','sdr','bdr','pre_vendas','gestor','outro']::text[], k.chave, k.label, k.ordem, true
from negocios n
join (values ('entrevistas', 'Entrevistas', 1), ('subidos', 'Subidos', 2)) as k(chave, label, ordem) on true
where n.slug = 'vorp-finance'
on conflict (negocio_id, chave, cargos) do update set label = excluded.label, ordem = excluded.ordem, ativo = true;

insert into schema_migrations (filename) values ('0105_compromisso_finance_entrevistas.sql') on conflict (filename) do nothing;
