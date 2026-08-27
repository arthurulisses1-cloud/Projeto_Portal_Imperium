-- ============================================================
-- Fase 2: leads de entrevista, com dado real por lead (não agregado) —
-- pra Closer acompanhar quem entrevistou, lembrar de follow-up/proposta.
-- A aba "Entrevistas" da planilha já tem essas colunas (confirmado pelo
-- Diretor: A, C–K, N, O), só o sync nunca lia — `entrevistas_eventos`
-- (migration 0048) continua existindo do jeito que está, só pra regra de
-- Tribo (agregada, sem lead) — este é um pipeline PARALELO, não substitui.
-- ============================================================

set search_path = public;

create type lead_status_followup as enum (
  'a_contatar', 'em_negociacao', 'proposta_enviada', 'aguardando_documentos', 'esfriou', 'convertido'
);

create table entrevistas_leads (
  id uuid primary key default gen_random_uuid(),
  -- "ID do MSP" quando presente (estável, evita a classe de bug de
  -- "chave com data muda -> duplicata" já resolvida essa sessão pra
  -- weekly_operacoes); fallback textual pras raras linhas sem ID do MSP.
  chave_natural text not null unique,
  data date not null,
  lead_nome text not null,
  lead_telefone text,
  id_msp text,
  sdr_profile_id uuid references profiles(id),
  closer_profile_id uuid references profiles(id),
  canal text,              -- "Por onde foi a entrevista?"
  origem text,
  entrevistado text,
  estado_civil text,
  decisor text,             -- "Quem toma a decisão?"
  dores text,                -- "Dores e necessidades encontradas"
  documentacao_ciente text,  -- "O lead esta ciente das documentações?"
  valores_apresentados text, -- "Os valores foram apresentados?"
  status_followup lead_status_followup not null default 'a_contatar',
  observacao text,
  status_por uuid references profiles(id),
  status_em timestamptz,
  synced_at timestamptz not null default now()
);

create index entrevistas_leads_closer_idx on entrevistas_leads(closer_profile_id);
create index entrevistas_leads_sdr_idx on entrevistas_leads(sdr_profile_id);
create index entrevistas_leads_data_idx on entrevistas_leads(data);

alter table entrevistas_leads enable row level security;

-- Mesmo recorte de time de sempre: dono (SDR ou Closer envolvido),
-- líder do Exército, closer da Tribo, ou Diretor.
create policy entrevistas_leads_select on entrevistas_leads for select using (
  sdr_profile_id = auth.uid()
  or closer_profile_id = auth.uid()
  or is_director()
  or (closer_profile_id is not null and (
    is_closer_of_tribo(profile_tribo_id(closer_profile_id))
    or is_lider_of_exercito(profile_exercito_id(closer_profile_id))
  ))
  or (sdr_profile_id is not null and (
    is_closer_of_tribo(profile_tribo_id(sdr_profile_id))
    or is_lider_of_exercito(profile_exercito_id(sdr_profile_id))
  ))
);

-- Só o status de acompanhamento é editável pela aplicação (o resto vem do
-- sync, com service role, que ignora RLS) — mesmo recorte do select.
create policy entrevistas_leads_update on entrevistas_leads for update using (
  sdr_profile_id = auth.uid()
  or closer_profile_id = auth.uid()
  or is_director()
  or (closer_profile_id is not null and (
    is_closer_of_tribo(profile_tribo_id(closer_profile_id))
    or is_lider_of_exercito(profile_exercito_id(closer_profile_id))
  ))
  or (sdr_profile_id is not null and (
    is_closer_of_tribo(profile_tribo_id(sdr_profile_id))
    or is_lider_of_exercito(profile_exercito_id(sdr_profile_id))
  ))
);

-- ---------- tasks ganha vínculo opcional com um lead ----------
-- Pedido do Diretor (2026-08-27): dá pra "linkar uma atividade a um lead
-- com entrevista feita". on delete set null — apagar o lead (não deveria
-- acontecer via app, só se o sync um dia limpar órfãos) não derruba a
-- tarefa, só solta o vínculo.

alter table tasks add column if not exists lead_id uuid references entrevistas_leads(id) on delete set null;

insert into schema_migrations (filename) values ('0053_entrevistas_leads.sql') on conflict do nothing;
