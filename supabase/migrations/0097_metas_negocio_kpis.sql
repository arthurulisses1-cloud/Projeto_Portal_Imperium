-- ============================================================
-- Multinegócio, parte 2 (Diretor, 2026-11-04):
--  1) meta mensal de recebimento por negócio (painel de 4 quadrantes no Mural);
--  2) indicadores de esforço (KPIs) por negócio/cargo para o Compromisso do dia.
-- Os KPIs vêm do funil de cada negócio (briefing + forecasts). São dados, não
-- código: dá para ajustar rótulos/ordem direto na tabela kpi_definicoes.
-- ============================================================
set search_path = public;

create table if not exists metas_negocio (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  ano integer not null,
  mes integer not null check (mes between 1 and 12),
  meta_recebimento numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (negocio_id, ano, mes)
);

create table if not exists kpi_definicoes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references negocios(id) on delete cascade,
  cargos text[] not null,           -- cargos (profile_negocios.cargo) a quem o KPI se aplica
  chave text not null,
  label text not null,
  ordem integer not null default 0,
  ativo boolean not null default true,
  unique (negocio_id, chave, cargos)
);

create table if not exists compromisso_kpis (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  negocio_id uuid not null references negocios(id) on delete cascade,
  data date not null,
  chave text not null,
  label text not null,
  meta numeric not null default 0,
  realizado numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (profile_id, negocio_id, data, chave)
);
create index if not exists idx_compromisso_kpis_perfil_data on compromisso_kpis (profile_id, data);

alter table metas_negocio enable row level security;
alter table kpi_definicoes enable row level security;
alter table compromisso_kpis enable row level security;

drop policy if exists metas_negocio_select on metas_negocio;
create policy metas_negocio_select on metas_negocio for select to authenticated using (true);
drop policy if exists metas_negocio_diretor on metas_negocio;
create policy metas_negocio_diretor on metas_negocio for all to authenticated
  using (is_director()) with check (is_director());

drop policy if exists kpi_def_select on kpi_definicoes;
create policy kpi_def_select on kpi_definicoes for select to authenticated using (true);
drop policy if exists kpi_def_diretor on kpi_definicoes;
create policy kpi_def_diretor on kpi_definicoes for all to authenticated
  using (is_director()) with check (is_director());

-- Cada um vê e grava só o próprio compromisso; o Diretor vê tudo.
drop policy if exists compromisso_kpis_select on compromisso_kpis;
create policy compromisso_kpis_select on compromisso_kpis for select to authenticated
  using (profile_id = auth.uid() or is_director());
drop policy if exists compromisso_kpis_insert on compromisso_kpis;
create policy compromisso_kpis_insert on compromisso_kpis for insert to authenticated
  with check (profile_id = auth.uid());
drop policy if exists compromisso_kpis_update on compromisso_kpis;
create policy compromisso_kpis_update on compromisso_kpis for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------- Seed dos KPIs de esforço ----------
-- Prospecção (BDR, SDR, pré-vendas): abre a porta. Venda (executivo, closer,
-- head): leva até o fechamento. Vorp chama a 1ª etapa de "Tentativas".
do $$
declare
  prosp text[] := array['bdr', 'sdr', 'pre_vendas'];
  venda text[] := array['executivo', 'closer', 'head', 'gestor'];
  n record;
  primeira text;
begin
  for n in select id, slug from negocios where slug in ('vorp', 'vorp-finance', 'matchsales', 'vorp-energy') loop
    primeira := case when n.slug = 'vorp' then 'Tentativas' else 'Alôs' end;

    insert into kpi_definicoes (negocio_id, cargos, chave, label, ordem) values
      (n.id, prosp, 'alos', primeira, 1),
      (n.id, prosp, 'conexoes', 'Conexões', 2),
      (n.id, prosp, 'agendadas', 'Reuniões agendadas', 3),
      (n.id, prosp, 'realizadas', 'Reuniões realizadas', 4)
    on conflict do nothing;

    -- Vorp e Energy separam quem prospecta de quem fecha; no Finance e no
    -- MatchSales o executivo prospecta e vende (funil completo).
    if n.slug in ('vorp-finance', 'matchsales') then
      insert into kpi_definicoes (negocio_id, cargos, chave, label, ordem) values
        (n.id, venda, 'alos', primeira, 1),
        (n.id, venda, 'conexoes', 'Conexões', 2),
        (n.id, venda, 'agendadas', 'Reuniões agendadas', 3),
        (n.id, venda, 'realizadas', 'Reuniões realizadas', 4),
        (n.id, venda, 'propostas', 'Propostas enviadas', 5),
        (n.id, venda, 'vendas', 'Vendas fechadas', 6)
      on conflict do nothing;
    else
      insert into kpi_definicoes (negocio_id, cargos, chave, label, ordem) values
        (n.id, venda, 'realizadas', 'Reuniões realizadas', 1),
        (n.id, venda, 'propostas', 'Propostas enviadas', 2),
        (n.id, venda, 'vendas', 'Vendas fechadas', 3)
      on conflict do nothing;
    end if;

    -- Energia por assinatura: a conta de energia + RG precisa subir para o compliance.
    if n.slug = 'vorp-energy' then
      insert into kpi_definicoes (negocio_id, cargos, chave, label, ordem) values
        (n.id, array['pre_vendas', 'closer', 'head'], 'contas_subidas', 'Contas subidas p/ análise', 5)
      on conflict do nothing;
    end if;
  end loop;
end $$;

insert into schema_migrations (filename) values ('0097_metas_negocio_kpis.sql') on conflict (filename) do nothing;
