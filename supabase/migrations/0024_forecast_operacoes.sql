set search_path = public;

-- weekly_operacoes até aqui era apagada e recriada inteira a cada sync
-- (sem chave estável por linha). Isso quebra o Forecast: o status manual e a
-- observação que o closer preenche precisam sobreviver ao próximo sync.
-- Recria com uma chave natural (data+sdr+closer+valor+cliente) e o sync
-- passa a fazer upsert nela em vez de apagar+recriar.
drop table if exists weekly_operacoes;

create table weekly_operacoes (
  id uuid primary key default gen_random_uuid(),
  chave_natural text not null unique,
  data date not null,
  sdr_profile_id uuid references profiles(id) on delete set null,
  closer_profile_id uuid references profiles(id) on delete set null,
  cliente text,
  valor numeric not null default 0,
  faturamento numeric not null default 0,
  produto text,
  origem text,
  status text not null,
  -- Catálogo de Forecast — preenchido manualmente pelo closer/líder/diretor,
  -- nunca pelo sync (por isso fica de fora do upsert automático).
  status_manual text check (status_manual in ('resolvendo_pendencia', 'aguardando_pagamento')),
  observacao text,
  status_manual_por uuid references profiles(id),
  status_manual_em timestamptz,
  synced_at timestamptz not null default now()
);
create index idx_weekly_operacoes_data on weekly_operacoes (data);
create index idx_weekly_operacoes_sdr on weekly_operacoes (sdr_profile_id);
create index idx_weekly_operacoes_closer on weekly_operacoes (closer_profile_id);

alter table weekly_operacoes enable row level security;

-- Líder e Diretor veem tudo; Closer/SDR veem pelo menos as próprias operações
-- (necessário pro Forecast do closer, que é escopado só nos assinados dele).
create policy weekly_operacoes_select on weekly_operacoes for select
  using (
    exists (select 1 from profiles where id = auth.uid() and role in ('lider', 'diretor'))
    or closer_profile_id = auth.uid()
    or sdr_profile_id = auth.uid()
  );
