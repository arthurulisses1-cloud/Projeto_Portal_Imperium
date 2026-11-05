-- ============================================================
-- Dashboard do negócio (Diretor, 2026-11-05): o Head passa a ler o compromisso
-- (KPIs de esforço) de quem é do negócio que ele chefia.
-- ============================================================
set search_path = public;

drop policy if exists compromisso_kpis_head_select on compromisso_kpis;
create policy compromisso_kpis_head_select on compromisso_kpis for select to authenticated
  using (is_head_do_negocio(negocio_id));

insert into schema_migrations (filename) values ('0104_compromisso_kpis_head.sql') on conflict (filename) do nothing;
