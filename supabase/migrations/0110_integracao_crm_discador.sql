-- ============================================================
-- Realizado automático do Dashboard do Negócio (2026-11-11).
-- Fontes: discador 3C Plus (alôs e conexões do Outbound) e Pipefácil (demais
-- etapas dos funis e vendas ganhas). A sincronização roda em
-- /api/sync-integracoes (ver src/lib/integracoes/run.ts) com o service role.
--
--  - crm_deals:       espelho dos leads do Pipefácil de cada negócio (só o que a conta usa);
--  - crm_eventos:     histórico de movimentação (criado, troca de etapa, ganho) — é
--                     dele que sai "quando o lead passou pela etapa";
--  - funil_realizado: realizado por dia/canal/etapa, já calculado, que o dashboard lê;
--  - integracao_estado: marcadores da sincronização (até onde o histórico já foi lido);
--  - vendas.crm_deal_id: venda criada a partir de um Ganho no Pipefácil.
-- ============================================================
set search_path = public;

create table if not exists crm_deals (
  negocio_id uuid not null references negocios(id) on delete cascade,
  deal_id text not null,
  seq integer,
  pipeline_id text,
  stage_id text,
  status text,
  canal text,
  faturamento text,
  cargo text,
  valor numeric,
  mrr numeric,
  nome text,
  empresa text,
  produtos text[],
  responsavel_user_id text,
  closer_user_id text,
  sdr_user_id text,
  criado_em timestamptz,
  fechado_em timestamptz,
  synced_at timestamptz not null default now(),
  primary key (negocio_id, deal_id)
);

create table if not exists crm_eventos (
  id text primary key,
  negocio_id uuid not null references negocios(id) on delete cascade,
  deal_id text not null,
  tipo text not null,
  pipeline_id text,
  stage_id text,
  ocorrido_em timestamptz not null
);
create index if not exists idx_crm_eventos_deal on crm_eventos (negocio_id, deal_id, ocorrido_em);

create table if not exists funil_realizado (
  negocio_id uuid not null references negocios(id) on delete cascade,
  data date not null,
  canal text not null check (canal in ('outbound', 'inbound', 'indicacao')),
  etapa text not null,
  quantidade numeric not null default 0,
  fonte text not null,
  synced_at timestamptz not null default now(),
  primary key (negocio_id, data, canal, etapa)
);
create index if not exists idx_funil_realizado_mes on funil_realizado (negocio_id, data);

create table if not exists integracao_estado (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);

alter table vendas add column if not exists crm_deal_id text;
create unique index if not exists uq_vendas_crm_deal on vendas (negocio_id, crm_deal_id) where crm_deal_id is not null;

-- Só o service role escreve. O realizado do funil é leitura aberta para quem está logado
-- (mesma regra de metas_negocio); espelho e eventos do CRM ficam sem policy (só service role).
alter table crm_deals enable row level security;
alter table crm_eventos enable row level security;
alter table funil_realizado enable row level security;
alter table integracao_estado enable row level security;

drop policy if exists funil_realizado_select on funil_realizado;
create policy funil_realizado_select on funil_realizado for select to authenticated using (true);

insert into schema_migrations (filename) values ('0110_integracao_crm_discador.sql') on conflict (filename) do nothing;
