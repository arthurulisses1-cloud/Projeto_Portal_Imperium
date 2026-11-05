-- ============================================================
-- Compromisso do dia simples (Diretor, 2026-11-05):
--   Vorp e MatchSales: Reuniões agendadas + Reuniões realizadas
--   Vorp Finance:      Subidos
--   Vorp Energy:       Contas subidas + Reuniões realizadas
-- Vale para todos os cargos do negócio. Os indicadores antigos ficam
-- desativados (não apagados), para o histórico de compromisso_kpis seguir legível.
-- ============================================================
set search_path = public;

update kpi_definicoes set ativo = false
where negocio_id in (select id from negocios where slug in ('vorp', 'matchsales', 'vorp-finance', 'vorp-energy'));

insert into kpi_definicoes (negocio_id, cargos, chave, label, ordem, ativo)
select n.id, c.cargos, k.chave, k.label, k.ordem, true
from negocios n
join (values
  ('vorp',         'reunioes_agendadas', 'Reuniões agendadas', 1),
  ('vorp',         'reunioes_realizadas', 'Reuniões realizadas', 2),
  ('matchsales',   'reunioes_agendadas', 'Reuniões agendadas', 1),
  ('matchsales',   'reunioes_realizadas', 'Reuniões realizadas', 2),
  ('vorp-finance', 'subidos', 'Subidos', 1),
  ('vorp-energy',  'contas_subidas', 'Contas subidas', 1),
  ('vorp-energy',  'reunioes_realizadas', 'Reuniões realizadas', 2)
) as k(slug, chave, label, ordem) on k.slug = n.slug
cross join (select array['head','executivo','closer','sdr','bdr','pre_vendas','gestor','outro']::text[] as cargos) c
on conflict (negocio_id, chave, cargos) do update set label = excluded.label, ordem = excluded.ordem, ativo = true;

insert into schema_migrations (filename) values ('0101_compromisso_simples.sql') on conflict (filename) do nothing;
