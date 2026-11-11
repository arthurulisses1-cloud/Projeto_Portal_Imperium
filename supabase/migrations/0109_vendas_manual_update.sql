-- ============================================================
-- Editar lançamentos manuais de vendas (Diretor, 2026-11-11): Diretor e Head do
-- negócio podem corrigir os lançamentos manuais (ex.: incluir kWh depois).
-- ============================================================
set search_path = public;

drop policy if exists vendas_manual_update on vendas;
create policy vendas_manual_update on vendas for update to authenticated
  using (lancamento_manual and (is_director() or is_head_do_negocio(negocio_id)))
  with check (lancamento_manual and negocio_id is not null and (is_director() or is_head_do_negocio(negocio_id)));

insert into schema_migrations (filename) values ('0109_vendas_manual_update.sql') on conflict (filename) do nothing;
