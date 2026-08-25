set search_path = public;

-- Até aqui, cada entrevista virava 2 créditos SOLTOS em producao_funil (um
-- pro SDR, um pro Closer) sem guardar que os dois vieram da MESMA entrevista
-- — suficiente pra produção individual, mas impossível de usar pra saber se
-- SDR e Closer eram da mesma Tribo (regra de negócio do Diretor, 2026-08-25:
-- "produção da Tribo" só conta quando SDR e Closer são da mesma Tribo;
-- senão é "Fora da Tribo"). Essa tabela nova guarda o PAR (SDR+Closer) de
-- cada entrevista, pra Minha Produção do Líder aplicar essa regra.
-- producao_funil (etapa='entrevistas') continua existindo do jeito que
-- está, pra produção individual — essa tabela é só pra atribuição de Tribo.
create table entrevistas_eventos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  sdr_profile_id uuid references profiles(id) on delete set null,
  closer_profile_id uuid references profiles(id) on delete set null,
  quantidade integer not null default 1,
  synced_at timestamptz not null default now()
);
create index idx_entrevistas_eventos_data on entrevistas_eventos (data);
create index idx_entrevistas_eventos_sdr on entrevistas_eventos (sdr_profile_id);
create index idx_entrevistas_eventos_closer on entrevistas_eventos (closer_profile_id);

alter table entrevistas_eventos enable row level security;

-- Mesmo padrão de producao_funil/vendas: visível pra todo mundo autenticado,
-- escrita só pelo sync (service role, ignora RLS).
create policy entrevistas_eventos_select_all on entrevistas_eventos for select using (true);

insert into schema_migrations (filename) values ('0048_entrevistas_eventos.sql')
on conflict (filename) do nothing;
