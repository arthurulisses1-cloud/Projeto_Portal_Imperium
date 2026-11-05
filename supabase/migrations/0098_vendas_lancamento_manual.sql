-- ============================================================
-- Lançamento manual de vendas por negócio (Diretor, 2026-11-05).
-- Enquanto a integração com o Pipefácil não existe, o Diretor e o Head de
-- cada negócio registram os valores recebidos na tela "Lançar Vendas".
-- A sincronização da planilha do Matri só mexe em vendas do negócio Matri
-- (ver src/lib/sync/run.ts), então lançamento manual nunca é apagado por ela.
-- ============================================================
set search_path = public;

alter table vendas add column if not exists lancamento_manual boolean not null default false;
alter table vendas add column if not exists lancado_por uuid references profiles(id);
alter table vendas add column if not exists produto text;
alter table vendas add column if not exists indicador_id uuid references profiles(id); -- indicação entre negócios: quem indica entra como SDR
alter table vendas add column if not exists observacao text;

-- Head de um negócio (cargo head em profile_negocios).
create or replace function is_head_do_negocio(alvo uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profile_negocios
    where profile_id = auth.uid() and negocio_id = alvo and cargo = 'head'
  );
$$;

drop policy if exists vendas_manual_insert on vendas;
create policy vendas_manual_insert on vendas for insert to authenticated
  with check (
    lancamento_manual
    and lancado_por = auth.uid()
    and negocio_id is not null
    and (is_director() or is_head_do_negocio(negocio_id))
  );

drop policy if exists vendas_manual_delete on vendas;
create policy vendas_manual_delete on vendas for delete to authenticated
  using (lancamento_manual and (is_director() or is_head_do_negocio(negocio_id)));

insert into schema_migrations (filename) values ('0098_vendas_lancamento_manual.sql') on conflict (filename) do nothing;
