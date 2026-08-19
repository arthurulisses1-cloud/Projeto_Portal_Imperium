set search_path = public;

-- Espelha 1:1 a aba "Assinado" da planilha (uma linha por operação, com
-- SDR + Closer juntos e o status real: PAGO/CAIU/REANÁLISE/ASSINADO/
-- DESISTIU) — fonte da Weekly de Receita. Deliberadamente separada de
-- `vendas`/`producao_funil`: aquelas assumem "só dinheiro pago" em vários
-- lugares (comissão, ranking, guerra de exércitos); misturar status aqui
-- corromperia esses cálculos. `weekly_operacoes` existe só pro painel.
create table weekly_operacoes (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  sdr_profile_id uuid references profiles(id) on delete set null,
  closer_profile_id uuid references profiles(id) on delete set null,
  cliente text,
  valor numeric not null default 0,
  faturamento numeric not null default 0,
  produto text,
  origem text,
  status text not null,
  synced_at timestamptz not null default now()
);
create index idx_weekly_operacoes_data on weekly_operacoes (data);

alter table weekly_operacoes enable row level security;

-- Só líderes e Diretor veem a Weekly de Receita.
create policy weekly_operacoes_select_lideres on weekly_operacoes for select
  using (exists (
    select 1 from profiles where id = auth.uid() and role in ('lider', 'diretor')
  ));
